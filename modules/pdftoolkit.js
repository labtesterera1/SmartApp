/* ============================================================
   modules/pdftoolkit.js  — PDF Toolkit (v1.0)
   Fully offline PDF utilities:
   ─ Convert  : JPG/PNG/DOC(X) → PDF
                (DOC/DOCX cannot be converted in-browser — LAUNCH
                 button opens/downloads the raw file for the OS or
                 Word/LibreOffice to handle locally instead)
   ─ Merge    : combine multiple PDFs into one
   ─ Split    : extract page ranges / split into separate PDFs
   ─ Edit     : reorder, rotate, delete pages
   ─ Reduce   : shrink PDF file size by re-rendering pages as
                compressed JPEG images at a chosen quality/DPI
   Libraries used (all offline, no network calls):
   ─ pdf-lib    → create / merge / split / edit PDFs
   ─ pdf.js     → render PDF pages to canvas (preview + reduce)
   ============================================================ */

import { toast } from '../core/ui.js';

let _root = null;
let _screen = 'home'; // home | convert | merge | split | edit | reduce
let PDFLibMod = null;  // lazy-loaded
let pdfjsMod  = null;  // lazy-loaded

export default {
  id: 'pdftoolkit',
  name: 'PDF Toolkit',
  tagline: 'convert · merge · split · edit · reduce',
  status: 'ready',

  render(root) {
    _root = root;
    _screen = 'home';
    renderScreen();
  },

  cleanup() { _root = null; },
};

/* ============================================================
   Lazy library loaders — only fetched when actually needed,
   keeps the app's initial load light.
   ============================================================ */
async function ensurePDFLib() {
  if (!PDFLibMod) PDFLibMod = await import('../vendor/pdf-lib.esm.min.js');
  return PDFLibMod;
}
async function ensurePdfJs() {
  if (!pdfjsMod) {
    pdfjsMod = await import('../vendor/pdf.min.mjs');
    pdfjsMod.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.mjs';
  }
  return pdfjsMod;
}

/* ============================================================
   Screen router
   ============================================================ */
function renderScreen() {
  switch (_screen) {
    case 'convert': return renderConvert();
    case 'merge':    return renderMerge();
    case 'split':    return renderSplit();
    case 'edit':     return renderEdit();
    case 'reduce':   return renderReduce();
    case 'unlock':   return renderUnlock();
    default:         return renderHome();
  }
}

function goHome() { _screen = 'home'; renderScreen(); }

/* ============================================================
   HOME — tool picker
   ============================================================ */
function renderHome() {
  _root.innerHTML = `
    <div class="pdfk-wrap">
      <div class="pdfk-tool-grid">
        <button class="pdfk-tool-card" data-tool="convert">
          <div class="pdfk-tool-icon">🔄</div>
          <div class="pdfk-tool-name">Convert</div>
          <div class="pdfk-tool-desc">JPG / PNG → PDF<br>DOC(X) → Launch externally</div>
        </button>
        <button class="pdfk-tool-card" data-tool="merge">
          <div class="pdfk-tool-icon">🧩</div>
          <div class="pdfk-tool-name">Merge</div>
          <div class="pdfk-tool-desc">Combine multiple PDFs into one</div>
        </button>
        <button class="pdfk-tool-card" data-tool="split">
          <div class="pdfk-tool-icon">✂️</div>
          <div class="pdfk-tool-name">Split</div>
          <div class="pdfk-tool-desc">Extract pages or split apart</div>
        </button>
        <button class="pdfk-tool-card" data-tool="edit">
          <div class="pdfk-tool-icon">✏️</div>
          <div class="pdfk-tool-name">Edit</div>
          <div class="pdfk-tool-desc">Reorder, rotate, delete pages</div>
        </button>
        <button class="pdfk-tool-card" data-tool="reduce">
          <div class="pdfk-tool-icon">📉</div>
          <div class="pdfk-tool-name">Reduce Size</div>
          <div class="pdfk-tool-desc">Shrink file size, adjustable quality</div>
        </button>
        <button class="pdfk-tool-card" data-tool="unlock">
          <div class="pdfk-tool-icon">🔓</div>
          <div class="pdfk-tool-name">Unlock</div>
          <div class="pdfk-tool-desc">Remove password protection<br>(if you know the password)</div>
        </button>
      </div>
      <div class="pdfk-note">All processing happens on this device. Nothing is uploaded anywhere.</div>
    </div>
  `;
  _root.querySelectorAll('.pdfk-tool-card').forEach(btn => {
    btn.onclick = () => { _screen = btn.dataset.tool; renderScreen(); };
  });
}

/* ============================================================
   Shared: file picker zone
   ============================================================ */
function pickerZone(opts) {
  const { id, label, accept, multiple } = opts;
  return `
    <div class="pdfk-drop-zone" id="${id}-zone">
      <input type="file" id="${id}" accept="${accept}" ${multiple?'multiple':''} hidden>
      <div class="pdfk-drop-icon">📁</div>
      <div class="pdfk-drop-label">${label}</div>
      <button class="btn btn--primary" id="${id}-btn">SELECT FILE${multiple?'S':''}</button>
    </div>
  `;
}
function wirePickerZone(container, id, onFiles) {
  const input = container.querySelector(`#${id}`);
  const btn   = container.querySelector(`#${id}-btn`);
  const zone  = container.querySelector(`#${id}-zone`);
  btn.onclick = () => input.click();
  input.onchange = (e) => {
    const files = Array.from(e.target.files||[]);
    input.value = '';
    if (files.length) onFiles(files);
  };
  // basic drag & drop support
  ['dragover','dragleave','drop'].forEach(evt => {
    zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
  });
  zone.addEventListener('dragover', () => zone.classList.add('is-dragover'));
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (e) => {
    zone.classList.remove('is-dragover');
    const files = Array.from(e.dataTransfer.files||[]);
    if (files.length) onFiles(files);
  });
}

function backBtn(label='← TOOLS') {
  return `<button class="vault-crumb" id="pdfk-back">${label}</button>`;
}
function wireBack(container) {
  container.querySelector('#pdfk-back').onclick = goHome;
}

/* ============================================================
   TOOL 1 — Convert (JPG/PNG → PDF, DOC(X) → Launch)
   ============================================================ */
let _convertFiles = []; // { file, kind: 'image'|'doc' }

function renderConvert() {
  _convertFiles = [];
  _root.innerHTML = `
    <div class="pdfk-wrap">
      ${backBtn()}
      <h2 class="pdfk-h2">Convert to PDF</h2>
      <div class="pdfk-sub">Select JPG/PNG images to combine into a PDF, or a DOC/DOCX file to launch externally.</div>
      ${pickerZone({ id:'conv-input', label:'Drop images or a Word document here', accept:'.jpg,.jpeg,.png,.doc,.docx,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', multiple:true })}
      <div class="pdfk-file-list" id="conv-list"></div>
      <div id="conv-actions"></div>
    </div>
  `;
  wireBack(_root);
  wirePickerZone(_root, 'conv-input', handleConvertFiles);
}

function handleConvertFiles(files) {
  files.forEach(file => {
    const isDoc = /\.(doc|docx)$/i.test(file.name) || file.type.includes('word');
    const isImg = /\.(jpg|jpeg|png)$/i.test(file.name) || file.type.startsWith('image/');
    if (isDoc || isImg) _convertFiles.push({ file, kind: isDoc ? 'doc' : 'image' });
  });
  renderConvertList();
}

function renderConvertList() {
  const list = _root.querySelector('#conv-list');
  const actions = _root.querySelector('#conv-actions');
  if (!_convertFiles.length) { list.innerHTML=''; actions.innerHTML=''; return; }

  list.innerHTML = _convertFiles.map((f,i) => `
    <div class="pdfk-file-row" data-i="${i}">
      <span class="pdfk-file-icon">${f.kind==='doc' ? '📝' : '🖼'}</span>
      <span class="pdfk-file-name">${esc(f.file.name)}</span>
      <span class="pdfk-file-size">${fileSizeStr(f.file.size)}</span>
      ${f.kind==='doc' ? `<button class="vault-tool-btn pdfk-launch-btn" data-i="${i}">🚀 LAUNCH</button>` : ''}
      <button class="vault-tool-btn pdfk-remove-btn" data-i="${i}">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.pdfk-launch-btn').forEach(btn => {
    btn.onclick = () => launchDocFile(_convertFiles[btn.dataset.i].file);
  });
  list.querySelectorAll('.pdfk-remove-btn').forEach(btn => {
    btn.onclick = () => { _convertFiles.splice(btn.dataset.i,1); renderConvertList(); };
  });

  const hasImages = _convertFiles.some(f => f.kind==='image');
  actions.innerHTML = hasImages
    ? `<button class="btn btn--primary pdfk-action-btn" id="conv-go">🔄 CONVERT IMAGES TO PDF</button>`
    : `<div class="pdfk-note">Use LAUNCH to open Word documents externally — they can't be converted in-browser.</div>`;
  const goBtn = _root.querySelector('#conv-go');
  if (goBtn) goBtn.onclick = runImageToPdf;
}

/* DOC/DOCX — no in-browser conversion. Open/download the raw file
   so the OS, Word, or LibreOffice can handle it locally. This keeps
   the file entirely on-device — nothing is sent to any server. */
function launchDocFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  // Also offer it as a download in case the browser can't open DOC inline
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  toast(`Launching ${file.name} — opens with your device's default app if available, or downloads`, 'ok');
}

async function runImageToPdf() {
  const images = _convertFiles.filter(f => f.kind==='image');
  if (!images.length) return;
  toast(`Converting ${images.length} image(s) to PDF…`);
  try {
    const { PDFDocument } = await ensurePDFLib();
    const pdfDoc = await PDFDocument.create();
    for (const { file } of images) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPng = /\.png$/i.test(file.name) || file.type==='image/png';
      const img = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x:0, y:0, width: img.width, height: img.height });
    }
    const pdfBytes = await pdfDoc.save();
    downloadBytes(pdfBytes, `converted-${ts()}.pdf`, 'application/pdf');
    toast('✓ PDF created');
  } catch(e) { toast('Conversion failed: ' + e.message, 'err'); }
}

/* ============================================================
   TOOL 2 — Merge
   ============================================================ */
let _mergeFiles = [];

function renderMerge() {
  _mergeFiles = [];
  _root.innerHTML = `
    <div class="pdfk-wrap">
      ${backBtn()}
      <h2 class="pdfk-h2">Merge PDFs</h2>
      <div class="pdfk-sub">Select two or more PDFs. Drag to reorder before merging.</div>
      ${pickerZone({ id:'merge-input', label:'Drop PDF files here', accept:'.pdf,application/pdf', multiple:true })}
      <div class="pdfk-file-list" id="merge-list"></div>
      <div id="merge-actions"></div>
    </div>
  `;
  wireBack(_root);
  wirePickerZone(_root, 'merge-input', (files) => {
    files.forEach(f => { if (/\.pdf$/i.test(f.name) || f.type==='application/pdf') _mergeFiles.push(f); });
    renderMergeList();
  });
}

function renderMergeList() {
  const list = _root.querySelector('#merge-list');
  const actions = _root.querySelector('#merge-actions');
  if (!_mergeFiles.length) { list.innerHTML=''; actions.innerHTML=''; return; }

  list.innerHTML = _mergeFiles.map((f,i) => `
    <div class="pdfk-file-row" data-i="${i}" draggable="true">
      <span class="pdfk-file-icon">⠿</span>
      <span class="pdfk-file-icon">📄</span>
      <span class="pdfk-file-name">${esc(f.name)}</span>
      <span class="pdfk-file-size">${fileSizeStr(f.size)}</span>
      <button class="vault-tool-btn pdfk-up-btn" data-i="${i}" ${i===0?'disabled':''}>↑</button>
      <button class="vault-tool-btn pdfk-down-btn" data-i="${i}" ${i===_mergeFiles.length-1?'disabled':''}>↓</button>
      <button class="vault-tool-btn pdfk-remove-btn" data-i="${i}">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.pdfk-up-btn').forEach(btn => {
    btn.onclick = () => { const i=+btn.dataset.i; if(i>0){[_mergeFiles[i-1],_mergeFiles[i]]=[_mergeFiles[i],_mergeFiles[i-1]]; renderMergeList();} };
  });
  list.querySelectorAll('.pdfk-down-btn').forEach(btn => {
    btn.onclick = () => { const i=+btn.dataset.i; if(i<_mergeFiles.length-1){[_mergeFiles[i+1],_mergeFiles[i]]=[_mergeFiles[i],_mergeFiles[i+1]]; renderMergeList();} };
  });
  list.querySelectorAll('.pdfk-remove-btn').forEach(btn => {
    btn.onclick = () => { _mergeFiles.splice(btn.dataset.i,1); renderMergeList(); };
  });

  actions.innerHTML = _mergeFiles.length >= 2
    ? `<button class="btn btn--primary pdfk-action-btn" id="merge-go">🧩 MERGE ${_mergeFiles.length} PDFs</button>`
    : `<div class="pdfk-note">Add at least one more PDF to merge.</div>`;
  const goBtn = _root.querySelector('#merge-go');
  if (goBtn) goBtn.onclick = runMerge;
}

async function runMerge() {
  toast(`Merging ${_mergeFiles.length} PDFs…`);
  try {
    const { PDFDocument } = await ensurePDFLib();
    const merged = await PDFDocument.create();
    for (const file of _mergeFiles) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const pdfBytes = await merged.save();
    downloadBytes(pdfBytes, `merged-${ts()}.pdf`, 'application/pdf');
    toast('✓ PDFs merged');
  } catch(e) { toast('Merge failed: ' + e.message, 'err'); }
}

/* ============================================================
   TOOL 3 — Split
   ============================================================ */
let _splitFile = null;
let _splitPageCount = 0;

function renderSplit() {
  _splitFile = null;
  _root.innerHTML = `
    <div class="pdfk-wrap">
      ${backBtn()}
      <h2 class="pdfk-h2">Split PDF</h2>
      <div class="pdfk-sub">Select one PDF, then choose how to split it.</div>
      ${pickerZone({ id:'split-input', label:'Drop a PDF file here', accept:'.pdf,application/pdf', multiple:false })}
      <div id="split-body"></div>
    </div>
  `;
  wireBack(_root);
  wirePickerZone(_root, 'split-input', async (files) => {
    const file = files[0];
    if (!file || !(/\.pdf$/i.test(file.name) || file.type==='application/pdf')) { toast('Please select a PDF file','warn'); return; }
    _splitFile = file;
    toast('Reading PDF…');
    try {
      const { PDFDocument } = await ensurePDFLib();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      _splitPageCount = doc.getPageCount();
      renderSplitBody();
    } catch(e) { toast('Could not read PDF: ' + e.message, 'err'); }
  });
}

function renderSplitBody() {
  const body = _root.querySelector('#split-body');
  body.innerHTML = `
    <div class="pdfk-file-row">
      <span class="pdfk-file-icon">📄</span>
      <span class="pdfk-file-name">${esc(_splitFile.name)}</span>
      <span class="pdfk-file-size">${_splitPageCount} page(s)</span>
    </div>
    <div class="pdfk-split-options">
      <label class="vault-field">
        <span class="vault-field__label">Page range to extract (e.g. 1-3,5)</span>
        <input type="text" id="split-range" class="cd-input" placeholder="e.g. 1-3,5,7-9">
      </label>
      <button class="btn btn--primary pdfk-action-btn" id="split-extract">✂️ EXTRACT RANGE</button>
      <div class="pdfk-or">— or —</div>
      <button class="btn pdfk-action-btn" id="split-each">SPLIT INTO ${_splitPageCount} SEPARATE PDFs (one per page)</button>
    </div>
  `;
  _root.querySelector('#split-extract').onclick = () => runSplitExtract();
  _root.querySelector('#split-each').onclick = () => runSplitEach();
}

function parsePageRange(rangeStr, maxPage) {
  const indices = new Set();
  rangeStr.split(',').map(s=>s.trim()).filter(Boolean).forEach(part => {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const from = Math.max(1, +m[1]), to = Math.min(maxPage, +m[2]);
      for (let i=from; i<=to; i++) indices.add(i-1);
    } else if (/^\d+$/.test(part)) {
      const n = +part;
      if (n>=1 && n<=maxPage) indices.add(n-1);
    }
  });
  return [...indices].sort((a,b)=>a-b);
}

async function runSplitExtract() {
  const rangeStr = _root.querySelector('#split-range').value.trim();
  if (!rangeStr) return toast('Enter a page range', 'warn');
  const indices = parsePageRange(rangeStr, _splitPageCount);
  if (!indices.length) return toast('No valid pages in that range', 'warn');
  toast(`Extracting ${indices.length} page(s)…`);
  try {
    const { PDFDocument } = await ensurePDFLib();
    const bytes = new Uint8Array(await _splitFile.arrayBuffer());
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    pages.forEach(p => out.addPage(p));
    const pdfBytes = await out.save();
    downloadBytes(pdfBytes, `extracted-${ts()}.pdf`, 'application/pdf');
    toast('✓ Pages extracted');
  } catch(e) { toast('Extract failed: ' + e.message, 'err'); }
}

async function runSplitEach() {
  toast(`Splitting into ${_splitPageCount} PDFs…`);
  try {
    const { PDFDocument } = await ensurePDFLib();
    const bytes = new Uint8Array(await _splitFile.arrayBuffer());
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    for (let i=0; i<_splitPageCount; i++) {
      const out = await PDFDocument.create();
      const [page] = await out.copyPages(src, [i]);
      out.addPage(page);
      const pdfBytes = await out.save();
      downloadBytes(pdfBytes, `page-${i+1}-${ts()}.pdf`, 'application/pdf');
      await new Promise(r => setTimeout(r, 150)); // avoid browser blocking rapid downloads
    }
    toast('✓ Split complete — check your downloads');
  } catch(e) { toast('Split failed: ' + e.message, 'err'); }
}

/* ============================================================
   TOOL 4 — Edit (reorder, rotate, delete pages)
   ============================================================ */
let _editFile = null;
let _editPages = []; // [{ originalIndex, rotation }]

function renderEdit() {
  _editFile = null;
  _editPages = [];
  _root.innerHTML = `
    <div class="pdfk-wrap">
      ${backBtn()}
      <h2 class="pdfk-h2">Edit Pages</h2>
      <div class="pdfk-sub">Select a PDF to reorder, rotate, or delete pages.</div>
      ${pickerZone({ id:'edit-input', label:'Drop a PDF file here', accept:'.pdf,application/pdf', multiple:false })}
      <div id="edit-body"></div>
    </div>
  `;
  wireBack(_root);
  wirePickerZone(_root, 'edit-input', async (files) => {
    const file = files[0];
    if (!file || !(/\.pdf$/i.test(file.name) || file.type==='application/pdf')) { toast('Please select a PDF file','warn'); return; }
    _editFile = file;
    toast('Loading pages…');
    try {
      const { PDFDocument } = await ensurePDFLib();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const count = doc.getPageCount();
      _editPages = Array.from({length: count}, (_,i) => ({ originalIndex: i, rotation: 0 }));
      renderEditBody();
    } catch(e) { toast('Could not read PDF: ' + e.message, 'err'); }
  });
}

function renderEditBody() {
  const body = _root.querySelector('#edit-body');
  body.innerHTML = `
    <div class="pdfk-file-row">
      <span class="pdfk-file-icon">📄</span>
      <span class="pdfk-file-name">${esc(_editFile.name)}</span>
      <span class="pdfk-file-size">${_editPages.length} page(s)</span>
    </div>
    <div class="pdfk-page-grid" id="edit-page-grid">
      ${_editPages.map((p,i) => `
        <div class="pdfk-page-card" data-i="${i}">
          <div class="pdfk-page-num">Page ${p.originalIndex+1}</div>
          <div class="pdfk-page-rot" style="transform:rotate(${p.rotation}deg)">📄</div>
          <div class="pdfk-page-actions">
            <button class="vault-tool-btn" data-act="up" data-i="${i}" ${i===0?'disabled':''}>↑</button>
            <button class="vault-tool-btn" data-act="down" data-i="${i}" ${i===_editPages.length-1?'disabled':''}>↓</button>
            <button class="vault-tool-btn" data-act="rotate" data-i="${i}">⟳</button>
            <button class="vault-tool-btn" data-act="delete" data-i="${i}">✕</button>
          </div>
        </div>
      `).join('')}
    </div>
    <button class="btn btn--primary pdfk-action-btn" id="edit-save" ${_editPages.length===0?'disabled':''}>💾 SAVE EDITED PDF</button>
  `;
  body.querySelectorAll('[data-act]').forEach(btn => {
    const i = +btn.dataset.i;
    btn.onclick = () => {
      if (btn.dataset.act==='up' && i>0) [_editPages[i-1],_editPages[i]]=[_editPages[i],_editPages[i-1]];
      else if (btn.dataset.act==='down' && i<_editPages.length-1) [_editPages[i+1],_editPages[i]]=[_editPages[i],_editPages[i+1]];
      else if (btn.dataset.act==='rotate') _editPages[i].rotation = (_editPages[i].rotation + 90) % 360;
      else if (btn.dataset.act==='delete') _editPages.splice(i,1);
      renderEditBody();
    };
  });
  const saveBtn = body.querySelector('#edit-save');
  if (saveBtn) saveBtn.onclick = runEditSave;
}

async function runEditSave() {
  if (!_editPages.length) return toast('No pages left to save', 'warn');
  toast('Saving edited PDF…');
  try {
    const { PDFDocument, degrees } = await ensurePDFLib();
    const bytes = new Uint8Array(await _editFile.arrayBuffer());
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const indices = _editPages.map(p => p.originalIndex);
    const pages = await out.copyPages(src, indices);
    pages.forEach((page, i) => {
      const rot = _editPages[i].rotation;
      if (rot) page.setRotation(degrees((page.getRotation().angle + rot) % 360));
      out.addPage(page);
    });
    const pdfBytes = await out.save();
    downloadBytes(pdfBytes, `edited-${ts()}.pdf`, 'application/pdf');
    toast('✓ Edited PDF saved');
  } catch(e) { toast('Save failed: ' + e.message, 'err'); }
}

/* ============================================================
   TOOL 5 — Reduce Size
   ============================================================ */
let _reduceFile = null;

function renderReduce() {
  _reduceFile = null;
  _root.innerHTML = `
    <div class="pdfk-wrap">
      ${backBtn()}
      <h2 class="pdfk-h2">Reduce File Size</h2>
      <div class="pdfk-sub">Re-renders each page as a compressed image. Best for scanned or image-heavy PDFs — text-heavy PDFs may not shrink much.</div>
      ${pickerZone({ id:'reduce-input', label:'Drop a PDF file here', accept:'.pdf,application/pdf', multiple:false })}
      <div id="reduce-body"></div>
    </div>
  `;
  wireBack(_root);
  wirePickerZone(_root, 'reduce-input', (files) => {
    const file = files[0];
    if (!file || !(/\.pdf$/i.test(file.name) || file.type==='application/pdf')) { toast('Please select a PDF file','warn'); return; }
    _reduceFile = file;
    renderReduceBody();
  });
}

function renderReduceBody() {
  const body = _root.querySelector('#reduce-body');
  body.innerHTML = `
    <div class="pdfk-file-row">
      <span class="pdfk-file-icon">📄</span>
      <span class="pdfk-file-name">${esc(_reduceFile.name)}</span>
      <span class="pdfk-file-size">${fileSizeStr(_reduceFile.size)}</span>
    </div>
    <div class="pdfk-reduce-options">
      <label class="vault-field">
        <span class="vault-field__label">Quality</span>
        <select id="reduce-quality" class="cd-input cd-select">
          <option value="0.4">Smallest file (low quality)</option>
          <option value="0.6" selected>Balanced</option>
          <option value="0.8">Best quality (larger file)</option>
        </select>
      </label>
      <button class="btn btn--primary pdfk-action-btn" id="reduce-go">📉 REDUCE SIZE</button>
      <div class="pdfk-progress" id="reduce-progress" hidden></div>
    </div>
  `;
  _root.querySelector('#reduce-go').onclick = runReduce;
}

async function runReduce() {
  const quality = parseFloat(_root.querySelector('#reduce-quality').value);
  const progressEl = _root.querySelector('#reduce-progress');
  progressEl.hidden = false;
  try {
    const pdfjs = await ensurePdfJs();
    const { PDFDocument } = await ensurePDFLib();
    const bytes = await _reduceFile.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const out = await PDFDocument.create();

    for (let i = 1; i <= pdf.numPages; i++) {
      progressEl.textContent = `Processing page ${i} / ${pdf.numPages}…`;
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
      const jpegBytes = dataUrlToBytes(jpegDataUrl);
      const img = await out.embedJpg(jpegBytes);
      const pageOut = out.addPage([viewport.width, viewport.height]);
      pageOut.drawImage(img, { x:0, y:0, width: viewport.width, height: viewport.height });
    }

    progressEl.textContent = 'Saving…';
    const pdfBytes = await out.save();
    const originalSize = _reduceFile.size;
    const newSize = pdfBytes.length;
    downloadBytes(pdfBytes, `reduced-${ts()}.pdf`, 'application/pdf');
    const pct = Math.round((1 - newSize/originalSize) * 100);
    progressEl.textContent = `✓ Done — ${fileSizeStr(originalSize)} → ${fileSizeStr(newSize)} (${pct>0?pct+'% smaller':'no reduction'})`;
    toast('✓ PDF size reduced');
  } catch(e) {
    progressEl.textContent = '';
    toast('Reduce failed: ' + e.message, 'err');
  }
}

/* ============================================================
   TOOL 6 — Unlock (remove password protection)
   ------------------------------------------------------------
   HONEST LIMITATION: there is no offline JS library available
   here that can decrypt a PDF and rewrite it while keeping the
   original text layer intact. The only reliable, safe approach
   with the libraries on hand is the same one used by Reduce
   Size: pdf.js decrypts the PDF (it has to, just to display it)
   and renders each page to a canvas; pdf-lib then reassembles
   those canvases into a brand-new, password-free PDF.
   Result: the unlocked PDF will NOT have selectable/searchable
   text — pages become images, like a scan. Visually identical,
   but text can't be copied or searched anymore. This is shown
   to the user clearly before every unlock, not just once.
   ============================================================ */
let _unlockFile = null;

function renderUnlock() {
  _unlockFile = null;
  _root.innerHTML = `
    <div class="pdfk-wrap">
      ${backBtn()}
      <h2 class="pdfk-h2">Unlock PDF</h2>
      <div class="pdfk-sub">Remove password protection from a PDF you already know the password for.</div>
      <div class="pdfk-warn-box">
        ⚠ <strong>Important:</strong> the unlocked copy will have its pages converted to images.
        Text will no longer be selectable, searchable, or copyable — even though it will look identical.
        This applies every time you use this tool, for any PDF.
      </div>
      ${pickerZone({ id:'unlock-input', label:'Drop a password-protected PDF here', accept:'.pdf,application/pdf', multiple:false })}
      <div id="unlock-body"></div>
    </div>
  `;
  wireBack(_root);
  wirePickerZone(_root, 'unlock-input', (files) => {
    const file = files[0];
    if (!file || !(/\.pdf$/i.test(file.name) || file.type==='application/pdf')) { toast('Please select a PDF file','warn'); return; }
    _unlockFile = file;
    renderUnlockBody();
  });
}

function renderUnlockBody() {
  const body = _root.querySelector('#unlock-body');
  body.innerHTML = `
    <div class="pdfk-file-row">
      <span class="pdfk-file-icon">🔒</span>
      <span class="pdfk-file-name">${esc(_unlockFile.name)}</span>
      <span class="pdfk-file-size">${fileSizeStr(_unlockFile.size)}</span>
    </div>
    <label class="vault-field">
      <span class="vault-field__label">PDF Password</span>
      <div class="vault-pwrow">
        <input type="password" id="unlock-pw" class="cd-input" placeholder="Enter the PDF's password" autocomplete="off">
        <button type="button" class="vault-pwrow__btn" id="unlock-pw-reveal">👁</button>
      </div>
    </label>
    <button class="btn btn--primary pdfk-action-btn" id="unlock-go">🔓 UNLOCK PDF</button>
    <div class="pdfk-progress" id="unlock-progress" hidden></div>
  `;
  const pwInput = body.querySelector('#unlock-pw');
  body.querySelector('#unlock-pw-reveal').onclick = () => {
    pwInput.type = pwInput.type==='password' ? 'text' : 'password';
  };
  body.querySelector('#unlock-go').onclick = runUnlock;
  pwInput.addEventListener('keydown', e => { if (e.key==='Enter') runUnlock(); });
}

async function runUnlock() {
  const pwInput = _root.querySelector('#unlock-pw');
  const password = pwInput.value;
  if (!password) return toast('Enter the PDF password', 'warn');
  const progressEl = _root.querySelector('#unlock-progress');
  progressEl.hidden = false;
  progressEl.textContent = 'Opening PDF…';
  try {
    const pdfjs = await ensurePdfJs();
    const { PDFDocument } = await ensurePDFLib();
    const bytes = await _unlockFile.arrayBuffer();

    let pdf;
    try {
      pdf = await pdfjs.getDocument({ data: bytes, password }).promise;
    } catch(err) {
      if (err && err.name === 'PasswordException') {
        progressEl.hidden = true;
        pwInput.value = '';
        toast('Incorrect password — please try again', 'err');
        return;
      }
      throw err;
    }

    const out = await PDFDocument.create();
    for (let i = 1; i <= pdf.numPages; i++) {
      progressEl.textContent = `Decrypting & rendering page ${i} / ${pdf.numPages}…`;
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const jpegBytes = dataUrlToBytes(jpegDataUrl);
      const img = await out.embedJpg(jpegBytes);
      const pageOut = out.addPage([viewport.width, viewport.height]);
      pageOut.drawImage(img, { x:0, y:0, width: viewport.width, height: viewport.height });
    }

    progressEl.textContent = 'Saving unlocked PDF…';
    const pdfBytes = await out.save();
    downloadBytes(pdfBytes, `unlocked-${ts()}.pdf`, 'application/pdf');
    progressEl.textContent = `✓ Done — ${pdf.numPages} page(s) unlocked (saved as images, no longer password-protected)`;
    pwInput.value = '';
    toast('✓ PDF unlocked');
  } catch(e) {
    progressEl.textContent = '';
    toast('Unlock failed: ' + e.message, 'err');
  }
}

/* ============================================================
   Shared helpers
   ============================================================ */
function esc(s) {
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fileSizeStr(bytes) {
  if (!bytes) return '0 KB';
  if (bytes>1024*1024) return (bytes/1024/1024).toFixed(1)+' MB';
  return Math.round(bytes/1024)+' KB';
}
function ts() {
  const d=new Date();
  const pad=(n)=>String(n).padStart(2,'0');
  return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes());
}
function downloadBytes(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
