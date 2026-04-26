/* ============================================================
   modules/documents.js
   Document Hub — Step 2a
   - 📷 Camera capture (uses input[capture])
   - 📁 File picker (any type)
   - Grid of thumbnails (image preview for img/PDF, icon tile for others)
   - Detail screen: preview + metadata + delete
   - All files stored as Blobs in IndexedDB
   AI extraction (2b), OneDrive sync (2c), share row (2d) come later.
   ============================================================ */

import { db } from '../core/storage.js';

const STORE = 'documents';

let _root = null;
let _cache = [];          // in-memory list (synced from DB on render)
let _viewing = null;      // null | id of file being viewed
let _objectUrls = [];     // tracked so we can revoke on cleanup

export default {
  id: 'documents',
  name: 'Document Hub',
  tagline: 'capture · store · view',
  status: 'ready',

  async render(root) {
    _root = root;
    await refreshCache();
    routeView();
  },

  cleanup() {
    revokeAllUrls();
    _viewing = null;
  },
};

/* ============================================================
   Routing
   ============================================================ */
function routeView() {
  if (_viewing) renderDetail(_viewing);
  else renderGrid();
}

async function refreshCache() {
  _cache = await db.getAll(STORE);
  _cache.sort((a, b) => b.createdAt - a.createdAt);   // newest first
}

/* ============================================================
   Grid view
   ============================================================ */
function renderGrid() {
  revokeAllUrls();

  const total = _cache.length;
  const totalSize = _cache.reduce((sum, f) => sum + (f.size || 0), 0);

  _root.innerHTML = `
    <div class="dh-bar">
      <span class="dh-bar__count">${total} FILE${total === 1 ? '' : 'S'}</span>
      <span class="dh-bar__size">${formatSize(totalSize)}</span>
    </div>

    <div class="dh-actions">
      <label class="btn dh-actions__btn">
        📷&nbsp; CAMERA
        <input type="file" accept="image/*" capture="environment"
               id="dh-camera" hidden>
      </label>
      <label class="btn dh-actions__btn">
        📁&nbsp; PICK
        <input type="file" id="dh-pick" hidden>
      </label>
    </div>

    ${total === 0
      ? `<div class="placeholder">
           <div class="placeholder__icon">·</div>
           No files yet. Snap a receipt or pick a file.
         </div>`
      : `<div class="dh-grid" id="grid"></div>`}
  `;

  _root.querySelector('#dh-camera').addEventListener('change', onFileChosen);
  _root.querySelector('#dh-pick').addEventListener('change', onFileChosen);

  if (total > 0) {
    const grid = _root.querySelector('#grid');
    _cache.forEach(file => grid.appendChild(buildGridCell(file)));
  }
}

function buildGridCell(file) {
  const cell = document.createElement('button');
  cell.className = 'dh-cell';
  cell.dataset.id = file.id;

  const isImg = (file.mime || '').startsWith('image/');
  const isPdf = file.mime === 'application/pdf';

  let inner = '';
  if (isImg) {
    const url = URL.createObjectURL(file.blob);
    _objectUrls.push(url);
    inner = `<img class="dh-cell__img" src="${url}" alt="">`;
  } else {
    // Icon tile for PDFs and other files
    const ext = (file.ext || '').toUpperCase().slice(0, 4) || (isPdf ? 'PDF' : 'FILE');
    const cls = isPdf ? 'dh-cell__icon dh-cell__icon--pdf' : 'dh-cell__icon';
    inner = `<div class="${cls}">
               <div class="dh-cell__sheet"></div>
               <div class="dh-cell__ext">${escapeHtml(ext)}</div>
             </div>`;
  }

  cell.innerHTML = `
    ${inner}
    <div class="dh-cell__meta">
      <div class="dh-cell__name">${escapeHtml(shortenName(file.name))}</div>
      <div class="dh-cell__sub">
        ${formatSize(file.size)} · ${formatDate(file.createdAt)}
      </div>
    </div>
  `;

  cell.addEventListener('click', () => {
    _viewing = file.id;
    renderDetail(file.id);
  });
  return cell;
}

/* ============================================================
   Add file
   ============================================================ */
async function onFileChosen(e) {
  const input = e.currentTarget;
  const file = input.files && input.files[0];
  input.value = '';                      // allow re-picking same file
  if (!file) return;

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const record = {
    id: uuid(),
    name: file.name || `capture-${Date.now()}.${ext || 'bin'}`,
    mime: file.type || guessMimeFromExt(ext),
    ext,
    size: file.size,
    blob: file,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // placeholders for upcoming steps
    extracted: null,    // 2b: AI extraction result
    onedriveId: null,   // 2c: OneDrive item id
    syncedAt: null,
  };

  await db.put(STORE, record);
  await refreshCache();
  routeView();
}

/* ============================================================
   Detail view
   ============================================================ */
async function renderDetail(id) {
  revokeAllUrls();
  const file = await db.get(STORE, id);
  if (!file) {
    _viewing = null;
    return renderGrid();
  }

  const isImg = (file.mime || '').startsWith('image/');
  const isPdf = file.mime === 'application/pdf';
  const url = URL.createObjectURL(file.blob);
  _objectUrls.push(url);

  let preview = '';
  if (isImg) {
    preview = `<img class="dh-preview__img" src="${url}" alt="">`;
  } else if (isPdf) {
    preview = `<iframe class="dh-preview__pdf" src="${url}" title="PDF"></iframe>`;
  } else {
    const extLabel = (file.ext || '').toUpperCase() || 'FILE';
    preview = `
      <div class="dh-preview__icon">
        <div class="dh-preview__sheet"></div>
        <div class="dh-preview__ext">${escapeHtml(extLabel)}</div>
        <div class="dh-preview__hint">No preview available — tap OPEN to view in another app.</div>
      </div>`;
  }

  _root.innerHTML = `
    <button class="vault-crumb" id="back">← FILES</button>

    <div class="dh-preview">${preview}</div>

    <div class="dh-meta">
      <div class="dh-meta__row">
        <span class="dh-meta__k">NAME</span>
        <span class="dh-meta__v">${escapeHtml(file.name)}</span>
      </div>
      <div class="dh-meta__row">
        <span class="dh-meta__k">TYPE</span>
        <span class="dh-meta__v">${escapeHtml(file.mime || 'unknown')}</span>
      </div>
      <div class="dh-meta__row">
        <span class="dh-meta__k">SIZE</span>
        <span class="dh-meta__v">${formatSize(file.size)}</span>
      </div>
      <div class="dh-meta__row">
        <span class="dh-meta__k">ADDED</span>
        <span class="dh-meta__v">${new Date(file.createdAt).toLocaleString()}</span>
      </div>
    </div>

    <div class="dh-detail-actions">
      <a class="btn" href="${url}" download="${escapeHtml(file.name)}">DOWNLOAD</a>
      <a class="btn" href="${url}" target="_blank" rel="noopener">OPEN</a>
      <button class="btn vault-actions__del" id="del">DELETE</button>
    </div>

    <div class="dh-soon">
      <div class="dh-soon__head">COMING IN NEXT STEPS</div>
      <div class="dh-soon__row">2b · AI EXTRACT (merchant, date, total) — image / PDF</div>
      <div class="dh-soon__row">2c · ONEDRIVE AUTO-SYNC</div>
      <div class="dh-soon__row">2d · SHARE: WHATSAPP / EMAIL / PRINT / CSV</div>
    </div>
  `;

  _root.querySelector('#back').onclick = () => {
    _viewing = null;
    renderGrid();
  };
  _root.querySelector('#del').onclick = async () => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    await db.delete(STORE, file.id);
    await refreshCache();
    _viewing = null;
    renderGrid();
  };
}

/* ============================================================
   Helpers
   ============================================================ */
function revokeAllUrls() {
  _objectUrls.forEach(u => URL.revokeObjectURL(u));
  _objectUrls = [];
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0');
  }
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function shortenName(name) {
  if (!name) return 'untitled';
  if (name.length <= 22) return name;
  return name.slice(0, 14) + '…' + name.slice(-6);
}

function guessMimeFromExt(ext) {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif',  heic: 'image/heic',
    pdf: 'application/pdf',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
    mp4: 'video/mp4',
  };
  return map[ext] || 'application/octet-stream';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
