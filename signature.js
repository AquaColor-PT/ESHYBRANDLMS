// EshyBrand LMS - draw a signature and place it in the document
// Loaded after editor.js (uses its editor, locked and markDirty).
(() => {
  const openBtn = document.getElementById('signBtn');
  const box = document.getElementById('signBox');
  const pad = document.getElementById('signPad');
  const note = document.getElementById('signNote');
  const ctx = pad.getContext('2d');
  let place = null;   // where the cursor was in the document
  let drawing = false;
  let hasInk = false;

  // Remember the last cursor position inside the document
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode) && sel.anchorNode !== editor) {
      place = sel.getRangeAt(0).cloneRange();
    }
  });

  function clearPad() {
    ctx.clearRect(0, 0, pad.width, pad.height);
    hasInk = false;
  }
  function point(e) {
    const r = pad.getBoundingClientRect();
    return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height];
  }

  pad.addEventListener('pointerdown', (e) => {
    drawing = true;
    pad.setPointerCapture(e.pointerId);
    ctx.lineWidth = 3;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = '#10206b';
    ctx.beginPath();
    ctx.moveTo(...point(e));
  });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    ctx.lineTo(...point(e));
    ctx.stroke();
    hasInk = true;
  });
  ['pointerup', 'pointercancel'].forEach((n) => pad.addEventListener(n, () => { drawing = false; }));

  openBtn.addEventListener('click', () => {
    if (locked) return;
    if (!place || !editor.contains(place.startContainer)) {
      return alert('First tap on the signature line in the document, then press Sign.');
    }
    clearPad();
    note.textContent = '';
    box.style.display = 'flex';
  });

  document.getElementById('signClear').addEventListener('click', clearPad);
  document.getElementById('signCancel').addEventListener('click', () => { box.style.display = 'none'; });

  document.getElementById('signAdd').addEventListener('click', () => {
    if (!hasInk) { note.textContent = 'Please draw your signature first.'; return; }
    const img = document.createElement('img');
    img.src = pad.toDataURL('image/png');
    img.alt = 'Signature';
    img.width = 150;
    img.height = 50;
    img.style.cssText = 'width:150px;height:50px;vertical-align:bottom';
    place.collapse(false);
    place.insertNode(img);
    place.setStartAfter(img);
    place.collapse(true);
    box.style.display = 'none';
    markDirty();
  });
})();
