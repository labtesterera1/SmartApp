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
import { toast } from '../core/ui.js';

const STORE = 'documents';
const VIEW_MODE_KEY = 'smartapp_dh_view_v1';   // 'grid' | 'list'

let _root = null;
let _cache = [];          // in-memory list (synced from DB on render)
let _viewing = null;      // null | id of file being viewed
let _objectUrls = [];     // tracked so we can revoke on cleanup
let _viewMode = (() => {
  try { return localStorage.getItem(VIEW_MODE_KEY) || 'grid'; }
  catch { return 'grid'; }
})();

export default {
  id: 'documents',
  name: 'Document Hub',
  tagline: 'capture · store · share',
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
      <span class="dh-viewtoggle">
        <button class="dh-vt ${_viewMode === 'grid' ? 'is-active' : ''}" data-mode="grid"  title="Grid view">▦</button>
        <button class="dh-vt ${_viewMode === 'list' ? 'is-active' : ''}" data-mode="list"  title="List view">≣</button>
      </span>
    </div>

    <div class="dh-actions">
      <label class="btn dh-actions__btn">
        📷&nbsp; CAMERA
        <input type="file" accept="image/*" capture="environment"
               id="dh-camera" multiple hidden>
      </label>
      <label class="btn dh-actions__btn">
        📁&nbsp; PICK
        <input type="file" id="dh-pick" multiple hidden>
      </label>
    </div>

    <div class="dh-tools">
      <button class="vault-tool-btn" id="dh-export">⬇ EXPORT BACKUP</button>
      <button class="vault-tool-btn" id="dh-import">⬆ IMPORT BACKUP</button>
      <input type="file" id="dh-importfile" accept=".smartdocs,application/json" hidden>
    </div>

    ${total === 0
      ? `<div class="placeholder">
           <div class="placeholder__icon">·</div>
           No files yet. Snap a receipt or pick a file.
         </div>`
      : `<div class="${_viewMode === 'list' ? 'dh-list' : 'dh-grid'}" id="grid"></div>`}
  `;

  _root.querySelector('#dh-camera').addEventListener('change', onFileChosen);
  _root.querySelector('#dh-pick').addEventListener('change', onFileChosen);

  _root.querySelectorAll('.dh-vt').forEach(b => {
    b.onclick = () => {
      _viewMode = b.dataset.mode;
      try { localStorage.setItem(VIEW_MODE_KEY, _viewMode); } catch {}
      renderGrid();
    };
  });

  _root.querySelector('#dh-export').onclick = exportDocuments;
  _root.querySelector('#dh-import').onclick = () => _root.querySelector('#dh-importfile').click();
  _root.querySelector('#dh-importfile').onchange = handleImportDocs;

  if (total > 0) {
    const grid = _root.querySelector('#grid');
    if (_viewMode === 'list') {
      _cache.forEach(file => grid.appendChild(buildListRow(file)));
    } else {
      _cache.forEach(file => grid.appendChild(buildGridCell(file)));
    }
  }
}

function buildListRow(file) {
  const row = document.createElement('button');
  row.className = 'dh-row';
  row.dataset.id = file.id;

  const isImg = (file.mime || '').startsWith('image/');
  const isPdf = file.mime === 'application/pdf';

  let thumb = '';
  if (isImg) {
    const url = URL.createObjectURL(file.blob);
    _objectUrls.push(url);
    thumb = `<img class="dh-row__thumb" src="${url}" alt="">`;
  } else {
    const ext = (file.ext || '').toUpperCase().slice(0, 4) || (isPdf ? 'PDF' : 'FILE');
    const cls = isPdf ? 'dh-row__icon dh-row__icon--pdf' : 'dh-row__icon';
    thumb = `<div class="${cls}"><span>${escapeHtml(ext)}</span></div>`;
  }

  row.innerHTML = `
    ${thumb}
    <div class="dh-row__main">
      <div class="dh-row__name">${escapeHtml(file.name)}</div>
      <div class="dh-row__sub">
        ${formatSize(file.size)}
        · ${(file.mime || 'unknown').split('/').pop()}
        · ${formatDate(file.createdAt)}
      </div>
    </div>
    <span class="dh-row__chev">→</span>
  `;
  row.addEventListener('click', () => {
    _viewing = file.id;
    renderDetail(file.id);
  });
  return row;
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
  const files = Array.from(input.files || []);
  input.value = '';                      // allow re-picking same file
  if (files.length === 0) return;

  // Save each file. Tiny offset on createdAt keeps newest-first stable
  // when multiple files come in at the same millisecond.
  const baseTime = Date.now();
  for (let i = 0; i < files.length; i++) {
    const original = files[i];
    const ext = (original.name.split('.').pop() || '').toLowerCase();

    // Compress images silently — keeps receipts readable, saves 80–90%
    let blob = original;
    let storedExt = ext;
    let storedMime = original.type || guessMimeFromExt(ext);
    if ((original.type || '').startsWith('image/')) {
      const compressed = await compressImage(original);
      if (compressed && compressed.size < original.size) {
        blob = compressed;
        storedExt = 'jpg';
        storedMime = 'image/jpeg';
      }
    }

    const record = {
      id: uuid(),
      name: original.name || `capture-${baseTime + i}.${storedExt || 'bin'}`,
      mime: storedMime,
      ext: storedExt,
      size: blob.size,
      originalSize: original.size,
      blob,
      createdAt: baseTime + i,
      updatedAt: baseTime + i,
    };
    await db.put(STORE, record);
  }

  await refreshCache();
  routeView();
}

/* ---------- Image compression ----------
   Resizes to max 1600px on the long side, re-encodes JPEG @ 0.85.
   Keeps receipt text readable, slashes file size 80–90%.
   Falls back to original if anything goes wrong.
*/
function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise(resolve => {
    if (!file.type.startsWith('image/')) return resolve(file);
    if (file.size < 300 * 1024) return resolve(file);   // already small

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width  = maxDim;
          } else {
            width  = Math.round(width  * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';   // for transparent PNGs converted to JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (!blob) return resolve(file);
          const newName = file.name.replace(/\.\w+$/, '.jpg');
          const compressed = new File([blob], newName, {
            type: 'image/jpeg',
            lastModified: file.lastModified || Date.now(),
          });
          resolve(compressed);
        }, 'image/jpeg', quality);
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
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
  } else {
    const extLabel = (file.ext || '').toUpperCase() || (isPdf ? 'PDF' : 'FILE');
    const hint = isPdf
      ? 'Tap OPEN to view in your PDF reader.'
      : 'No preview available — tap OPEN to view in another app.';
    preview = `
      <div class="dh-preview__icon ${isPdf ? 'dh-preview__icon--pdf' : ''}">
        <div class="dh-preview__sheet"></div>
        <div class="dh-preview__ext">${escapeHtml(extLabel)}</div>
        <div class="dh-preview__hint">${hint}</div>
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
        <span class="dh-meta__v">
          ${formatSize(file.size)}
          ${file.originalSize && file.originalSize > file.size
            ? `<span class="dh-meta__hint">compressed from ${formatSize(file.originalSize)}</span>`
            : ''}
        </span>
      </div>
      <div class="dh-meta__row">
        <span class="dh-meta__k">ADDED</span>
        <span class="dh-meta__v">${new Date(file.createdAt).toLocaleString()}</span>
      </div>
    </div>

    <div class="dh-detail-actions">
      <a class="btn" id="dh-dl" href="${url}" download="${escapeHtml(file.name)}">DOWNLOAD</a>
      <a class="btn" id="dh-open" href="${url}" target="_blank" rel="noopener">OPEN</a>
      <button class="btn vault-actions__del" id="del">DELETE</button>
    </div>

    <div class="dh-share">
      <div class="dh-share__head">SEND OUT</div>
      <button class="btn btn--primary dh-share__main" id="sh-native">
        📤&nbsp; SHARE FILE
      </button>
      <div class="dh-share__row">
        <button class="dh-share__btn" id="sh-wa" type="button">
          <span class="dh-share__icon">💬</span>
          <span class="dh-share__lbl">WhatsApp</span>
        </button>
        <button class="dh-share__btn" id="sh-email" type="button">
          <span class="dh-share__icon">✉</span>
          <span class="dh-share__lbl">Email</span>
        </button>
        <button class="dh-share__btn" id="sh-print" type="button">
          <span class="dh-share__icon">🖨</span>
          <span class="dh-share__lbl">Print</span>
        </button>
        <button class="dh-share__btn" id="sh-copy" type="button">
          <span class="dh-share__icon">📋</span>
          <span class="dh-share__lbl">Copy</span>
        </button>
      </div>
      <div class="dh-share__hint">
        SHARE FILE attaches the actual file via Android's share sheet
        (WhatsApp, Drive, Telegram, etc.). The 4 buttons below send a
        text summary to those apps — files don't attach via direct links.
      </div>
    </div>
  `;

  _root.querySelector('#back').onclick = () => {
    _viewing = null;
    renderGrid();
  };
  _root.querySelector('#dh-dl').addEventListener('click', () => {
    toast('✓ Saved to Downloads');
  });
  _root.querySelector('#dh-open').addEventListener('click', () => {
    toast('Opening…');
  });
  _root.querySelector('#del').onclick = async () => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    await db.delete(STORE, file.id);
    await refreshCache();
    _viewing = null;
    renderGrid();
    toast('✓ Deleted');
  };

  // Share row
  _root.querySelector('#sh-native').onclick = () => shareNative(file);
  _root.querySelector('#sh-wa').onclick     = () => shareWhatsApp(file);
  _root.querySelector('#sh-email').onclick  = () => shareEmail(file);
  _root.querySelector('#sh-print').onclick  = () => printFile(file, url);
  _root.querySelector('#sh-copy').onclick   = () => copyInfo(file);
}

/* ============================================================
   Share handlers
   ============================================================ */

async function shareNative(file) {
  if (!navigator.share) {
    toast('Sharing not supported on this browser', 'warn');
    return;
  }
  const fileObj = new File([file.blob], file.name, {
    type: file.mime,
    lastModified: file.createdAt,
  });
  try {
    if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
      await navigator.share({
        title: file.name,
        text: file.name,
        files: [fileObj],
      });
      toast('✓ Shared');
    } else {
      // File-share not supported — fall back to text-only
      await navigator.share({
        title: file.name,
        text: `${file.name} · ${formatSize(file.size)}`,
      });
      toast('Text shared (file attach not supported here)', 'warn');
    }
  } catch (err) {
    if (err.name === 'AbortError') return;       // user cancelled
    toast('Share failed: ' + err.message, 'err');
  }
}

function shareWhatsApp(file) {
  const text = encodeURIComponent(
    `📄 ${file.name}\n` +
    `${formatSize(file.size)} · ${new Date(file.createdAt).toLocaleDateString()}\n\n` +
    `(Use SHARE FILE button to attach the actual file.)`
  );
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

function shareEmail(file) {
  const subject = encodeURIComponent(`File: ${file.name}`);
  const body = encodeURIComponent(
    `${file.name}\n` +
    `Size: ${formatSize(file.size)}\n` +
    `Type: ${file.mime}\n` +
    `Added: ${new Date(file.createdAt).toLocaleString()}\n\n` +
    `(Use SHARE FILE to attach the actual file.)`
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function printFile(file, url) {
  if ((file.mime || '').startsWith('image/')) {
    const w = window.open('', '_blank');
    if (!w) { toast('Popup blocked — allow popups to print', 'warn'); return; }
    w.document.write(
      '<!doctype html><html><head>' +
      `<title>${escapeHtml(file.name)}</title>` +
      '<style>' +
        'body{margin:0;padding:0;background:#fff;}' +
        'img{display:block;max-width:100%;height:auto;margin:0 auto;}' +
        '@media print{@page{margin:1cm;}}' +
      '</style></head><body>' +
      `<img src="${url}" onload="setTimeout(function(){window.print();},150)">` +
      '</body></html>'
    );
    w.document.close();
  } else if (file.mime === 'application/pdf') {
    const w = window.open(url, '_blank');
    if (!w) { toast('Popup blocked — open then print manually', 'warn'); return; }
    setTimeout(() => { try { w.print(); } catch {} }, 1500);
  } else {
    toast('Print not available for this file type', 'warn');
  }
}

async function copyInfo(file) {
  const text =
    `${file.name}\n` +
    `Size: ${formatSize(file.size)}\n` +
    `Type: ${file.mime}\n` +
    `Added: ${new Date(file.createdAt).toLocaleString()}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('✓ Info copied');
  } catch {
    toast('Copy failed — clipboard blocked', 'err');
  }
}

/* ============================================================
   Export / Import — Layer 2 backup
   - File contains JSON: manifest + base64-encoded blobs
   - No external libs; portable across devices
   - Import is ADDITIVE (new IDs, never overwrites)
   ============================================================ */

async function exportDocuments() {
  if (_cache.length === 0) {
    toast('Nothing to export yet', 'warn');
    return;
  }
  toast('Building backup…');
  try {
    const items = [];
    for (const f of _cache) {
      items.push({
        id: f.id,
        name: f.name,
        mime: f.mime,
        ext: f.ext,
        size: f.size,
        originalSize: f.originalSize || f.size,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        data: await blobToBase64(f.blob),
      });
    }
    const payload = {
      app: 'SmartApp',
      kind: 'documents-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
    };
    const json = JSON.stringify(payload);
    const out = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(out);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartapp-documents-${date}.smartdocs`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`✓ Exported ${items.length} file${items.length === 1 ? '' : 's'}`);
  } catch (err) {
    console.error(err);
    toast('Export failed: ' + err.message, 'err');
  }
}

async function handleImportDocs(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let payload;
  try {
    const text = await file.text();
    payload = JSON.parse(text);
  } catch {
    toast('Not a valid backup file', 'err');
    return;
  }
  if (payload.kind !== 'documents-backup' || !Array.isArray(payload.items)) {
    toast('Backup file is not a documents backup', 'err');
    return;
  }
  const proceed = confirm(
    `Import will ADD ${payload.items.length} file${payload.items.length === 1 ? '' : 's'} to your library.\n\n` +
    'Existing files will not be touched. Continue?'
  );
  if (!proceed) return;

  let added = 0, skipped = 0;
  for (const it of payload.items) {
    try {
      const blob = await base64ToBlob(it.data, it.mime);
      const record = {
        id: uuid(),                    // assign fresh ID — pure additive import
        name: it.name,
        mime: it.mime,
        ext: it.ext,
        size: it.size,
        originalSize: it.originalSize,
        blob,
        createdAt: it.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      await db.put(STORE, record);
      added++;
    } catch {
      skipped++;
    }
  }
  await refreshCache();
  routeView();
  toast(`✓ Imported ${added}${skipped ? ` (${skipped} skipped)` : ''}`);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result || '';
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
async function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
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
