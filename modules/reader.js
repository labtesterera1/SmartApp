/* ============================================================
   modules/reader.js   (v0.10 — Reader / Notes)
   - Write notes with full vault-style toolbar (B / H / ◐ / 👁 / aA / ⧉)
   - Paste images from clipboard (auto-compressed)
   - Save/list notes in IndexedDB
   - "Easy reading mode" = full-screen distraction-free reader
   ============================================================ */

import { db } from '../core/storage.js';
import { toast } from '../core/ui.js';
import { recordActivity } from '../core/profile.js';

const STORE = 'reader_notes';
const MAX_IMG_DIM = 1600;
const IMG_QUALITY = 0.85;

let _root = null;
let _cache = [];
let _editing = null;       // null | { id|null }
let _readerOpen = false;   // for distraction-free reader
let _search = '';

export default {
  id: 'reader',
  name: 'Reader',
  tagline: 'write · paste · read',
  status: 'ready',

  async render(root) {
    _root = root;
    await refreshCache();
    routeView();
  },

  cleanup() {
    _editing = null;
    _readerOpen = false;
  },
};

/* ============================================================
   Routing
   ============================================================ */
function routeView() {
  if (_editing) renderEditor(_editing);
  else renderList();
}

async function refreshCache() {
  _cache = await db.getAll(STORE);
  _cache.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/* ============================================================
   List screen
   ============================================================ */
function renderList() {
  const total = _cache.length;
  const filtered = _cache.filter(n => {
    if (!_search) return true;
    const hay = `${n.title || ''} ${n.body || ''}`.toLowerCase();
    return hay.includes(_search.toLowerCase());
  });
  const showSearch = total >= 5;

  _root.innerHTML = `
    <div class="rd-bar">
      <span class="rd-bar__count">${total} NOTE${total === 1 ? '' : 'S'}</span>
    </div>
    <button class="btn btn--primary rd-add" id="add">+ NEW NOTE</button>

    ${showSearch ? `
      <div class="search-bar">
        <input type="search" id="search" class="search-input"
               placeholder="🔍 Search notes…" value="${esc(_search)}">
        ${_search ? '<button class="search-clear" id="searchClear" type="button">×</button>' : ''}
      </div>
    ` : ''}

    <div class="rd-list">
      ${total === 0
        ? `<div class="empty-card">
             <div class="empty-card__icon">⊕</div>
             <div class="empty-card__title">No notes yet</div>
             <div class="empty-card__desc">
               Write something. Paste images.
               Tap the <strong style="color:var(--lime);">📖</strong> icon on a note for distraction-free reading.
             </div>
             <div class="empty-card__chips">
               <button class="empty-card__chip" id="empty-add">+ New note</button>
             </div>
           </div>`
        : filtered.length === 0
          ? `<div class="placeholder"><div class="placeholder__icon">·</div>No matches.</div>`
          : filtered.map(rowHtml).join('')}
    </div>
  `;
  _root.querySelector('#add').onclick = () => { _editing = { id: null }; renderEditor(_editing); };
  const empty = _root.querySelector('#empty-add');
  if (empty) empty.onclick = () => { _editing = { id: null }; renderEditor(_editing); };

  if (showSearch) {
    const si = _root.querySelector('#search');
    si.addEventListener('input', () => { _search = si.value; renderList(); setTimeout(() => si.focus(), 0); });
    const sc = _root.querySelector('#searchClear');
    if (sc) sc.onclick = () => { _search = ''; renderList(); };
  }

  _root.querySelectorAll('.rd-row').forEach(r => {
    const id = r.dataset.id;
    r.querySelector('.rd-row__main').onclick = () => { _editing = { id }; renderEditor(_editing); };
    r.querySelector('.rd-row__read').onclick = (e) => { e.stopPropagation(); openReader(id); };
  });
}

function rowHtml(n) {
  const title = n.title || 'Untitled note';
  const preview = (n.body || '').replace(/[\n\r]+/g, ' ').slice(0, 80);
  const imgCount = (n.images || []).length;
  return `
    <div class="rd-row" data-id="${n.id}">
      <div class="rd-row__main">
        <div class="rd-row__title">${esc(title)}</div>
        <div class="rd-row__sub">
          ${esc(preview) || '<em style="color:var(--ink-faint);">empty</em>'}
        </div>
        <div class="rd-row__meta">
          ${formatDate(n.updatedAt)}${imgCount ? ` · ${imgCount} image${imgCount === 1 ? '' : 's'}` : ''}
        </div>
      </div>
      <button class="rd-row__read" type="button" title="Open in reader">📖</button>
    </div>
  `;
}

/* ============================================================
   Editor
   ============================================================ */
function renderEditor(state) {
  const isNew = !state.id;
  const note = isNew
    ? { id: uuid(), title: '', body: '', images: [], _casual: false }
    : { ..._cache.find(n => n.id === state.id) };

  _root.innerHTML = `
    <button class="vault-crumb" id="back">← NOTES</button>

    <label class="vault-field">
      <span class="vault-field__label">Title</span>
      <div class="vault-pwrow">
        <input type="text" id="f-title" value="${esc(note.title)}" placeholder="Untitled note">
        <button type="button" class="vault-pwrow__btn vault-pwrow__btn--copy" id="copy-title" title="Copy">⧉</button>
      </div>
    </label>

    <label class="vault-field vault-field--rich">
      <span class="vault-field__label">Body</span>
      <div class="rich-toolbar">
        <button type="button" class="rich-btn" data-act="bold" title="Bold"><b>B</b></button>
        <button type="button" class="rich-btn" data-act="headline" title="Headline"><b>H</b></button>
        <button type="button" class="rich-btn" data-act="color" title="Color"><span style="color:var(--lime)">◐</span></button>
        <button type="button" class="rich-btn" data-act="preview" title="Toggle preview"><span>👁</span></button>
        <button type="button" class="rich-btn ${note._casual ? 'is-active' : ''}" data-act="casual" title="Casual reading mode">aA</button>
        <button type="button" class="rich-btn" data-act="image" title="Paste / pick image">📎</button>
        <input type="file" id="img-pick" accept="image/*" hidden>
        <span class="rich-spacer"></span>
        <button type="button" class="rich-btn rich-btn--copy" data-act="copy" title="Copy body">⧉</button>
      </div>
      <textarea class="vault-textarea rich-area ${note._casual ? 'is-casual' : ''}"
                id="f-body"
                rows="6"
                placeholder="Write here. Paste images directly. Use **bold**, ## headline, [lime]colour[/lime].">${esc(note.body)}</textarea>
      <div class="rich-preview ${note._casual ? 'is-casual' : ''}" id="rd-preview" hidden></div>

      <div class="rd-images" id="rd-images"></div>
    </label>

    <div class="vault-actions">
      <button class="btn btn--primary" id="save">SAVE</button>
      <button class="btn" id="reader-open">📖 READ MODE</button>
      <button class="btn" id="cancel">CANCEL</button>
      ${isNew ? '' : '<button class="btn vault-actions__del" id="del">DELETE</button>'}
    </div>
  `;

  const titleEl   = _root.querySelector('#f-title');
  const bodyEl    = _root.querySelector('#f-body');
  const previewEl = _root.querySelector('#rd-preview');
  const previewBtn = _root.querySelector('[data-act="preview"]');
  const casualBtn  = _root.querySelector('[data-act="casual"]');
  const imagesEl  = _root.querySelector('#rd-images');
  const imgPick   = _root.querySelector('#img-pick');

  autoGrow(bodyEl);
  bodyEl.addEventListener('input', () => {
    autoGrow(bodyEl);
    if (!previewEl.hidden) renderRichPreview(previewEl, bodyEl.value);
  });

  // Toolbar actions
  _root.querySelectorAll('.rich-btn').forEach(b => {
    b.onclick = () => handleToolbarAction(b.dataset.act, {
      title: titleEl, body: bodyEl, preview: previewEl, previewBtn,
      casualBtn, imgPick, note,
    });
  });

  // Image picker
  imgPick.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    await addImageFromFile(f, note);
    paintImages(imagesEl, note);
  });

  // Paste-to-insert images
  bodyEl.addEventListener('paste', async (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind === 'file' && (it.type || '').startsWith('image/')) {
        e.preventDefault();
        const file = it.getAsFile();
        if (file) {
          await addImageFromFile(file, note);
          paintImages(imagesEl, note);
        }
      }
    }
  });

  paintImages(imagesEl, note);

  _root.querySelector('#copy-title').onclick = () => copyValue(titleEl.value);
  _root.querySelector('#back').onclick   = backToList;
  _root.querySelector('#cancel').onclick = backToList;
  _root.querySelector('#save').onclick   = () => saveNote(note, isNew);
  _root.querySelector('#reader-open').onclick = () => {
    // Save current edits into note before opening reader
    note.title = titleEl.value;
    note.body  = bodyEl.value;
    openReaderLive(note);
  };
  if (!isNew) _root.querySelector('#del').onclick = () => deleteNote(note);
}

/* ---------- Toolbar action handler ---------- */
const COLOR_CYCLE = ['', 'lime', 'orange', 'red'];

function handleToolbarAction(action, ctx) {
  const { body: ta, preview, previewBtn, casualBtn, imgPick, note } = ctx;

  if (action === 'preview') {
    const showing = !preview.hidden;
    if (showing) {
      preview.hidden = true; ta.style.display = '';
      previewBtn.classList.remove('is-active');
    } else {
      renderRichPreview(preview, ta.value);
      preview.hidden = false; ta.style.display = 'none';
      previewBtn.classList.add('is-active');
    }
    return;
  }
  if (action === 'casual') {
    const will = !ta.classList.contains('is-casual');
    ta.classList.toggle('is-casual', will);
    preview.classList.toggle('is-casual', will);
    casualBtn.classList.toggle('is-active', will);
    note._casual = will;
    autoGrow(ta);
    return;
  }
  if (action === 'image') {
    imgPick.click();
    return;
  }
  if (action === 'copy') {
    copyValue(ta.value);
    return;
  }
  if (!preview.hidden) {
    toast('Toggle preview off to edit', 'warn');
    return;
  }

  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const value = ta.value;
  const sel   = value.slice(start, end) || 'text';

  let inserted;
  if (action === 'bold') {
    inserted = `**${sel}**`;
  } else if (action === 'headline') {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const e = lineEnd === -1 ? value.length : lineEnd;
    const line = value.slice(lineStart, e);
    const newLine = line.startsWith('## ') ? line.slice(3) : `## ${line}`;
    ta.value = value.slice(0, lineStart) + newLine + value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = lineStart + newLine.length;
    autoGrow(ta);
    return;
  } else if (action === 'color') {
    const next = COLOR_CYCLE[(COLOR_CYCLE.indexOf(ta.dataset.lastColor || '') + 1) % COLOR_CYCLE.length];
    ta.dataset.lastColor = next;
    inserted = next ? `[${next}]${sel}[/${next}]` : sel;
    if (!next) toast('Color cleared'); else toast(`Color: ${next}`);
  }

  if (inserted !== undefined) {
    ta.value = value.slice(0, start) + inserted + value.slice(end);
    ta.focus();
    ta.selectionStart = start;
    ta.selectionEnd = start + inserted.length;
    autoGrow(ta);
  }
}

/* ---------- Image handling ---------- */
async function addImageFromFile(file, note) {
  try {
    const compressed = await compressImage(file);
    const dataUrl = await blobToDataUrl(compressed);
    note.images = note.images || [];
    note.images.push({
      id: uuid(),
      data: dataUrl,
      size: compressed.size,
      addedAt: Date.now(),
    });
    toast(`✓ Image added (${(compressed.size / 1024).toFixed(0)} KB)`);
  } catch (err) {
    toast('Image failed: ' + err.message, 'err');
  }
}

function paintImages(container, note) {
  const imgs = note.images || [];
  if (imgs.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="rd-images__head">
      ${imgs.length} image${imgs.length === 1 ? '' : 's'} attached
    </div>
    <div class="rd-images__grid">
      ${imgs.map(im => `
        <div class="rd-image" data-id="${im.id}">
          <img src="${im.data}" alt="">
          <button class="rd-image__del" data-id="${im.id}" type="button" title="Remove">×</button>
        </div>
      `).join('')}
    </div>
  `;
  container.querySelectorAll('.rd-image__del').forEach(btn => {
    btn.onclick = () => {
      note.images = note.images.filter(im => im.id !== btn.dataset.id);
      paintImages(container, note);
      toast('Image removed');
    };
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Not an image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > MAX_IMG_DIM || height > MAX_IMG_DIM) {
          if (width >= height) { height = Math.round(height * (MAX_IMG_DIM / width)); width = MAX_IMG_DIM; }
          else                  { width = Math.round(width * (MAX_IMG_DIM / height)); height = MAX_IMG_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error('Encode failed'));
          resolve(blob);
        }, 'image/jpeg', IMG_QUALITY);
      } catch (err) {
        URL.revokeObjectURL(url); reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Load failed')); };
    img.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/* ---------- Save / delete ---------- */
async function saveNote(note, isNew) {
  const titleEl = _root.querySelector('#f-title');
  const bodyEl  = _root.querySelector('#f-body');
  note.title = titleEl.value.trim();
  note.body  = bodyEl.value;
  note.createdAt = note.createdAt || Date.now();
  note.updatedAt = Date.now();
  if (!note.title && !note.body && (!note.images || !note.images.length)) {
    toast('Empty note — add a title, body, or image', 'warn');
    return;
  }
  await db.put(STORE, note);
  await refreshCache();
  recordActivity('reader', note.title || 'Untitled note');
  toast(isNew ? '✓ Note saved' : '✓ Saved');
  backToList();
}

async function deleteNote(note) {
  if (!confirm(`Delete "${note.title || 'this note'}"? Cannot be undone.`)) return;
  await db.delete(STORE, note.id);
  await refreshCache();
  toast('✓ Deleted');
  backToList();
}

function backToList() { _editing = null; renderList(); }

/* ============================================================
   Reader (full-screen distraction-free reading)
   ============================================================ */
async function openReader(id) {
  const note = await db.get(STORE, id);
  if (!note) {
    toast('Note not found', 'err');
    return;
  }
  showReaderOverlay(note);
}

function openReaderLive(note) {
  // Used from the editor — current edits, not yet saved
  showReaderOverlay(note);
}

function showReaderOverlay(note) {
  _readerOpen = true;
  let overlay = document.getElementById('rd-reader');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'rd-reader';
  overlay.className = 'rd-reader';
  overlay.innerHTML = `
    <header class="rd-reader__top">
      <button class="rd-reader__close" id="rd-close">✕ CLOSE</button>
      <span class="rd-reader__title">${esc(note.title || 'Untitled')}</span>
      <button class="rd-reader__copy" id="rd-copy" title="Copy">⧉</button>
    </header>
    <main class="rd-reader__body" id="rd-body"></main>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector('#rd-body');
  // Render body (formatted) + images interleaved at end
  let html = renderRichToHtml(note.body || '');
  if (note.images && note.images.length > 0) {
    html += '<div class="rd-reader__imgs">';
    note.images.forEach(im => {
      html += `<img class="rd-reader__img" src="${im.data}" alt="">`;
    });
    html += '</div>';
  }
  if (!html.trim()) {
    html = '<div class="rd-reader__empty">This note is empty.</div>';
  }
  body.innerHTML = html;

  overlay.querySelector('#rd-close').onclick = closeReader;
  overlay.querySelector('#rd-copy').onclick = () => copyValue(note.body || '');

  // Esc closes
  document.addEventListener('keydown', readerKey);

  // Lock body scroll while reader is open
  document.body.style.overflow = 'hidden';
}

function readerKey(e) {
  if (e.key === 'Escape') closeReader();
}

function closeReader() {
  const overlay = document.getElementById('rd-reader');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', readerKey);
  document.body.style.overflow = '';
  _readerOpen = false;
}

/* ============================================================
   Rich rendering (shared shape with vault)
   ============================================================ */
function renderRichPreview(el, raw) {
  if (!raw || !raw.trim()) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = renderRichToHtml(raw);
}

function renderRichToHtml(raw) {
  let html = esc(raw);
  html = html.replace(/^##\s+(.+)$/gm, '<span class="rich-h">$1</span>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[(lime|orange|red)\]([\s\S]*?)\[\/\1\]/g,
    (_m, c, t) => `<span class="rich-c rich-c--${c}">${t}</span>`);
  html = html.replace(/\n/g, '<br>');
  return html;
}

/* ============================================================
   Helpers
   ============================================================ */
function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = (textarea.scrollHeight + 2) + 'px';
}
async function copyValue(value) {
  if (!value) { toast('Nothing to copy', 'warn'); return; }
  try { await navigator.clipboard.writeText(String(value)); toast('✓ Copied'); }
  catch { toast('Copy failed', 'err'); }
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) +
    ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
