// EshyBrand LMS - document editor (keeps the Word document's own formatting)

const SUPABASE_URL = 'https://pjytyuhpubzuxbftuyqz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jgggDCLJA5EjSkhjnJ7hBQ_rr5nolsm';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const docId = new URLSearchParams(window.location.search).get('doc');
const editor = document.getElementById('editor');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('saveBtn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');

// How the Word file is drawn on the page
const DOCX_OPTIONS = {
  className: 'docx',
  inWrapper: true,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  breakPages: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  useBase64URL: true
};

let user = null;
let docRow = null;
let dirty = false;
let saving = false;
let locked = false;

function setStatus(text) { statusEl.textContent = text; }
function markDirty() { dirty = true; setStatus('Unsaved changes'); }

function lockEditor() {
  locked = true;
  editor.contentEditable = 'false';
  saveBtn.style.display = 'none';
  submitBtn.style.display = 'none';
  resetBtn.style.display = 'none';
  // Hide only the formatting buttons so zoom stays available when viewing
  document.getElementById('fmt').style.display = 'none';
  document.getElementById('banner').style.display = 'block';
  setStatus('');
}

// Draw the original Word file with its real formatting
async function renderOriginal() {
  const { data: blob, error } = await sb.storage.from('documents').download(docRow.file_path);
  if (error) throw error;
  editor.innerHTML = '';
  editor.classList.remove('legacy');
  editor.style.display = 'block';
  await docx.renderAsync(await blob.arrayBuffer(), editor, null, DOCX_OPTIONS);
}

// ---------- PDF documents (read only) ----------
async function showPdf() {
  const { data, error } = await sb.storage.from('documents').createSignedUrl(docRow.file_path, 3600);
  if (error) throw error;

  locked = true; // nothing to save for a PDF
  ['saveBtn', 'submitBtn', 'resetBtn', 'wordBtn', 'tools'].forEach((id) => {
    document.getElementById(id).style.display = 'none';
  });

  const open = document.createElement('a');
  open.className = 'btn fill';
  open.href = data.signedUrl;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = 'Open / download PDF';
  open.style.marginBottom = '10px';

  const frame = document.createElement('iframe');
  frame.src = data.signedUrl;
  frame.title = docRow.title;
  frame.style.cssText = 'width:100%;height:80vh;border:0;background:#fff';

  editor.contentEditable = 'false';
  editor.replaceChildren(open, frame);
  editor.style.display = 'block';
  document.getElementById('loading').style.display = 'none';
}

// ---------- Cover page background ----------
// docx-preview cannot draw grouped pictures (the full-page cover design), so
// cover.jpg (a flat copy of that design) is placed behind the first page.
async function addCover() {
  const page = editor.querySelector('section.docx');
  if (!page || page.style.backgroundImage) return;
  try {
    const original = await sb.storage.from('documents').download(docRow.file_path);
    if (original.error) return;
    const zip = await JSZip.loadAsync(await original.data.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const start = xml.slice(0, 30000);
    if (!start.includes('<wpg:wgp') || !start.includes('behindDoc="1"')) return;

    const res = await fetch('cover.jpg');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    page.style.backgroundImage = 'url("' + url + '")';
    page.style.backgroundRepeat = 'no-repeat';
    page.style.backgroundPosition = 'top center';
    page.style.backgroundSize = '100% auto';
  } catch (err) {
    console.warn('Cover not added:', err);
  }
}

// Open the learner's previously saved copy
function loadSaved(html) {
  editor.innerHTML = DOMPurify.sanitize(html, { ADD_TAGS: ['style'], FORCE_BODY: true });
  editor.classList.toggle('legacy', !editor.querySelector('.docx-wrapper'));
  editor.style.display = 'block';
}

async function init() {
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return (window.location.href = 'login.html');
  user = s.session.user;
  if (!docId) return (window.location.href = 'dashboard.html');

  const { data: d, error: dErr } = await sb.from('documents').select('*').eq('id', docId).single();
  if (dErr || !d) {
    document.getElementById('loading').textContent = 'Document not found.';
    return;
  }
  docRow = d;
  document.getElementById('docTitle').textContent = d.title;
  document.title = d.title + ' - EshyBrand LMS';

  if (/\.pdf$/i.test(d.file_path)) {
    try {
      await showPdf();
    } catch (err) {
      document.getElementById('loading').textContent = 'Could not open the document: ' + err.message;
    }
    return;
  }

  const { data: sub } = await sb.from('submissions').select('*')
    .eq('user_id', user.id).eq('document_id', docId).maybeSingle();

  try {
    if (sub && sub.file_path) {
      const { data: blob, error } = await sb.storage.from('submissions').download(sub.file_path);
      if (error) throw error;
      loadSaved(await blob.text());
    } else {
      await renderOriginal();
    }
    await addCover();
  } catch (err) {
    document.getElementById('loading').textContent = 'Could not open the document: ' + err.message;
    return;
  }

  document.getElementById('loading').style.display = 'none';

  // Start fitted to the screen on phones
  if (window.matchMedia('(max-width:700px)').matches) fitZoom();

  if (sub && sub.status === 'submitted') {
    lockEditor();
  } else {
    setStatus(sub ? 'Saved' : 'Not saved yet');
    editor.addEventListener('input', markDirty);
  }
}

// ---------- Save and submit ----------
async function save(status, silent) {
  if (saving || locked) return false;
  saving = true;
  if (!silent) saveBtn.disabled = true;
  setStatus('Saving...');

  const path = user.id + '/' + docId + '.html';
  const blob = new Blob([editor.innerHTML], { type: 'text/html' });

  const { error: upErr } = await sb.storage.from('submissions').upload(path, blob, {
    upsert: true,
    contentType: 'text/html'
  });
  let dbErr = null;
  if (!upErr) {
    const res = await sb.from('submissions').upsert({
      user_id: user.id,
      document_id: docId,
      file_path: path,
      status: status,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,document_id' });
    dbErr = res.error;
  }

  saving = false;
  saveBtn.disabled = false;

  if (upErr || dbErr) {
    setStatus('Save failed: ' + (upErr || dbErr).message);
    return false;
  }
  dirty = false;
  setStatus('Saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return true;
}

saveBtn.addEventListener('click', () => save('in_progress', false));

submitBtn.addEventListener('click', async () => {
  if (!confirm('Submit this document? You will not be able to edit it after submitting.')) return;
  submitBtn.disabled = true;
  if (await save('submitted', false)) {
    lockEditor();
    alert('Your work has been submitted.');
    window.location.href = 'dashboard.html';
  } else {
    submitBtn.disabled = false;
  }
});

// Start over: replace the saved copy with a fresh copy of the original document
resetBtn.addEventListener('click', async () => {
  if (!confirm('Start over? Everything you typed in this document will be replaced with the original blank document.')) return;
  setStatus('Reloading original...');
  try {
    await renderOriginal();
    await addCover();
    if (fitMode) fitZoom();
    markDirty();
  } catch (err) {
    setStatus('Could not reload: ' + err.message);
  }
});

// Autosave every minute when there are changes
setInterval(() => { if (dirty && !locked) save('in_progress', true); }, 60000);

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (dirty && !locked) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Toolbar (formatting buttons only) ----------
document.querySelectorAll('#fmt button').forEach((b) => {
  b.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep the text selection
    document.execCommand(b.dataset.cmd);
    markDirty();
  });
});

// ---------- Zoom ----------
// Zoom is applied to #editor itself (not the .docx-wrapper inside it),
// so the zoom style is never part of editor.innerHTML and never gets saved.
let zoomLevel = 1;
let fitMode = false;

function applyZoom(z) {
  zoomLevel = Math.min(3, Math.max(0.3, z));
  editor.style.zoom = zoomLevel;
}

function fitZoom() {
  fitMode = true;
  editor.style.zoom = 1; // measure at 100%
  const page = editor.parentElement;
  const cs = getComputedStyle(page);
  const available = page.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);

  let natural = 0;
  const wrapper = editor.querySelector('.docx-wrapper');
  if (wrapper) {
    const pad = parseFloat(getComputedStyle(wrapper).paddingLeft) || 0;
    wrapper.querySelectorAll('section').forEach((s) => {
      natural = Math.max(natural, s.offsetWidth + pad * 2);
    });
  }
  if (!natural) natural = editor.scrollWidth;

  applyZoom(natural > 0 ? Math.min(1, available / natural) : 1);
}

document.getElementById('zIn').addEventListener('click', () => { fitMode = false; applyZoom(zoomLevel + 0.1); });
document.getElementById('zOut').addEventListener('click', () => { fitMode = false; applyZoom(zoomLevel - 0.1); });
document.getElementById('zFit').addEventListener('click', fitZoom);

// Keep "fit" in effect when the phone is rotated or the window resized
window.addEventListener('resize', () => { if (fitMode) fitZoom(); });

// ---------- Download as Word ----------
// Word does not show pictures embedded as "data:" links in an HTML .doc file,
// so each picture is packed into the file as a separate part (MHTML).
function toBase64(text) {
  let bin = '';
  new TextEncoder().encode(text).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
const wrap76 = (s) => s.replace(/.{76}/g, '$&\r\n');

function buildWordFile(title) {
  const copy = editor.cloneNode(true);
  const shown = editor.querySelectorAll('img');
  const boundary = '----=_EshyBrandPart';
  const parts = [];

  copy.querySelectorAll('img').forEach((img, i) => {
    // Give Word the size the picture has on screen
    if (shown[i].offsetWidth) {
      img.setAttribute('width', shown[i].offsetWidth);
      img.setAttribute('height', shown[i].offsetHeight);
      img.style.width = shown[i].offsetWidth + 'px';
      img.style.height = shown[i].offsetHeight + 'px';
    }
    const m = /^data:([^;,]*);base64,(.*)$/s.exec(img.getAttribute('src') || '');
    if (!m) return;
    const location = 'file:///C:/eshybrand/image' + i;
    img.setAttribute('src', location);
    parts.push('--' + boundary + '\r\nContent-Location: ' + location +
      '\r\nContent-Type: ' + (m[1] || 'image/png') +
      '\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap76(m[2]) + '\r\n');
  });

  const html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><title>' + title.replace(/[<>&]/g, '') + '</title></head><body>' +
    copy.innerHTML + '</body></html>';

  return 'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="' + boundary + '"\r\n\r\n' +
    '--' + boundary + '\r\nContent-Location: file:///C:/eshybrand/document.htm' +
    '\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    wrap76(toBase64(html)) + '\r\n' + parts.join('') + '--' + boundary + '--\r\n';
}

document.getElementById('wordBtn').addEventListener('click', () => {
  const blob = new Blob([buildWordFile(docRow.title)], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = docRow.title.replace(/[^a-zA-Z0-9 _-]/g, '') + '.doc';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

init();
