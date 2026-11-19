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
  document.getElementById('tools').style.display = 'none';
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
  } catch (err) {
    document.getElementById('loading').textContent = 'Could not open the document: ' + err.message;
    return;
  }

  document.getElementById('loading').style.display = 'none';

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

// ---------- Toolbar ----------
document.querySelectorAll('#tools button').forEach((b) => {
  b.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep the text selection
    document.execCommand(b.dataset.cmd);
    markDirty();
  });
});

// ---------- Download as Word ----------
document.getElementById('wordBtn').addEventListener('click', () => {
  const html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><title>' + docRow.title.replace(/</g, '') + '</title></head><body>' +
    editor.innerHTML + '</body></html>';
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = docRow.title.replace(/[^a-zA-Z0-9 _-]/g, '') + '.doc';
  a.click();
  URL.revokeObjectURL(a.href);
});

init();