/* ============================================================
   modules/vault.js
   Encrypted password vault.
   - Master password → PBKDF2-SHA256 (250k) → AES-GCM key
   - Encrypted blob in localStorage; key only in memory
   - Auto-locks on leaving module + 5 min idle
   - Last 5 password history per entry
   - Generator + show/hide toggle
   ============================================================ */

const STORAGE_KEY = 'smartapp_vault_v1';
const PBKDF2_ITERATIONS = 250000;
const IDLE_MS = 5 * 60 * 1000;
const HISTORY_MAX = 5;

// In-memory only — wiped on lock/cleanup
let _key = null;
let _entries = [];
let _root = null;
let _idleTimer = null;
let _editingId = null;     // null | 'new' | <uuid>

export default {
  id: 'vault',
  name: 'Vault',
  tagline: 'master · entries · history',
  status: 'ready',

  render(root) {
    _root = root;
    routeView();
  },

  cleanup() {
    lock();
  },
};

/* ---------- View routing ---------- */
function routeView() {
  if (!hasVault())          return renderSetup();
  if (!_key)                return renderUnlock();
  if (_editingId)           return renderEditor(_editingId);
  return renderList();
}
function hasVault() { return !!localStorage.getItem(STORAGE_KEY); }

/* ---------- Crypto ---------- */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBlob(plain, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify(plain))
  );
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

async function decryptBlob(blob, key) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(blob.iv) },
    key,
    b64ToBytes(blob.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

function bytesToB64(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/* ---------- Storage ---------- */
function loadStored() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
function saveStored(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}
async function persist() {
  const stored = loadStored();
  const blob = await encryptBlob(_entries, _key);
  saveStored({ ...stored, ...blob });
}

/* ---------- Lock / idle ---------- */
function lock() {
  _key = null;
  _entries = [];
  _editingId = null;
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
}
function bumpIdle() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    lock();
    if (_root && _root.isConnected) routeView();
  }, IDLE_MS);
}

/* ============================================================
   VIEWS
   ============================================================ */

function renderSetup() {
  _root.innerHTML = `
    <div class="vault-pad">
      <div class="vault-pad__hint">FIRST RUN — CREATE MASTER PASSWORD</div>
      <div class="vault-pad__warn">
        ⚠ Not recoverable. Forget this password and your vault is gone.
        Use 10+ characters, mixed.
      </div>
      <input type="password" class="vault-input" id="pw1"
             placeholder="Master password" autocomplete="new-password">
      <input type="password" class="vault-input" id="pw2"
             placeholder="Confirm master password" autocomplete="new-password">
      <div class="vault-err" id="err"></div>
      <button class="btn btn--primary vault-cta" id="create">CREATE VAULT</button>
      <div class="vault-pad__caveat">
        Use this for low-stakes accounts only. Store banking / primary email /
        recovery codes in a real password manager.
      </div>
    </div>
  `;
  _root.querySelector('#create').onclick = handleCreate;
  _root.querySelector('#pw2').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleCreate();
  });
}

async function handleCreate() {
  const pw1 = _root.querySelector('#pw1').value;
  const pw2 = _root.querySelector('#pw2').value;
  const err = _root.querySelector('#err');
  err.textContent = '';
  if (pw1.length < 8)  return err.textContent = 'Use at least 8 characters.';
  if (pw1 !== pw2)     return err.textContent = 'Passwords do not match.';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  _key = await deriveKey(pw1, salt);
  _entries = [];
  saveStored({ salt: bytesToB64(salt), iv: '', ct: '' });
  await persist();
  bumpIdle();
  renderList();
}

function renderUnlock() {
  _root.innerHTML = `
    <div class="vault-pad">
      <div class="vault-pad__hint">VAULT LOCKED</div>
      <input type="password" class="vault-input" id="pw"
             placeholder="Master password" autocomplete="current-password" autofocus>
      <div class="vault-err" id="err"></div>
      <button class="btn btn--primary vault-cta" id="unlock">UNLOCK</button>
    </div>
  `;
  _root.querySelector('#unlock').onclick = handleUnlock;
  _root.querySelector('#pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleUnlock();
  });
}

async function handleUnlock() {
  const pw = _root.querySelector('#pw').value;
  const err = _root.querySelector('#err');
  const inp = _root.querySelector('#pw');
  err.textContent = '';
  const stored = loadStored();
  try {
    const key = await deriveKey(pw, b64ToBytes(stored.salt));
    _entries = stored.ct ? await decryptBlob({ iv: stored.iv, ct: stored.ct }, key) : [];
    _key = key;
    bumpIdle();
    renderList();
  } catch {
    err.textContent = 'Wrong password.';
    inp.value = '';
    inp.classList.add('shake');
    setTimeout(() => inp.classList.remove('shake'), 400);
  }
}

function renderList() {
  bumpIdle();
  const sorted = [..._entries].sort((a, b) =>
    (a.title || '').localeCompare(b.title || ''));

  _root.innerHTML = `
    <div class="vault-bar">
      <span class="vault-bar__count">
        ${_entries.length} ENTR${_entries.length === 1 ? 'Y' : 'IES'}
      </span>
      <span class="vault-bar__info">AUTO-LOCK 5MIN</span>
      <button class="vault-bar__lock" id="lockNow">⚿ LOCK</button>
    </div>
    <button class="btn btn--primary vault-add" id="add">+ ADD ENTRY</button>
    <div class="vault-list">
      ${sorted.length === 0
        ? `<div class="placeholder">
             <div class="placeholder__icon">·</div>
             No entries yet. Tap + ADD ENTRY.
           </div>`
        : sorted.map(e => `
          <button class="vault-row" data-id="${e.id}">
            <div class="vault-row__main">
              <div class="vault-row__title">${esc(e.title || 'Untitled')}</div>
              <div class="vault-row__sub">${esc(e.username || '—')}</div>
            </div>
            <span class="vault-row__chev">→</span>
          </button>
        `).join('')}
    </div>
  `;
  _root.querySelector('#add').onclick = () => { _editingId = 'new'; renderEditor('new'); };
  _root.querySelector('#lockNow').onclick = () => { lock(); routeView(); };
  _root.querySelectorAll('.vault-row').forEach(r => {
    r.onclick = () => { _editingId = r.dataset.id; renderEditor(r.dataset.id); };
  });
}

function renderEditor(id) {
  bumpIdle();
  const isNew = id === 'new';
  const entry = isNew
    ? { id: uuid(), title: '', username: '', password: '', url: '', notes: '', history: [] }
    : _entries.find(e => e.id === id);

  _root.innerHTML = `
    <button class="vault-crumb" id="back">← ENTRIES</button>

    <label class="vault-field">
      <span class="vault-field__label">Title</span>
      <input type="text" id="f-title" value="${esc(entry.title)}" placeholder="Gmail, Twitter, …">
    </label>

    <label class="vault-field">
      <span class="vault-field__label">Username</span>
      <input type="text" id="f-username" value="${esc(entry.username)}" autocomplete="off">
    </label>

    <label class="vault-field">
      <span class="vault-field__label">Password</span>
      <div class="vault-pwrow">
        <input type="password" id="f-password" value="${esc(entry.password)}" autocomplete="new-password">
        <button class="vault-pwrow__btn" id="show" title="Show / hide" type="button">●●●</button>
        <button class="vault-pwrow__btn" id="gen"  title="Generate strong" type="button">⚘</button>
      </div>
    </label>

    <label class="vault-field">
      <span class="vault-field__label">URL</span>
      <input type="url" id="f-url" value="${esc(entry.url)}" placeholder="https://">
    </label>

    <label class="vault-field">
      <span class="vault-field__label">Notes</span>
      <textarea id="f-notes" rows="4">${esc(entry.notes)}</textarea>
    </label>

    ${entry.history && entry.history.length > 0 ? `
      <div class="vault-history">
        <div class="vault-history__head">PASSWORD HISTORY · LAST ${HISTORY_MAX}</div>
        ${entry.history.map((h, i) => `
          <div class="vault-history__row">
            <span class="vault-history__pw" data-pw="${esc(h.password)}" data-idx="${i}">
              ●●●●●●●●●●●●
            </span>
            <span class="vault-history__date">
              ${new Date(h.changedAt).toLocaleDateString()}
            </span>
            <button class="vault-history__reveal" data-idx="${i}" type="button">show</button>
          </div>
        `).join('')}
      </div>` : ''}

    <div class="vault-actions">
      <button class="btn btn--primary" id="save">SAVE</button>
      <button class="btn" id="cancel">CANCEL</button>
      ${isNew ? '' : '<button class="btn vault-actions__del" id="del">DELETE</button>'}
    </div>
  `;

  // Bump idle on any input
  ['#f-title','#f-username','#f-password','#f-url','#f-notes'].forEach(s => {
    _root.querySelector(s).addEventListener('input', bumpIdle);
  });

  _root.querySelector('#back').onclick = backToList;
  _root.querySelector('#cancel').onclick = backToList;

  _root.querySelector('#show').onclick = () => {
    const inp = _root.querySelector('#f-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };
  _root.querySelector('#gen').onclick = () => {
    const inp = _root.querySelector('#f-password');
    inp.value = generatePassword(16);
    inp.type = 'text';
  };

  _root.querySelectorAll('.vault-history__reveal').forEach(btn => {
    btn.onclick = () => {
      const i = btn.dataset.idx;
      const span = _root.querySelector(`.vault-history__pw[data-idx="${i}"]`);
      const real = span.dataset.pw;
      const showing = span.textContent.trim() === real;
      span.textContent = showing ? '●●●●●●●●●●●●' : real;
      btn.textContent = showing ? 'show' : 'hide';
    };
  });

  _root.querySelector('#save').onclick = async () => {
    const next = {
      id: entry.id,
      title:    _root.querySelector('#f-title').value.trim(),
      username: _root.querySelector('#f-username').value.trim(),
      password: _root.querySelector('#f-password').value,
      url:      _root.querySelector('#f-url').value.trim(),
      notes:    _root.querySelector('#f-notes').value,
      history:  entry.history || [],
      createdAt: entry.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (!next.title) { alert('Title is required.'); return; }

    // Push old password to history if it changed
    if (!isNew && entry.password && entry.password !== next.password) {
      next.history = [
        { password: entry.password, changedAt: entry.updatedAt || Date.now() },
        ...(entry.history || [])
      ].slice(0, HISTORY_MAX);
    }

    if (isNew) _entries.push(next);
    else {
      const i = _entries.findIndex(e => e.id === entry.id);
      _entries[i] = next;
    }
    await persist();
    backToList();
  };

  if (!isNew) {
    _root.querySelector('#del').onclick = async () => {
      if (!confirm(`Delete "${entry.title}"? Cannot be undone.`)) return;
      _entries = _entries.filter(e => e.id !== entry.id);
      await persist();
      backToList();
    };
  }
}

function backToList() { _editingId = null; renderList(); }

/* ---------- Helpers ---------- */
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function generatePassword(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let pw = '';
  for (let i = 0; i < len; i++) pw += chars[arr[i] % chars.length];
  return pw;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
