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
import {
  downloadJson, readJsonFromFile, timestampStr,
  wrap, unwrap, askMergeOrReplace, mergeById,
  markBackupNow,
  dedupByContent, SIG,
} from '../core/backup.js';

const STORE_ACC  = 'signupkit';
const STORE_URL  = 'signup_urls';

const DOMAINS = [
  'GMAIL.COM','OUTLOOK.COM','YAHOO.COM','AWS.COM','AZURE.COM',
  'GOOGLE.COM','ICLOUD.COM','PROTONMAIL.COM','Others',
];

const COLOR_CYCLE = ['', 'lime', 'orange', 'red'];

let _root = null;
let _tab = 'urls';         // 'urls' | 'accounts'  — URLS shown first
let _accounts = [];
let _urls = [];
let _editing = null;       // null | { kind: 'account'|'url', id: id|null }
let _search = '';

// Password generator state
let _pwdHistory = new Set();
let _pwdLength = 12;
let _pwdSpecialMode = 'specific';  // 'specific' | 'nospecific'
let _pwdSpecialCount = 2;
let _pwdSpecialChars = '!@#$%&*';
let _pwdSmallMode = 'nospecific';
let _pwdSmallCount = 2;
let _pwdBigMode = 'nospecific';
let _pwdBigCount = 2;
let _pwdNumMode = 'nospecific';
let _pwdNumCount = 4;
let _pwdResult = '';
let _pwdError = '';

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
      <button class="filter-pill ${_tab === 'urls' ? 'is-active' : ''}" data-tab="urls">
        URLS (${urlCount})
      </button>
      <button class="filter-pill ${_tab === 'accounts' ? 'is-active' : ''}" data-tab="accounts">
        ACCOUNTS (${accCount})
      </button>
      <button class="filter-pill ${_tab === 'password' ? 'is-active' : ''}" data-tab="password">
        🔑 PASSWORD
      </button>
    </div>

    ${_tab !== 'password' ? `<div class="vault-tools">
      <button class="vault-tool-btn" id="exportBtn">⬇ EXPORT BACKUP</button>
      <button class="vault-tool-btn" id="importBtn">⬆ IMPORT BACKUP</button>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
      ${_tab === 'urls' ? '<button class="vault-tool-btn" id="urlOptToggle" title="URL options">⚙ URLS</button>' : ''}
    </div>` : ''}
    <div id="url-opts" style="display:none">
      <div class="vault-tools" style="margin-top:4px">
        <button class="vault-tool-btn" id="exportUrlsBtn">⬇ EXPORT JSON</button>
        <button class="vault-tool-btn" id="exportUrlsTxtBtn">⬇ EXPORT TXT</button>
        <button class="vault-tool-btn" id="importUrlsBtn">⬆ IMPORT URLS</button>
        <input type="file" id="importUrlsFile" accept=".txt,.html,.json,text/plain,text/html,application/json" hidden>
      </div>
    </div>

    ${_tab !== 'password' ? `<button class="btn btn--primary su-add" id="add">
      ${_tab === 'accounts' ? '+ ADD ACCOUNT' : '+ ADD URL'}
    </button>` : ''}

    ${showSearch && _tab !== 'password' ? `
      <div class="search-bar">
        <input type="search" id="search" class="search-input"
               placeholder="🔍 Search…" value="${esc(_search)}"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        ${_search ? '<button class="search-clear" id="searchClear" type="button">×</button>' : ''}
      </div>
    ` : ''}

    ${_tab === 'password' ? renderPasswordTab() : `<div class="su-list">
      ${list.length === 0
        ? renderEmpty()
        : filtered.length === 0
          ? `<div class="placeholder"><div class="placeholder__icon">·</div>No matches.</div>`
          : filtered.map(_tab === 'accounts' ? accountRowHtml : urlRowHtml).join('')}
    </div>`}
  `;

  // Tab switching
  _root.querySelectorAll('.filter-pill').forEach(btn => {
    btn.onclick = () => {
      _tab = btn.dataset.tab;
      _search = '';
      renderList();
    };
  });

  // Export / Import
  const _expBtn = _root.querySelector('#exportBtn');
  const _impBtn = _root.querySelector('#importBtn');
  if (_expBtn) _expBtn.onclick = exportSignupKit;
  if (_impBtn) _impBtn.onclick = () => _root.querySelector('#importFile').click();
  _root.querySelector('#importFile').onchange = handleImport;
  // URL-specific import (txt / html / json)
  const iuBtn = _root.querySelector('#importUrlsBtn');
  const iuFile = _root.querySelector('#importUrlsFile');
  // Toggle URL options panel
  const toggleBtn = _root.querySelector('#urlOptToggle');
  const urlOpts   = _root.querySelector('#url-opts');
  if (toggleBtn && urlOpts) {
    toggleBtn.onclick = () => {
      const visible = urlOpts.style.display !== 'none';
      urlOpts.style.display = visible ? 'none' : '';
      toggleBtn.classList.toggle('is-active', !visible);
    };
  }
  const euBtn = _root.querySelector('#exportUrlsBtn');
  if (euBtn) euBtn.onclick = exportUrls;
  const euTxtBtn = _root.querySelector('#exportUrlsTxtBtn');
  if (euTxtBtn) euTxtBtn.onclick = exportUrlsTxt;
  if (iuBtn) iuBtn.onclick = () => iuFile.click();
  if (iuFile) iuFile.onchange = handleImportUrls;

  // Add new
  const _addBtn = _root.querySelector('#add');
  if (_addBtn) _addBtn.onclick = () => {
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
    si.addEventListener('input', () => {
      _search = si.value;
      const pos = si.selectionStart;
      renderList();
      setTimeout(() => {
        const el = _root.querySelector('#search');
        if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch(e){} }
      }, 0);
    });
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
   Export / Import
   ============================================================ */

/* ============================================================
   Password Generator
   ============================================================ */

let _pwdVisible = false;   // show/hide password

function injectPwdCSS() {
  if (document.getElementById('pwd-gen-css')) return;
  const s = document.createElement('style');
  s.id = 'pwd-gen-css';
  s.textContent = `
    .pwd-gen { padding:8px 0; }
    .pwd-gen__section {
      background:#141410; border:1px solid #222; border-radius:8px;
      padding:14px; margin-bottom:10px;
    }
    .pwd-gen__label {
      font-size:11px; font-weight:700; letter-spacing:.1em;
      text-transform:uppercase; color:#777; margin-bottom:10px; display:block;
    }
    .pwd-gen__row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .pwd-gen__slider {
      flex:1; min-width:120px; height:6px;
      -webkit-appearance:none; appearance:none;
      background:#2a2a2a; border-radius:3px; outline:none; cursor:pointer;
      accent-color:#d4ff3a;
    }
    .pwd-gen__slider::-webkit-slider-thumb {
      -webkit-appearance:none; width:20px; height:20px;
      background:#d4ff3a; border-radius:50%; cursor:pointer;
    }
    .pwd-gen__len-num {
      width:54px; text-align:center; background:#1a1a1a;
      border:1px solid #444; border-radius:6px; color:#d4ff3a;
      font-size:18px; font-weight:700; padding:6px 4px; outline:none;
    }
    .pwd-gen__cat-head {
      display:flex; align-items:center; justify-content:space-between;
      gap:8px; flex-wrap:wrap;
    }
    .pwd-gen__cat-label { font-size:12px; font-weight:700; color:#ccc; }
    .pwd-gen__toggle {
      display:flex; border-radius:4px; overflow:hidden; border:1px solid #333;
    }
    .pwd-gen__tbtn {
      padding:5px 12px; font-size:10px; font-weight:700; letter-spacing:.07em;
      background:#1a1a1a; color:#555; border:none; cursor:pointer;
      transition:all .15s; white-space:nowrap;
    }
    .pwd-gen__tbtn.is-active { background:#d4ff3a; color:#0c0b09; }
    .pwd-gen__count-row {
      display:flex; align-items:center; gap:8px; margin-top:8px;
    }
    .pwd-gen__count-inp {
      width:50px; text-align:center; background:#1a1a1a;
      border:1px solid #333; border-radius:4px; color:#fff;
      font-size:13px; padding:6px 4px; outline:none;
    }
    .pwd-gen__count-lbl { font-size:11px; color:#666; }
    .pwd-gen__chars-inp {
      width:100%; background:#1a1a1a; border:1px solid #333;
      border-radius:4px; color:#d4ff3a; font-size:15px;
      font-family:monospace; padding:8px 10px; margin-top:8px;
      letter-spacing:3px; outline:none; box-sizing:border-box;
    }
    .pwd-gen__chars-inp::placeholder { color:#444; letter-spacing:1px; font-size:12px; }
    .pwd-gen__result-section { margin-top:6px; }
    .pwd-gen__result-box {
      background:#0c0b09; border:2px solid #d4ff3a; border-radius:8px;
      padding:16px 14px; position:relative;
    }
    .pwd-gen__result-row {
      display:flex; align-items:center; gap:10px; justify-content:center;
    }
    .pwd-gen__result {
      font-family:monospace; font-size:20px; color:#d4ff3a;
      word-break:break-all; letter-spacing:2px; flex:1; text-align:center;
    }
    .pwd-gen__eye {
      background:transparent; border:1px solid #333; border-radius:4px;
      color:#888; cursor:pointer; font-size:16px; padding:4px 8px;
      transition:color .15s; flex-shrink:0;
    }
    .pwd-gen__eye:hover { color:#d4ff3a; }
    .pwd-gen__actions {
      display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;
    }
    .pwd-gen__btn {
      flex:1; min-width:120px; padding:12px 16px; border-radius:6px;
      font-size:12px; font-weight:700; letter-spacing:.07em;
      cursor:pointer; border:none; transition:all .15s;
    }
    .pwd-gen__btn--gen {
      background:#d4ff3a; color:#0c0b09;
    }
    .pwd-gen__btn--gen:hover { background:#e5ff6a; }
    .pwd-gen__btn--copy {
      background:transparent; color:#d4ff3a; border:2px solid #d4ff3a !important;
      border-radius:6px;
    }
    .pwd-gen__btn--copy:hover { background:#1a1a1a; }
    .pwd-gen__error {
      background:#2a1010; border:1px solid #ff4444; border-radius:6px;
      padding:10px 14px; color:#ff8888; font-size:12px; margin-top:10px;
      text-align:center; line-height:1.5;
    }
    .pwd-gen__history {
      font-size:10px; color:#444; text-align:center; margin-top:8px;
      letter-spacing:.05em;
    }
  `;
  document.head.appendChild(s);
}

function renderCatSection(id, label, mode, count, extraHtml) {
  return `
    <div class="pwd-gen__section">
      <div class="pwd-gen__cat-head">
        <span class="pwd-gen__cat-label">${label}</span>
        <div class="pwd-gen__toggle">
          <button class="pwd-gen__tbtn ${mode === 'specific' ? 'is-active' : ''}"
                  data-cat="${id}" data-mode="specific" type="button">SPECIFIC</button>
          <button class="pwd-gen__tbtn ${mode === 'nospecific' ? 'is-active' : ''}"
                  data-cat="${id}" data-mode="nospecific" type="button">NO SPECIFIC</button>
        </div>
      </div>
      ${mode === 'specific' ? `
        <div class="pwd-gen__count-row">
          <span class="pwd-gen__count-lbl">Count:</span>
          <input type="number" class="pwd-gen__count-inp" id="pwd-${id}-count"
                 min="1" max="40" value="${count}"
                 autocomplete="off" autocorrect="off" autocapitalize="off">
        </div>
        ${extraHtml || ''}
      ` : ''}
    </div>`;
}

function renderPasswordTab() {
  injectPwdCSS();
  const maskedPwd = _pwdResult ? '*'.repeat(_pwdResult.length) : '';
  const displayPwd = _pwdVisible ? _pwdResult : maskedPwd;

  return `
    <div class="pwd-gen">
      <!-- Length -->
      <div class="pwd-gen__section">
        <span class="pwd-gen__label">Total Password Length (5 – 40)</span>
        <div class="pwd-gen__row">
          <input type="range" class="pwd-gen__slider" id="pwd-slider"
                 min="5" max="40" value="${_pwdLength}">
          <input type="number" class="pwd-gen__len-num" id="pwd-len"
                 min="5" max="40" value="${_pwdLength}"
                 autocomplete="off" autocorrect="off">
        </div>
      </div>

      ${renderCatSection('special', '🔣 Special Characters', _pwdSpecialMode, _pwdSpecialCount,
        `<input type="text" class="pwd-gen__chars-inp" id="pwd-special-chars"
                placeholder="Type your special chars e.g.  &amp;  @  #  *  !"
                value="${_pwdSpecialChars.replace(/"/g, '&quot;')}"
                autocomplete="off" autocorrect="off" spellcheck="false">`
      )}

      ${renderCatSection('small', '🔡 Small Characters (a – z)', _pwdSmallMode, _pwdSmallCount, '')}
      ${renderCatSection('big',   '🔠 Big Characters (A – Z)',   _pwdBigMode,   _pwdBigCount,   '')}
      ${renderCatSection('num',   '🔢 Numbers (0 – 9)',          _pwdNumMode,   _pwdNumCount,   '')}

      <!-- Actions -->
      <div class="pwd-gen__actions">
        <button class="pwd-gen__btn pwd-gen__btn--gen" id="pwd-generate" type="button">
          ⚡ GENERATE
        </button>
        ${_pwdResult ? `
          <button class="pwd-gen__btn pwd-gen__btn--copy" id="pwd-copy" type="button">
            📋 COPY PASSWORD
          </button>
        ` : ''}
      </div>

      ${_pwdError ? `<div class="pwd-gen__error">⚠ ${_pwdError}</div>` : ''}

      ${_pwdResult ? `
        <div class="pwd-gen__result-section">
          <div class="pwd-gen__result-box">
            <div class="pwd-gen__result-row">
              <div class="pwd-gen__result" id="pwd-display">${displayPwd}</div>
              <button class="pwd-gen__eye" id="pwd-eye" type="button" title="Show/Hide">
                ${_pwdVisible ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div class="pwd-gen__history">
            ${_pwdHistory.size} unique password${_pwdHistory.size === 1 ? '' : 's'} generated this session
          </div>
        </div>
      ` : ''}
    </div>`;
}

function bindPasswordEvents() {
  // Slider ↔ number input live sync (no full re-render — just update state + display)
  const slider = _root.querySelector('#pwd-slider');
  const lenInp = _root.querySelector('#pwd-len');

  if (slider) {
    slider.oninput = () => {
      _pwdLength = Math.max(5, Math.min(40, +slider.value));
      if (lenInp) lenInp.value = _pwdLength;
    };
  }
  if (lenInp) {
    lenInp.oninput = () => {
      _pwdLength = Math.max(5, Math.min(40, +lenInp.value || 5));
      if (slider) slider.value = _pwdLength;
    };
    lenInp.onblur = () => {
      _pwdLength = Math.max(5, Math.min(40, +lenInp.value || 5));
      lenInp.value = _pwdLength;
      if (slider) slider.value = _pwdLength;
    };
  }

  // Category toggle buttons → update state + re-render
  _root.querySelectorAll('.pwd-gen__tbtn').forEach(btn => {
    btn.onclick = () => {
      const cat = btn.dataset.cat, mode = btn.dataset.mode;
      if (cat === 'special') _pwdSpecialMode = mode;
      else if (cat === 'small') _pwdSmallMode = mode;
      else if (cat === 'big')   _pwdBigMode   = mode;
      else if (cat === 'num')   _pwdNumMode   = mode;
      renderList();
    };
  });

  // Count inputs — update state on every change
  const bind = (id, setter) => {
    const el = _root.querySelector(id);
    if (el) { el.oninput = el.onchange = () => setter(Math.max(1, +el.value || 1)); }
  };
  bind('#pwd-special-count', v => _pwdSpecialCount = v);
  bind('#pwd-small-count',   v => _pwdSmallCount   = v);
  bind('#pwd-big-count',     v => _pwdBigCount      = v);
  bind('#pwd-num-count',     v => _pwdNumCount      = v);

  // Custom special chars
  const charsEl = _root.querySelector('#pwd-special-chars');
  if (charsEl) charsEl.oninput = () => { _pwdSpecialChars = charsEl.value; };

  // Generate
  const genBtn = _root.querySelector('#pwd-generate');
  if (genBtn) genBtn.onclick = generatePassword;

  // Copy
  const copyBtn = _root.querySelector('#pwd-copy');
  if (copyBtn) copyBtn.onclick = () => {
    if (!_pwdResult) return;
    navigator.clipboard.writeText(_pwdResult)
      .then(() => toast('✓ Password copied to clipboard'))
      .catch(() => {
        const ta = Object.assign(document.createElement('textarea'),
          { value: _pwdResult, style: 'position:fixed;opacity:0' });
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        toast('✓ Password copied');
      });
  };

  // Show / Hide eye toggle
  const eyeBtn = _root.querySelector('#pwd-eye');
  const display = _root.querySelector('#pwd-display');
  if (eyeBtn && display) {
    eyeBtn.onclick = () => {
      _pwdVisible = !_pwdVisible;
      display.textContent = _pwdVisible ? _pwdResult : '*'.repeat(_pwdResult.length);
      eyeBtn.textContent  = _pwdVisible ? '🙈' : '👁';
    };
  }
}

function generatePassword() {
  _pwdError = '';
  _pwdVisible = false;

  const LOWER  = 'abcdefghijklmnopqrstuvwxyz';
  const UPPER  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIGITS = '0123456789';
  const DEFAULT_SPECIAL = '!@#$%&*()-_=+[]{}|;:,.<>?';

  // Read latest values from DOM inputs before generating
  const syncNum = (id, min, max, fallback) => {
    const el = _root.querySelector(id);
    return el ? Math.max(min, Math.min(max, +el.value || fallback)) : fallback;
  };
  _pwdLength       = syncNum('#pwd-len', 5, 40, _pwdLength);
  _pwdSpecialCount = syncNum('#pwd-special-count', 1, 40, _pwdSpecialCount);
  _pwdSmallCount   = syncNum('#pwd-small-count', 1, 40, _pwdSmallCount);
  _pwdBigCount     = syncNum('#pwd-big-count', 1, 40, _pwdBigCount);
  _pwdNumCount     = syncNum('#pwd-num-count', 1, 40, _pwdNumCount);
  const chEl = _root.querySelector('#pwd-special-chars');
  if (chEl) _pwdSpecialChars = chEl.value;

  const specialPool = (_pwdSpecialChars.trim() || DEFAULT_SPECIAL);

  // Validate
  if (_pwdSpecialMode === 'specific' && specialPool.length === 0) {
    _pwdError = 'Enter at least one special character in the input box.';
    renderList(); return;
  }

  let specificTotal = 0;
  if (_pwdSpecialMode === 'specific') specificTotal += _pwdSpecialCount;
  if (_pwdSmallMode   === 'specific') specificTotal += _pwdSmallCount;
  if (_pwdBigMode     === 'specific') specificTotal += _pwdBigCount;
  if (_pwdNumMode     === 'specific') specificTotal += _pwdNumCount;

  if (specificTotal > _pwdLength) {
    _pwdError = `Specific counts total ${specificTotal} but password length is only ${_pwdLength}. Reduce counts or increase length.`;
    renderList(); return;
  }

  // Build filler pool from "no specific" categories
  let fillerPool = '';
  if (_pwdSpecialMode === 'nospecific') fillerPool += specialPool;
  if (_pwdSmallMode   === 'nospecific') fillerPool += LOWER;
  if (_pwdBigMode     === 'nospecific') fillerPool += UPPER;
  if (_pwdNumMode     === 'nospecific') fillerPool += DIGITS;

  const remaining = _pwdLength - specificTotal;
  if (remaining > 0 && fillerPool.length === 0) {
    // All specific but gap remains → use all pools as filler
    fillerPool = LOWER + UPPER + DIGITS + specialPool;
  }

  const rand = pool => pool[Math.floor(Math.random() * pool.length)];

  // Generate with uniqueness retry
  let attempts = 0, pwd = '';
  do {
    const chars = [];
    if (_pwdSpecialMode === 'specific') {
      for (let i = 0; i < _pwdSpecialCount; i++) chars.push(rand(specialPool));
    }
    if (_pwdSmallMode === 'specific') {
      for (let i = 0; i < _pwdSmallCount; i++) chars.push(rand(LOWER));
    }
    if (_pwdBigMode === 'specific') {
      for (let i = 0; i < _pwdBigCount; i++) chars.push(rand(UPPER));
    }
    if (_pwdNumMode === 'specific') {
      for (let i = 0; i < _pwdNumCount; i++) chars.push(rand(DIGITS));
    }
    for (let i = 0; i < remaining; i++) chars.push(rand(fillerPool));

    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    pwd = chars.join('');
    attempts++;
  } while (_pwdHistory.has(pwd) && attempts < 200);

  if (_pwdHistory.has(pwd)) {
    _pwdError = 'Could not generate a unique password. Try different settings or increase length.';
    renderList(); return;
  }

  _pwdHistory.add(pwd);
  _pwdResult = pwd;
  renderList();
}


async function exportSignupKit() {
  try {
    const payload = {
      accounts: _accounts,
      urls: _urls,
    };
    const counts = `${_accounts.length}acc-${_urls.length}url`;
    downloadJson(`signupkit-${timestampStr()}-${counts}.json`, wrap('signupkit', payload));
    markBackupNow();
    toast(`✓ Exported ${_accounts.length} accounts, ${_urls.length} URLs`);
  } catch (err) {
    toast('Export failed: ' + err.message, 'err');
  }
}

async function handleImport(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const obj = await readJsonFromFile(file);
    const payload = unwrap(obj, 'signupkit');
    const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    const urls = Array.isArray(payload.urls) ? payload.urls : [];

    const choice = await askMergeOrReplace('Sign-Up Kit', {
      current: `${_accounts.length} acc, ${_urls.length} URL`,
      incoming: `${accounts.length} acc, ${urls.length} URL`,
    });
    if (!choice) return;

    if (choice === 'replace') {
      if (!confirm('Delete ALL current accounts and URLs, then load from backup?')) return;
      // Clear current
      for (const a of _accounts) await db.delete(STORE_ACC, a.id);
      for (const u of _urls)     await db.delete(STORE_URL, u.id);
      // Load backup
      for (const a of accounts) await db.put(STORE_ACC, a);
      for (const u of urls)     await db.put(STORE_URL, u);
    } else {
      // Merge — newer wins per ID, then content-dedup catches drifted IDs
      const mergedAccounts = mergeById(_accounts, accounts);
      const mergedUrls     = mergeById(_urls, urls);
      const dedupA = dedupByContent(mergedAccounts, SIG.signupkit);
      const dedupU = dedupByContent(mergedUrls, SIG.signup_urls);
      for (const a of dedupA.removed) await db.delete(STORE_ACC, a.id);
      for (const u of dedupU.removed) await db.delete(STORE_URL, u.id);
      for (const a of dedupA.kept)    await db.put(STORE_ACC, a);
      for (const u of dedupU.kept)    await db.put(STORE_URL, u);
    }
    await refreshCache();
    renderList();
    toast(`✓ Imported (${choice})`);
  } catch (err) {
    toast('Import failed: ' + err.message, 'err');
  }
}

/* ============================================================
   Import URLs — accepts .txt / .html (Edge Collections) / .json
   ============================================================ */
async function exportUrlsTxt() {
  if (!_urls.length) { toast('No URLs to export', 'warn'); return; }
  /* Plain text — one URL per line, compatible with IMPORT URLS */
  const lines = _urls.map(u => u.url).join('\n');
  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `signupkit-urls-${timestampStr()}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast(`✓ Exported ${_urls.length} URLs as TXT`);
}

async function exportUrls() {
  try {
    if (!_urls.length) { toast('No URLs to export', 'warn'); return; }
    const payload = { urls: _urls };
    const filename = `signupkit-urls-${timestampStr()}-${_urls.length}urls.json`;
    downloadJson(filename, wrap('signupkit', payload));
    markBackupNow();
    toast(`✓ Exported ${_urls.length} URLs`);
  } catch (err) {
    toast('Export failed: ' + err.message, 'err');
  }
}

async function handleImportUrls(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const text = await file.text();
  let imported = [];

  if (file.name.endsWith('.html') || text.includes('NETSCAPE-Bookmark') || text.includes('<DL>')) {
    imported = parseEdgeBookmarks(text);
  } else if (file.name.endsWith('.json')) {
    try {
      const data = JSON.parse(text);
      // Accept signupkit export, urls-only export, or plain array
      const arr = data.urls || (data.payload && data.payload.urls) || (Array.isArray(data) ? data : []);
      imported = arr.map(u => ({
        name: u.name || u.title || getDomainFrom(u.url || u.href || ''),
        url:  u.url  || u.href || '',
        notes: u.notes || u.description || '',
        category: u.category || u.folder || '',
      })).filter(u => u.url);
    } catch(err) { toast('Invalid JSON — ' + err.message, 'err'); return; }
  } else {
    // Plain text: one URL per line
    imported = parsePlainText(text);
  }

  if (!imported.length) { toast('No URLs found in file', 'warn'); return; }

  const existing = await db.getAll(STORE_URL);
  const existingSet = new Set(existing.map(u => u.url));
  let added = 0;
  for (const item of imported) {
    if (!item.url || existingSet.has(item.url)) continue;
    await db.put(STORE_URL, {
      id: uuid(), url: item.url,
      name: item.name || getDomainFrom(item.url),
      notes: item.notes || '',
      category: item.category || '',
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    added++;
  }
  await refreshCache();
  renderList();
  toast('✓ Imported ' + added + ' new URL' + (added !== 1 ? 's' : ''));
}

function parseEdgeBookmarks(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const results = [];
  div.querySelectorAll('a[href]').forEach(a => {
    const url = a.getAttribute('href') || '';
    if (!url || url.startsWith('javascript:') || url.startsWith('place:')) return;
    // Try to find folder/category from parent H3
    let category = '';
    let el = a.parentElement;
    for (let i = 0; i < 6; i++) {
      if (!el) break;
      const prev = el.previousElementSibling;
      if (prev && (prev.tagName === 'H3' || prev.tagName === 'H2')) {
        category = prev.textContent.trim();
        break;
      }
      el = el.parentElement;
    }
    results.push({ url, name: a.textContent.trim() || getDomainFrom(url), category });
  });
  return results;
}

function parsePlainText(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .filter(l => /^https?:\/\//i.test(l) || (l.includes('.') && !l.includes(' ')))
    .map(l => {
      const url = /^https?:\/\//i.test(l) ? l : 'https://' + l;
      return { url, name: getDomainFrom(url) };
    });
}

function getDomainFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e) { return url; }
}

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
