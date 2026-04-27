/* ============================================================
   modules/vault.js   (v0.5 — vault expansion)
   - Master password (PBKDF2-SHA256, 250k → AES-GCM)
   - Encrypted blob in localStorage; key only in memory
   - Auto-locks on leaving module + 5 min idle (kicks to unlock screen)
   - Four entry kinds: personal | ledger | project | basic
   - Per-field copy buttons everywhere
   - Password generator: defaults to 30 chars, manual entry also fine
   - Password history (5-deep) on every password field
   - Rich notes: bold / headline / color, plain-text markers under the hood
   ============================================================ */

import { toast } from '../core/ui.js';

const STORAGE_KEY = 'smartapp_vault_v1';
const PBKDF2_ITERATIONS = 250000;
const IDLE_MS = 5 * 60 * 1000;
const HISTORY_MAX = 5;
const GEN_DEFAULT_LEN = 30;

const PROVIDERS = ['Gmail','Claude','Instagram','Facebook','Outlook',
                   'Netflix','AWS','Azure','Google','Others'];

// In-memory only — wiped on lock/cleanup
let _key = null;
let _entries = [];
let _root = null;
let _idleTimer = null;
let _editing = null;          // null | { kind, id|null }

export default {
  id: 'vault',
  name: 'Vault',
  tagline: 'master · entries · history',
  status: 'ready',

  render(root) {
    _root = root;
    routeView();
  },

  cleanup() { lock(); },
};

/* ============================================================
   View routing
   ============================================================ */
function routeView() {
  if (!hasVault())  return renderSetup();
  if (!_key)        return renderUnlock();
  if (_editing)     return renderEditor(_editing);
  return renderList();
}
function hasVault() { return !!localStorage.getItem(STORAGE_KEY); }

/* ============================================================
   Crypto
   ============================================================ */
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

/* ============================================================
   Storage
   ============================================================ */
function loadStored() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
function saveStored(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }
async function persist() {
  const stored = loadStored();
  const blob = await encryptBlob(_entries, _key);
  saveStored({ ...stored, ...blob });
}

/* ============================================================
   Lock / idle
   ============================================================ */
function lock() {
  _key = null;
  _entries = [];
  _editing = null;
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
}
function bumpIdle() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    lock();
    if (_root && _root.isConnected) {
      routeView();                       // forces unlock screen
      toast('Vault auto-locked', 'warn');
    }
  }, IDLE_MS);
}

/* ============================================================
   SETUP / UNLOCK SCREENS
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
        Use this for low-stakes accounts only. Bank / primary email /
        recovery codes belong in a real password manager.
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
  if (pw1.length < 8) return err.textContent = 'Use at least 8 characters.';
  if (pw1 !== pw2)    return err.textContent = 'Passwords do not match.';
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

/* ============================================================
   LIST SCREEN
   ============================================================ */
function renderList() {
  bumpIdle();
  const sorted = [..._entries].sort((a, b) => (b.updatedAt||0) - (a.updatedAt||0));

  _root.innerHTML = `
    <div class="vault-bar">
      <span class="vault-bar__count">
        ${_entries.length} ENTR${_entries.length === 1 ? 'Y' : 'IES'}
      </span>
      <span class="vault-bar__info">AUTO-LOCK 5MIN</span>
      <button class="vault-bar__lock" id="lockNow">⚿ LOCK</button>
    </div>

    <div class="vault-tools">
      <button class="vault-tool-btn" id="exportBtn">⬇ EXPORT BACKUP</button>
      <button class="vault-tool-btn" id="importBtn">⬆ IMPORT BACKUP</button>
      <input type="file" id="importFile" accept=".smartvault,application/json" hidden>
    </div>

    <div class="vault-addgroup">
      <button class="btn btn--primary vault-add" data-kind="personal">+ PERSONAL</button>
      <button class="btn btn--primary vault-add" data-kind="ledger">+ LEDGER</button>
      <button class="btn btn--primary vault-add" data-kind="project">+ PROJECT</button>
      <button class="btn btn--primary vault-add" data-kind="basic">+ BASIC</button>
    </div>

    <div class="vault-list">
      ${sorted.length === 0
        ? `<div class="placeholder">
             <div class="placeholder__icon">·</div>
             No entries yet. Tap one of the + buttons above.
           </div>`
        : sorted.map(rowHtml).join('')}
    </div>
  `;

  _root.querySelectorAll('.vault-add').forEach(btn => {
    btn.onclick = () => {
      _editing = { kind: btn.dataset.kind, id: null };
      renderEditor(_editing);
    };
  });
  _root.querySelector('#lockNow').onclick = () => { lock(); routeView(); };
  _root.querySelector('#exportBtn').onclick = exportVault;
  _root.querySelector('#importBtn').onclick = () => _root.querySelector('#importFile').click();
  _root.querySelector('#importFile').onchange = handleImport;
  _root.querySelectorAll('.vault-row').forEach(r => {
    r.onclick = () => {
      const e = _entries.find(x => x.id === r.dataset.id);
      _editing = { kind: e.kind || 'personal', id: r.dataset.id };
      renderEditor(_editing);
    };
  });
}

function rowHtml(e) {
  const kind = e.kind || 'personal';
  const title = displayTitle(e);
  const sub   = displaySub(e);
  return `
    <button class="vault-row" data-id="${e.id}">
      <span class="vault-chip vault-chip--${kind}">${kind.toUpperCase()}</span>
      <div class="vault-row__main">
        <div class="vault-row__title">${esc(title)}</div>
        <div class="vault-row__sub">${esc(sub)}</div>
      </div>
      <span class="vault-row__chev">→</span>
    </button>
  `;
}

function displayTitle(e) {
  if (e.kind === 'project') return e.projectName || 'Untitled project';
  if (e.kind === 'ledger')  return e.title || e.provider || 'Untitled ledger';
  if (e.kind === 'basic')   return e.username || 'Untitled basic';
  return e.title || 'Untitled';
}
function displaySub(e) {
  if (e.kind === 'project') return e.username || e.projectEmail || '—';
  if (e.kind === 'ledger')  return [e.provider, e.username].filter(Boolean).join(' · ') || '—';
  if (e.kind === 'basic')   return '—';
  return e.username || '—';
}

/* ============================================================
   FIELD DEFINITIONS — driven by entry kind
   ============================================================ */
const FIELD_DEFS = {
  personal: [
    { key: 'title',    label: 'Title',    type: 'text' },
    { key: 'username', label: 'Username', type: 'text' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'url',      label: 'URL',      type: 'url' },
    { key: 'notes',    label: 'Notes',    type: 'rich' },
  ],
  ledger: [
    { key: 'provider',       label: 'Provider', type: 'select', options: PROVIDERS },
    { key: 'providerCustom', label: 'Custom Provider', type: 'text', dependsOn: { provider: 'Others' } },
    { key: 'title',          label: 'Title',    type: 'text' },
    { key: 'username',       label: 'Username', type: 'text' },
    { key: 'password',       label: 'Password', type: 'password' },
    { key: 'url',            label: 'URL',      type: 'url' },
    { key: 'apiKey',         label: 'API Key',  type: 'password' },
    { key: 'notes',          label: 'Notes',    type: 'rich' },
  ],
  project: [
    { key: 'projectName',     label: 'Project Name',     type: 'text' },
    { key: 'username',        label: 'Username',         type: 'text' },
    { key: 'projectEmail',    label: 'Project Email',    type: 'email' },
    { key: 'projectEmailPw',  label: 'Project Email Password', type: 'password' },
    { key: 'productEmail',    label: 'Project Product Email', type: 'email' },
    { key: 'productPw',       label: 'Project Product Password', type: 'password' },
    { key: 'url1',            label: 'Project URL 1',    type: 'url' },
    { key: 'url2',            label: 'Project URL 2',    type: 'url' },
    { key: 'url3',            label: 'Project URL 3',    type: 'url' },
    { key: 'contact',         label: 'Project Contact',  type: 'text' },
    { key: 'notes',           label: 'Notes',            type: 'rich' },
  ],
  basic: [
    { key: 'username', label: 'Username', type: 'text' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'notes',    label: 'Notes',    type: 'rich' },
  ],
};

/* ============================================================
   EDITOR SCREEN
   ============================================================ */
function renderEditor(state) {
  bumpIdle();
  const isNew = !state.id;
  const kind  = state.kind;
  const defs  = FIELD_DEFS[kind] || FIELD_DEFS.personal;
  const entry = isNew
    ? { id: uuid(), kind, history: {} }
    : { ..._entries.find(e => e.id === state.id) };

  if (!entry.history) entry.history = {};

  const kindLabel = ({
    personal: 'PERSONAL ENTRY',
    ledger:   'LEDGER ENTRY',
    project:  'PROJECT ENTRY',
    basic:    'BASIC ENTRY',
  })[kind];

  _root.innerHTML = `
    <button class="vault-crumb" id="back">← ENTRIES</button>
    <div class="vault-editor-head">
      <span class="vault-chip vault-chip--${kind}">${kindLabel}</span>
    </div>
    <div id="fields"></div>

    <div class="vault-actions">
      <button class="btn btn--primary" id="save">SAVE</button>
      <button class="btn" id="cancel">CANCEL</button>
      ${isNew ? '' : '<button class="btn vault-actions__del" id="del">DELETE</button>'}
    </div>
  `;

  const fieldsRoot = _root.querySelector('#fields');
  defs.forEach(def => fieldsRoot.appendChild(buildField(def, entry)));

  _root.querySelector('#back').onclick   = backToList;
  _root.querySelector('#cancel').onclick = backToList;
  _root.querySelector('#save').onclick   = () => saveEntry(entry, defs, isNew);
  if (!isNew) _root.querySelector('#del').onclick = () => deleteEntry(entry);

  // Bump idle on any input
  fieldsRoot.addEventListener('input', bumpIdle);
  fieldsRoot.addEventListener('focusin', bumpIdle);

  applyDependencies(defs, fieldsRoot);
}

/* ---------- Field builder ---------- */
function buildField(def, entry) {
  const wrap = document.createElement('label');
  wrap.className = 'vault-field';
  wrap.dataset.fieldKey = def.key;

  const value = entry[def.key] || '';

  if (def.type === 'select') {
    wrap.innerHTML = `
      <span class="vault-field__label">${def.label}</span>
      <select class="vault-select" data-key="${def.key}">
        <option value="">— Select —</option>
        ${def.options.map(o => `
          <option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}</option>
        `).join('')}
      </select>
    `;
    wrap.querySelector('select').addEventListener('change', e => {
      entry[def.key] = e.target.value;
      applyDependencies(FIELD_DEFS[entry.kind], _root.querySelector('#fields'));
    });
    return wrap;
  }

  if (def.type === 'rich') {
    wrap.classList.add('vault-field--rich');
    wrap.innerHTML = `
      <span class="vault-field__label">${def.label}</span>
      <div class="rich-toolbar">
        <button type="button" class="rich-btn" data-act="bold"     title="Bold"><b>B</b></button>
        <button type="button" class="rich-btn" data-act="headline" title="Headline"><b>H</b></button>
        <button type="button" class="rich-btn" data-act="color"    title="Color"><span style="color:var(--lime)">◐</span></button>
        <button type="button" class="rich-btn" data-act="preview"  title="Toggle preview"><span>👁</span></button>
        <span class="rich-spacer"></span>
        <button type="button" class="rich-btn rich-btn--copy" data-act="copy" title="Copy">⧉</button>
      </div>
      <textarea class="vault-textarea rich-area" data-key="${def.key}"
                rows="4" placeholder="Markers: **bold**  ## headline  [lime]text[/lime]">${esc(value)}</textarea>
      <div class="rich-preview" data-for="${def.key}" hidden></div>
    `;
    const ta      = wrap.querySelector('textarea');
    const preview = wrap.querySelector('.rich-preview');
    const previewBtn = wrap.querySelector('[data-act="preview"]');
    autoGrow(ta);
    ta.addEventListener('input', () => {
      autoGrow(ta);
      if (!preview.hidden) renderRichPreview(preview, ta.value);
    });
    wrap.querySelectorAll('.rich-btn').forEach(b => {
      b.onclick = () => handleRichAction(b.dataset.act, ta, preview, previewBtn);
    });
    return wrap;
  }

  // text / url / email / password — all rendered with optional copy + (for password) show/gen
  const isPw = def.type === 'password';
  const inputType = isPw ? 'password' : (def.type === 'email' ? 'email' : (def.type === 'url' ? 'url' : 'text'));

  wrap.innerHTML = `
    <span class="vault-field__label">${def.label}</span>
    <div class="vault-pwrow">
      <input type="${inputType}" data-key="${def.key}" value="${esc(value)}"
             autocomplete="off" ${isPw ? 'spellcheck="false"' : ''}>
      ${isPw ? `
        <button type="button" class="vault-pwrow__btn" data-act="show" title="Show / hide">●●●</button>
        <button type="button" class="vault-pwrow__btn" data-act="gen"  title="Generate strong (30 chars)">⚘</button>
      ` : ''}
      <button type="button" class="vault-pwrow__btn vault-pwrow__btn--copy" data-act="copy" title="Copy">⧉</button>
    </div>
    ${isPw && entry.history[def.key] && entry.history[def.key].length > 0 ? historyHtml(def.key, entry.history[def.key]) : ''}
  `;

  const input = wrap.querySelector('input');
  if (isPw) {
    wrap.querySelector('[data-act="show"]').onclick = () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    };
    wrap.querySelector('[data-act="gen"]').onclick = () => {
      input.value = generatePassword(GEN_DEFAULT_LEN);
      input.type = 'text';
      toast('✓ Generated 30-char password');
    };
  }
  wrap.querySelector('[data-act="copy"]').onclick = () => copyValue(input.value);

  // History reveal
  wrap.querySelectorAll('.vault-history__reveal').forEach(btn => {
    btn.onclick = () => {
      const i = btn.dataset.idx;
      const span = wrap.querySelector(`.vault-history__pw[data-idx="${i}"]`);
      const real = span.dataset.pw;
      const showing = span.textContent.trim() === real;
      span.textContent = showing ? '●●●●●●●●●●●●' : real;
      btn.textContent = showing ? 'show' : 'hide';
    };
  });
  wrap.querySelectorAll('.vault-history__copy').forEach(btn => {
    btn.onclick = () => copyValue(btn.dataset.pw);
  });

  return wrap;
}

function historyHtml(fieldKey, history) {
  return `
    <div class="vault-history">
      <div class="vault-history__head">PASSWORD HISTORY · LAST ${HISTORY_MAX}</div>
      ${history.map((h, i) => `
        <div class="vault-history__row">
          <span class="vault-history__pw" data-pw="${esc(h.password)}" data-idx="${i}">●●●●●●●●●●●●</span>
          <span class="vault-history__date">${new Date(h.changedAt).toLocaleDateString()}</span>
          <button class="vault-history__reveal" data-idx="${i}" type="button">show</button>
          <button class="vault-history__copy" data-pw="${esc(h.password)}" type="button">copy</button>
        </div>
      `).join('')}
    </div>
  `;
}

/* ---------- Dependent fields (e.g. providerCustom shows only when provider=Others) ---------- */
function applyDependencies(defs, fieldsRoot) {
  defs.forEach(def => {
    if (!def.dependsOn) return;
    const wrap = fieldsRoot.querySelector(`[data-field-key="${def.key}"]`);
    if (!wrap) return;
    const matches = Object.entries(def.dependsOn).every(([k, v]) => {
      const ctrl = fieldsRoot.querySelector(`[data-key="${k}"]`);
      return ctrl && ctrl.value === v;
    });
    wrap.style.display = matches ? '' : 'none';
  });
}

/* ============================================================
   Rich notes — formatting actions
   ============================================================ */
const COLOR_CYCLE = ['', 'lime', 'orange', 'red'];

function handleRichAction(action, textarea, preview, previewBtn) {
  if (action === 'preview') {
    const showing = !preview.hidden;
    if (showing) {
      // Hide preview, show textarea
      preview.hidden = true;
      textarea.style.display = '';
      if (previewBtn) previewBtn.classList.remove('is-active');
    } else {
      // Show preview, hide textarea
      renderRichPreview(preview, textarea.value);
      preview.hidden = false;
      textarea.style.display = 'none';
      if (previewBtn) previewBtn.classList.add('is-active');
    }
    return;
  }

  if (action === 'copy') {
    copyValue(textarea.value);
    return;
  }

  // Block formatting actions while preview is showing
  if (!preview.hidden) {
    toast('Toggle preview off to edit', 'warn');
    return;
  }

  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const value = textarea.value;
  const sel   = value.slice(start, end) || 'text';

  let inserted;
  if (action === 'bold') {
    inserted = `**${sel}**`;
  } else if (action === 'headline') {
    // headline acts on whole line — find line bounds
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const e = lineEnd === -1 ? value.length : lineEnd;
    const line = value.slice(lineStart, e);
    const newLine = line.startsWith('## ') ? line.slice(3) : `## ${line}`;
    textarea.value = value.slice(0, lineStart) + newLine + value.slice(e);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = lineStart + newLine.length;
    autoGrow(textarea);
    return;
  } else if (action === 'color') {
    // pick next color in cycle
    const next = COLOR_CYCLE[(COLOR_CYCLE.indexOf(textarea.dataset.lastColor || '') + 1) % COLOR_CYCLE.length];
    textarea.dataset.lastColor = next;
    inserted = next ? `[${next}]${sel}[/${next}]` : sel;
    if (!next) toast('Color cleared');
    else toast(`Color: ${next}`);
  }

  if (inserted !== undefined) {
    textarea.value = value.slice(0, start) + inserted + value.slice(end);
    textarea.focus();
    textarea.selectionStart = start;
    textarea.selectionEnd = start + inserted.length;
    autoGrow(textarea);
  }
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = (textarea.scrollHeight + 2) + 'px';
}

function renderRichPreview(el, raw) {
  if (!raw || !raw.trim()) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  // Encode first, then convert markers — order matters
  let html = esc(raw);
  // Headline:  ## something  (start of line)
  html = html.replace(/^##\s+(.+)$/gm, '<span class="rich-h">$1</span>');
  // Bold:  **anything**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Color:  [lime]text[/lime] etc.
  html = html.replace(/\[(lime|orange|red)\]([\s\S]*?)\[\/\1\]/g,
    (_m, c, t) => `<span class="rich-c rich-c--${c}">${t}</span>`);
  // Newlines
  html = html.replace(/\n/g, '<br>');
  el.innerHTML = html;
}

/* ============================================================
   Save / delete
   ============================================================ */
async function saveEntry(entry, defs, isNew) {
  // Read all field values from DOM
  const fieldsRoot = _root.querySelector('#fields');
  const next = { ...entry };
  defs.forEach(def => {
    const ctrl = fieldsRoot.querySelector(`[data-key="${def.key}"]`);
    if (ctrl) next[def.key] = ctrl.value;
  });
  next.kind = entry.kind;
  next.history = entry.history || {};
  next.createdAt = entry.createdAt || Date.now();
  next.updatedAt = Date.now();

  // Validate per kind
  const titleField = displayTitle(next);
  if (!titleField || titleField.startsWith('Untitled')) {
    toast('A title / name is required', 'warn');
    return;
  }

  // Push old passwords into history if changed
  if (!isNew) {
    const old = _entries.find(e => e.id === entry.id) || {};
    defs.filter(d => d.type === 'password').forEach(d => {
      const oldVal = old[d.key];
      const newVal = next[d.key];
      if (oldVal && oldVal !== newVal) {
        next.history[d.key] = [
          { password: oldVal, changedAt: old.updatedAt || Date.now() },
          ...(next.history[d.key] || []),
        ].slice(0, HISTORY_MAX);
      }
    });
  }

  if (isNew) _entries.push(next);
  else {
    const i = _entries.findIndex(e => e.id === entry.id);
    _entries[i] = next;
  }
  await persist();
  toast(isNew ? '✓ Entry created' : '✓ Saved');
  backToList();
}

async function deleteEntry(entry) {
  const t = displayTitle(entry);
  if (!confirm(`Delete "${t}"? Cannot be undone.`)) return;
  _entries = _entries.filter(e => e.id !== entry.id);
  await persist();
  toast('✓ Deleted');
  backToList();
}

function backToList() { _editing = null; renderList(); }

/* ============================================================
   Export / Import (Layer 2 backup)
   - File is JSON containing the encrypted blob + salt
   - Master password is still required to decrypt on import
   - Same crypto as the live vault — just a portable copy
   ============================================================ */

async function exportVault() {
  const stored = loadStored();
  if (!stored || !stored.salt) {
    toast('Nothing to export yet', 'warn');
    return;
  }
  // Re-encrypt the current in-memory entries so the export reflects the
  // latest state, even if the user hasn't edited anything since unlock.
  const blob = await encryptBlob(_entries, _key);
  const payload = {
    app: 'SmartApp',
    kind: 'vault-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    salt: stored.salt,
    iv: blob.iv,
    ct: blob.ct,
  };
  const json = JSON.stringify(payload, null, 2);
  const file = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smartapp-vault-${date}.smartvault`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('✓ Backup exported');
}

async function handleImport(e) {
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
  if (!payload.salt || !payload.iv || !payload.ct) {
    toast('Backup file is missing data', 'err');
    return;
  }

  const proceed = confirm(
    'Importing will REPLACE your current vault entries with the ones from the backup file.\n\n' +
    'Make sure you remember the master password used when this backup was made.\n\n' +
    'Continue?'
  );
  if (!proceed) return;

  const pw = prompt('Master password used for this backup:');
  if (!pw) return;

  try {
    const key = await deriveKey(pw, b64ToBytes(payload.salt));
    const entries = await decryptBlob({ iv: payload.iv, ct: payload.ct }, key);
    if (!Array.isArray(entries)) throw new Error('Decryption returned non-array');

    // Replace local vault with imported one
    saveStored({ salt: payload.salt, iv: payload.iv, ct: payload.ct });
    _key = key;
    _entries = entries;
    bumpIdle();
    renderList();
    toast(`✓ Imported ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  } catch {
    toast('Wrong password or corrupted backup', 'err');
  }
}

/* ============================================================
   Helpers
   ============================================================ */
async function copyValue(value) {
  if (value == null || value === '') {
    toast('Nothing to copy', 'warn');
    return;
  }
  try {
    await navigator.clipboard.writeText(String(value));
    toast('✓ Copied');
  } catch {
    toast('Copy failed', 'err');
  }
}
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
