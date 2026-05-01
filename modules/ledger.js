/* ============================================================
   modules/ledger.js   (Sign-Up Kit — v0.10)
   Two independent lists behind tabs:
   - ACCOUNTS: user accounts on platforms (existing)
   - URLS:     standalone URL bookmarks
   Each list has its own search box (appears at 10+ entries).
   Notes use the full Vault-style toolbar (B/H/◐/👁/aA/⧉) + casual mode.
   ============================================================ */

import { db } from '../core/storage.js';
import { toast } from '../core/ui.js';
import { recordActivity } from '../core/profile.js';
import { openReaderOverlay } from '../core/reader-overlay.js';

const STORE_ACC  = 'signupkit';
const STORE_URL  = 'signup_urls';

const DOMAINS = [
  'GMAIL.COM','OUTLOOK.COM','YAHOO.COM','AWS.COM','AZURE.COM',
  'GOOGLE.COM','ICLOUD.COM','PROTONMAIL.COM','Others',
];

const COLOR_CYCLE = ['', 'lime', 'orange', 'red'];

let _root = null;
let _tab = 'accounts';     // 'accounts' | 'urls'
let _accounts = [];
let _urls = [];
let _editing = null;       // null | { kind: 'account'|'url', id: id|null }
let _search = '';

export default {
  id: 'signupkit',
  name: 'Sign-Up Kit',
  tagline: 'accounts · urls · share',
  status: 'ready',

  async render(root) {
    _root = root;
    await refreshCache();
    routeView();
  },

  cleanup() { _editing = null; _search = ''; },
};

/* ============================================================
   Routing
   ============================================================ */
function routeView() {
  if (_editing) renderEditor(_editing);
  else renderList();
}

async function refreshCache() {
  _accounts = await db.getAll(STORE_ACC);
  _urls     = await db.getAll(STORE_URL);
  _accounts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  _urls.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/* ============================================================
   List screen
   ============================================================ */
function renderList() {
  const accCount = _accounts.length;
  const urlCount = _urls.length;
  const list     = _tab === 'accounts' ? _accounts : _urls;
  const showSearch = list.length >= 5;

  const filtered = list.filter(item => {
    if (!_search) return true;
    return JSON.stringify(item).toLowerCase().includes(_search.toLowerCase());
  });

  _root.innerHTML = `
    <div class="filter-bar filter-bar--tabs">
      <button class="filter-pill ${_tab === 'accounts' ? 'is-active' : ''}" data-tab="accounts">
        ACCOUNTS (${accCount})
      </button>
      <button class="filter-pill ${_tab === 'urls' ? 'is-active' : ''}" data-tab="urls">
        URLS (${urlCount})
      </button>
    </div>

    <button class="btn btn--primary su-add" id="add">
      ${_tab === 'accounts' ? '+ ADD ACCOUNT' : '+ ADD URL'}
    </button>

    ${showSearch ? `
      <div class="search-bar">
        <input type="search" id="search" class="search-input"
               placeholder="🔍 Search…" value="${esc(_search)}">
        ${_search ? '<button class="search-clear" id="searchClear" type="button">×</button>' : ''}
      </div>
    ` : ''}

    <div class="su-list">
      ${list.length === 0
        ? renderEmpty()
        : filtered.length === 0
          ? `<div class="placeholder"><div class="placeholder__icon">·</div>No matches.</div>`
          : filtered.map(_tab === 'accounts' ? accountRowHtml : urlRowHtml).join('')}
    </div>
  `;

  // Tab switching
  _root.querySelectorAll('.filter-pill').forEach(btn => {
    btn.onclick = () => {
      _tab = btn.dataset.tab;
      _search = '';
      renderList();
    };
  });

  // Add new
  _root.querySelector('#add').onclick = () => {
    _editing = { kind: _tab === 'accounts' ? 'account' : 'url', id: null };
    renderEditor(_editing);
  };
  const empty = _root.querySelector('#empty-add');
  if (empty) empty.onclick = () => {
    _editing = { kind: _tab === 'accounts' ? 'account' : 'url', id: null };
    renderEditor(_editing);
  };

  // Search
  if (showSearch) {
    const si = _root.querySelector('#search');
    si.addEventListener('input', () => { _search = si.value; renderList(); setTimeout(() => si.focus(), 0); });
    const sc = _root.querySelector('#searchClear');
    if (sc) sc.onclick = () => { _search = ''; renderList(); };
  }

  // Account rows: tap to edit
  _root.querySelectorAll('.su-row').forEach(r => {
    r.onclick = () => {
      _editing = { kind: 'account', id: r.dataset.id };
      renderEditor(_editing);
    };
  });

  // URL rows: open / copy / edit
  _root.querySelectorAll('.url-row').forEach(r => {
    r.querySelector('.url-row__main').onclick = () => {
      _editing = { kind: 'url', id: r.dataset.id };
      renderEditor(_editing);
    };
    r.querySelector('.url-row__open').onclick = (e) => {
      e.stopPropagation();
      const url = _urls.find(u => u.id === r.dataset.id)?.url;
      if (url) window.open(url, '_blank', 'noopener');
    };
    r.querySelector('.url-row__copy').onclick = (e) => {
      e.stopPropagation();
      const url = _urls.find(u => u.id === r.dataset.id)?.url;
      copyValue(url);
    };
  });
}

function renderEmpty() {
  if (_tab === 'accounts') {
    return `
      <div class="empty-card">
        <div class="empty-card__icon">⊕</div>
        <div class="empty-card__title">No accounts logged</div>
        <div class="empty-card__desc">Add the first account you'd hate to lose track of.</div>
        <div class="empty-card__chips">
          <button class="empty-card__chip" id="empty-add">+ Add account</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="empty-card">
      <div class="empty-card__icon">⊕</div>
      <div class="empty-card__title">No URLs saved</div>
      <div class="empty-card__desc">Save links you find yourself looking up again and again.</div>
      <div class="empty-card__chips">
        <button class="empty-card__chip" id="empty-add">+ Add URL</button>
      </div>
    </div>
  `;
}

function accountRowHtml(e) {
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

function urlRowHtml(u) {
  const display = (u.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
  return `
    <div class="url-row" data-id="${u.id}">
      <div class="url-row__main">
        <div class="url-row__title">${esc(u.name || 'Untitled URL')}</div>
        <div class="url-row__url">${esc(display)}</div>
      </div>
      <button class="url-row__btn url-row__open" type="button" title="Open">🌐</button>
      <button class="url-row__btn url-row__copy" type="button" title="Copy URL">⧉</button>
    </div>
  `;
}

/* ============================================================
   Editor — accounts (existing) and URLs (new)
   ============================================================ */
const ACCOUNT_FIELDS = [
  { key: 'username',     label: 'Username',     type: 'text', triggersAutoFill: true },
  { key: 'domain',       label: 'Domain',       type: 'select', options: DOMAINS, triggersAutoFill: true },
  { key: 'domainCustom', label: 'Custom Domain', type: 'text', dependsOn: { domain: 'Others' }, triggersAutoFill: true },
  { key: 'firstName',    label: 'First Name',   type: 'text' },
  { key: 'lastName',     label: 'Last Name',    type: 'text' },
  { key: 'accountName',  label: 'Account Name', type: 'text' },
  { key: 'mobile',       label: 'Mobile',       type: 'tel'  },
  { key: 'dob',          label: 'DOB',          type: 'date' },
  { key: 'url',          label: 'URL',          type: 'url'  },
  { key: 'notes',        label: 'Notes',        type: 'rich' },
];

const URL_FIELDS = [
  { key: 'name',  label: 'Name',  type: 'text' },
  { key: 'url',   label: 'URL',   type: 'url'  },
  { key: 'notes', label: 'Notes', type: 'rich' },
];

function renderEditor(state) {
  const isNew = !state.id;
  const isUrl = state.kind === 'url';
  const defs = isUrl ? URL_FIELDS : ACCOUNT_FIELDS;
  const list = isUrl ? _urls : _accounts;
  const entry = isNew
    ? { id: uuid() }
    : { ...list.find(e => e.id === state.id) };

  const headLabel = isNew
    ? (isUrl ? 'NEW URL' : 'NEW ACCOUNT')
    : (isUrl ? 'EDIT URL' : 'EDIT ACCOUNT');

  _root.innerHTML = `
    <button class="vault-crumb" id="back">← ${isUrl ? 'URLS' : 'ACCOUNTS'}</button>
    <div class="su-editor-head">
      <span class="vault-chip vault-chip--${isUrl ? 'project' : 'ledger'}">${headLabel}</span>
    </div>
    <div id="fields"></div>
    <div class="vault-actions">
      <button class="btn btn--primary" id="save">SAVE</button>
      ${isUrl && entry.url ? '<button class="btn" id="open">🌐 OPEN</button>' : ''}
      <button class="btn" id="cancel">CANCEL</button>
      ${isNew ? '' : '<button class="btn vault-actions__del" id="del">DELETE</button>'}
    </div>
  `;

  const fieldsRoot = _root.querySelector('#fields');
  defs.forEach(def => fieldsRoot.appendChild(buildField(def, entry)));

  // Existing accountName: protect from autofill
  if (!isUrl) {
    const acctEl = fieldsRoot.querySelector('[data-key="accountName"]');
    if (acctEl && !isNew && acctEl.value) acctEl.dataset.lastAuto = '__user__';
    applyDependencies(fieldsRoot);
  }

  _root.querySelector('#back').onclick   = backToList;
  _root.querySelector('#cancel').onclick = backToList;
  _root.querySelector('#save').onclick   = () => saveEntry(entry, defs, isNew, isUrl);
  if (!isNew) _root.querySelector('#del').onclick = () => deleteEntry(entry, isUrl);
  if (isUrl) {
    const openBtn = _root.querySelector('#open');
    if (openBtn) openBtn.onclick = () => {
      const u = _root.querySelector('[data-key="url"]')?.value;
      if (u) window.open(u, '_blank', 'noopener');
    };
  }
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

  if (def.type === 'rich') {
    wrap.classList.add('vault-field--rich');
    const isCasual = !!entry._casualNotes;
    wrap.innerHTML = `
      <span class="vault-field__label">${def.label}</span>
      <div class="rich-toolbar">
        <button type="button" class="rich-btn" data-act="bold"     title="Bold"><b>B</b></button>
        <button type="button" class="rich-btn" data-act="headline" title="Headline"><b>H</b></button>
        <button type="button" class="rich-btn" data-act="color"    title="Color"><span style="color:var(--lime)">◐</span></button>
        <button type="button" class="rich-btn" data-act="preview"  title="Toggle preview"><span>👁</span></button>
        <button type="button" class="rich-btn ${isCasual ? 'is-active' : ''}" data-act="casual" title="Casual reading mode">aA</button>
        <button type="button" class="rich-btn" data-act="reader"   title="Open in reader">📖</button>
        <span class="rich-spacer"></span>
        <button type="button" class="rich-btn rich-btn--copy" data-act="copy" title="Copy">⧉</button>
      </div>
      <textarea class="vault-textarea rich-area ${isCasual ? 'is-casual' : ''}" data-key="${def.key}"
                rows="4" placeholder="Markers: **bold**  ## headline  [lime]text[/lime]">${esc(value)}</textarea>
      <div class="rich-preview ${isCasual ? 'is-casual' : ''}" hidden></div>
    `;
    const ta = wrap.querySelector('textarea');
    const preview = wrap.querySelector('.rich-preview');
    const previewBtn = wrap.querySelector('[data-act="preview"]');
    const casualBtn  = wrap.querySelector('[data-act="casual"]');
    autoGrow(ta);
    ta.addEventListener('input', () => {
      autoGrow(ta);
      if (!preview.hidden) renderRichPreview(preview, ta.value);
    });
    wrap.querySelectorAll('.rich-btn').forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === 'casual') {
          const will = !ta.classList.contains('is-casual');
          ta.classList.toggle('is-casual', will);
          preview.classList.toggle('is-casual', will);
          casualBtn.classList.toggle('is-active', will);
          entry._casualNotes = will;
          autoGrow(ta);
          return;
        }
        if (b.dataset.act === 'reader') {
          // Build a sensible title from the entry
          const title = entry.name || entry.title || entry.username
            || [entry.firstName, entry.lastName].filter(Boolean).join(' ')
            || (entry.url ? 'URL note' : 'Account note');
          openReaderOverlay({ title, body: ta.value });
          return;
        }
        handleRichAction(b.dataset.act, ta, preview, previewBtn);
      };
    });
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
  if (def.triggersAutoFill) input.addEventListener('input', maybeAutoFillAccountName);
  wrap.querySelector('[data-act="copy"]').onclick = () => copyValue(input.value);
  return wrap;
}

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
  if (current === '' || current === acctEl.dataset.lastAuto) {
    acctEl.value = next;
    acctEl.dataset.lastAuto = next;
  }
}

function applyDependencies(fieldsRoot) {
  ACCOUNT_FIELDS.forEach(def => {
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

/* ---------- Rich action handler ---------- */
function handleRichAction(action, ta, preview, previewBtn) {
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
  if (action === 'copy') { copyValue(ta.value); return; }
  if (!preview.hidden) { toast('Toggle preview off to edit', 'warn'); return; }

  const start = ta.selectionStart, end = ta.selectionEnd;
  const value = ta.value;
  const sel = value.slice(start, end) || 'text';
  let inserted;
  if (action === 'bold') inserted = `**${sel}**`;
  else if (action === 'headline') {
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

function renderRichPreview(el, raw) {
  if (!raw || !raw.trim()) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  let html = esc(raw);
  html = html.replace(/^##\s+(.+)$/gm, '<span class="rich-h">$1</span>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[(lime|orange|red)\]([\s\S]*?)\[\/\1\]/g,
    (_m, c, t) => `<span class="rich-c rich-c--${c}">${t}</span>`);
  html = html.replace(/\n/g, '<br>');
  el.innerHTML = html;
}

/* ---------- Save / delete ---------- */
async function saveEntry(entry, defs, isNew, isUrl) {
  const fieldsRoot = _root.querySelector('#fields');
  const next = { ...entry };
  defs.forEach(def => {
    const ctrl = fieldsRoot.querySelector(`[data-key="${def.key}"]`);
    if (ctrl) next[def.key] = ctrl.value;
  });
  next.createdAt = entry.createdAt || Date.now();
  next.updatedAt = Date.now();
  if (entry._casualNotes) next._casualNotes = true;

  if (isUrl) {
    if (!next.name && !next.url) { toast('Add a name or URL', 'warn'); return; }
    await db.put(STORE_URL, next);
    await refreshCache();
    recordActivity('signupkit', `URL: ${next.name || next.url}`);
  } else {
    if (!next.username && !next.firstName && !next.accountName) {
      toast('Add at least a username or name', 'warn');
      return;
    }
    await db.put(STORE_ACC, next);
    await refreshCache();
    const label = next.username || [next.firstName, next.lastName].filter(Boolean).join(' ') || next.accountName || 'account';
    recordActivity('signupkit', label);
  }
  toast(isNew ? '✓ Added' : '✓ Saved');
  backToList();
}

async function deleteEntry(entry, isUrl) {
  const label = isUrl
    ? (entry.name || entry.url || 'this URL')
    : (entry.username || [entry.firstName, entry.lastName].filter(Boolean).join(' ') || 'this account');
  if (!confirm(`Delete "${label}"? Cannot be undone.`)) return;
  await db.delete(isUrl ? STORE_URL : STORE_ACC, entry.id);
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
  if (value == null || value === '') { toast('Nothing to copy', 'warn'); return; }
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
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
