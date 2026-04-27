/* ============================================================
   modules/ledger.js   (Sign-Up Kit — v0.7)
   Tile #1 on the home screen.

   Tracks accounts you've created on online platforms.
   Stored in IndexedDB (one store per module). Per-device only;
   no sync. Same modular shape as Document Hub & Vault.

   File still named "ledger.js" so the registry slot stays stable —
   only the module's internal id / name / fields change.
   ============================================================ */

import { db } from '../core/storage.js';
import { toast } from '../core/ui.js';

const STORE = 'signupkit';

const DOMAINS = [
  'GMAIL.COM',
  'OUTLOOK.COM',
  'YAHOO.COM',
  'AWS.COM',
  'AZURE.COM',
  'GOOGLE.COM',
  'ICLOUD.COM',
  'PROTONMAIL.COM',
  'Others',
];

let _root = null;
let _cache = [];
let _editing = null;        // null | { id|null }

export default {
  id: 'signupkit',
  name: 'Sign-Up Kit',
  tagline: 'accounts · recovery · share',
  status: 'ready',

  async render(root) {
    _root = root;
    await refreshCache();
    routeView();
  },

  cleanup() { _editing = null; },
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
  _root.innerHTML = `
    <div class="su-bar">
      <span class="su-bar__count">${total} ACCOUNT${total === 1 ? '' : 'S'}</span>
    </div>
    <button class="btn btn--primary su-add" id="add">+ ADD ACCOUNT</button>
    <div class="su-list">
      ${total === 0
        ? `<div class="placeholder">
             <div class="placeholder__icon">·</div>
             No accounts yet. Tap + ADD ACCOUNT.
           </div>`
        : _cache.map(rowHtml).join('')}
    </div>
  `;

  _root.querySelector('#add').onclick = () => {
    _editing = { id: null };
    renderEditor(_editing);
  };
  _root.querySelectorAll('.su-row').forEach(r => {
    r.onclick = () => { _editing = { id: r.dataset.id }; renderEditor(_editing); };
  });
}

function rowHtml(e) {
  const username = e.username || '—';
  const domain = e.domain === 'Others' ? (e.domainCustom || '—') : (e.domain || '');
  const handle = domain ? `${username}@${domain.toLowerCase()}` : username;
  const name = [e.firstName, e.lastName].filter(Boolean).join(' ') || e.accountName || '—';
  return `
    <button class="su-row" data-id="${e.id}">
      <div class="su-row__main">
        <div class="su-row__title">${esc(handle)}</div>
        <div class="su-row__sub">${esc(name)}</div>
      </div>
      <span class="su-row__chev">→</span>
    </button>
  `;
}

/* ============================================================
   Editor
   ============================================================ */
const FIELDS = [
  { key: 'username',     label: 'Username',     type: 'text', triggersAutoFill: true },
  { key: 'domain',       label: 'Domain',       type: 'select', options: DOMAINS, triggersAutoFill: true },
  { key: 'domainCustom', label: 'Custom Domain', type: 'text', dependsOn: { domain: 'Others' }, triggersAutoFill: true },
  { key: 'firstName',    label: 'First Name',   type: 'text' },
  { key: 'lastName',     label: 'Last Name',    type: 'text' },
  { key: 'accountName',  label: 'Account Name', type: 'text' },
  { key: 'mobile',       label: 'Mobile',       type: 'tel'  },
  { key: 'dob',          label: 'DOB',          type: 'date' },
  { key: 'url',          label: 'URL',          type: 'url'  },
  { key: 'notes',        label: 'Notes',        type: 'textarea' },
];

function renderEditor(state) {
  const isNew = !state.id;
  const entry = isNew
    ? { id: uuid() }
    : { ..._cache.find(e => e.id === state.id) };

  _root.innerHTML = `
    <button class="vault-crumb" id="back">← ACCOUNTS</button>
    <div class="su-editor-head">
      <span class="vault-chip vault-chip--ledger">${isNew ? 'NEW ACCOUNT' : 'EDIT ACCOUNT'}</span>
    </div>
    <div id="fields"></div>
    <div class="vault-actions">
      <button class="btn btn--primary" id="save">SAVE</button>
      <button class="btn" id="cancel">CANCEL</button>
      ${isNew ? '' : '<button class="btn vault-actions__del" id="del">DELETE</button>'}
    </div>
  `;

  const fieldsRoot = _root.querySelector('#fields');
  FIELDS.forEach(def => fieldsRoot.appendChild(buildField(def, entry)));

  // For existing entries, treat the saved accountName as user-set so we don't
  // overwrite it from autofill unless they clear it manually.
  const acctEl = fieldsRoot.querySelector('[data-key="accountName"]');
  if (acctEl && !isNew && acctEl.value) {
    acctEl.dataset.lastAuto = '__user__';   // never matches the auto pattern
  }

  _root.querySelector('#back').onclick   = backToList;
  _root.querySelector('#cancel').onclick = backToList;
  _root.querySelector('#save').onclick   = () => saveEntry(entry, isNew);
  if (!isNew) _root.querySelector('#del').onclick = () => deleteEntry(entry);

  applyDependencies(fieldsRoot);
}

function buildField(def, entry) {
  const wrap = document.createElement('label');
  wrap.className = 'vault-field';
  wrap.dataset.fieldKey = def.key;
  const value = entry[def.key] || '';

  if (def.type === 'select') {
    wrap.innerHTML = `
      <span class="vault-field__label">${def.label}</span>
      <div class="vault-pwrow">
        <select class="vault-select" data-key="${def.key}">
          <option value="">— Select —</option>
          ${def.options.map(o => `
            <option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}</option>
          `).join('')}
        </select>
        <button type="button" class="vault-pwrow__btn vault-pwrow__btn--copy" data-act="copy" title="Copy">⧉</button>
      </div>
    `;
    wrap.querySelector('select').addEventListener('change', e => {
      entry[def.key] = e.target.value;
      applyDependencies(_root.querySelector('#fields'));
      if (def.triggersAutoFill) maybeAutoFillAccountName();
    });
    wrap.querySelector('[data-act="copy"]').onclick = () =>
      copyValue(wrap.querySelector('select').value);
    return wrap;
  }

  if (def.type === 'textarea') {
    // Notes — auto-grow textarea, no preview, no duplication
    wrap.innerHTML = `
      <span class="vault-field__label">${def.label}</span>
      <div class="su-notes">
        <button type="button" class="vault-pwrow__btn vault-pwrow__btn--copy su-notes__copy"
                data-act="copy" title="Copy notes">⧉</button>
        <textarea class="vault-textarea su-notes__area" data-key="${def.key}"
                  rows="4" placeholder="Anything else worth remembering…">${esc(value)}</textarea>
      </div>
    `;
    const ta = wrap.querySelector('textarea');
    autoGrow(ta);
    ta.addEventListener('input', () => autoGrow(ta));
    wrap.querySelector('[data-act="copy"]').onclick = () => copyValue(ta.value);
    return wrap;
  }

  // text / tel / date / url with copy button
  wrap.innerHTML = `
    <span class="vault-field__label">${def.label}</span>
    <div class="vault-pwrow">
      <input type="${def.type}" data-key="${def.key}" value="${esc(value)}" autocomplete="off">
      <button type="button" class="vault-pwrow__btn vault-pwrow__btn--copy" data-act="copy" title="Copy">⧉</button>
    </div>
  `;
  const input = wrap.querySelector('input');
  if (def.triggersAutoFill) {
    input.addEventListener('input', maybeAutoFillAccountName);
  }
  wrap.querySelector('[data-act="copy"]').onclick = () => copyValue(input.value);
  return wrap;
}

/* Auto-fill Account Name from Username + Domain.
   Only writes if the field is empty OR currently equals the previous auto-value
   (so a user's manual override is never clobbered). */
function maybeAutoFillAccountName() {
  const fieldsRoot = _root.querySelector('#fields');
  if (!fieldsRoot) return;
  const usernameEl = fieldsRoot.querySelector('[data-key="username"]');
  const domainEl   = fieldsRoot.querySelector('[data-key="domain"]');
  const customEl   = fieldsRoot.querySelector('[data-key="domainCustom"]');
  const acctEl     = fieldsRoot.querySelector('[data-key="accountName"]');
  if (!usernameEl || !domainEl || !acctEl) return;

  const username = (usernameEl.value || '').trim();
  let domain = (domainEl.value || '').trim();
  if (domain === 'Others') domain = (customEl?.value || '').trim();
  if (!username || !domain) return;

  const next = `${username}@${domain.toLowerCase()}`;
  const current = (acctEl.value || '').trim();
  // Manual override protection: only fill if empty or matches previous auto-value
  if (current === '' || current === acctEl.dataset.lastAuto) {
    acctEl.value = next;
    acctEl.dataset.lastAuto = next;
  }
}

function applyDependencies(fieldsRoot) {
  FIELDS.forEach(def => {
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

async function saveEntry(entry, isNew) {
  const fieldsRoot = _root.querySelector('#fields');
  const next = { ...entry };
  FIELDS.forEach(def => {
    const ctrl = fieldsRoot.querySelector(`[data-key="${def.key}"]`);
    if (ctrl) next[def.key] = ctrl.value;
  });
  next.createdAt = entry.createdAt || Date.now();
  next.updatedAt = Date.now();

  if (!next.username && !next.firstName && !next.accountName) {
    toast('Add at least a username or name', 'warn');
    return;
  }
  await db.put(STORE, next);
  await refreshCache();
  toast(isNew ? '✓ Account added' : '✓ Saved');
  backToList();
}

async function deleteEntry(entry) {
  const label = entry.username || [entry.firstName, entry.lastName].filter(Boolean).join(' ') || 'this account';
  if (!confirm(`Delete "${label}"? Cannot be undone.`)) return;
  await db.delete(STORE, entry.id);
  await refreshCache();
  toast('✓ Deleted');
  backToList();
}

function backToList() { _editing = null; renderList(); }

/* ============================================================
   Helpers
   ============================================================ */
function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = (textarea.scrollHeight + 2) + 'px';
}
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
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
