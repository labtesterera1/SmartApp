/* ============================================================
   modules/careerdetails.js  — Career Details (v1.0)
   ─ Password-protected, AES-GCM encrypted (same crypto as Vault)
   ─ Tabs: Work Experience · Education · Certifications ·
           Profile Photos · Resume · Company Applications
   ─ Each section: dynamic add/edit/delete + Reader-style comments
   ─ File attachments stored as base64 in encrypted blob
   ─ Export / Import (password-protected JSON)
   ─ Auto-lock after 5 min idle
   ============================================================ */

import { toast } from '../core/ui.js';
import { openReaderOverlay } from '../core/reader-overlay.js';
import { recordActivity } from '../core/profile.js';
import { db } from '../core/storage.js';
import { goToModule } from '../core/router.js';

const STORAGE_KEY    = 'smartapp_careerdetails_v1';
const IDB_STORE      = 'careerdetails';   // IndexedDB store holding encrypted file blobs
const MODULE_BUILD    = '2026-06-19.4'; // bump on every shipped fix so it's visible on-screen
const PBKDF2_ITER    = 250000;
const IDLE_MS        = 5 * 60 * 1000;
const HISTORY_MAX    = 5;

/* ── in-memory state (wiped on lock) ── */
let _key      = null;
let _data     = null;   // decrypted object
let _root     = null;
let _tab      = 'work'; // active tab id
let _idleTimer = null;
let _editCtx  = null;   // { section, id|null }

/* ── default data shape ── */
function emptyData() {
  return {
    work:   [],   // work experience entries
    edu:    [],   // education entries
    certs:  [],   // certificates
    photos: [],   // profile photos (versioned)
    resume: [],   // resume versions
    companies: [], // job applications
    idproof:  [],  // ID proofs (Aadhar, Passport, PAN etc.)
    dossier:  [],  // personal/professional documents
  };
}

/* ============================================================
   Module export
   ============================================================ */
export default {
  id: 'careerdetails',
  name: 'Career Details',
  tagline: 'secure · personal · professional',
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
  if (_editCtx)     return renderEditor(_editCtx);
  return renderMain();
}
function hasVault() { return !!localStorage.getItem(STORAGE_KEY); }

/* ============================================================
   Crypto  (AES-GCM + PBKDF2 — identical to Vault module)
   ============================================================ */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
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
    key, b64ToBytes(blob.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}
function bytesToB64(bytes) { let s=''; for (const b of bytes) s+=String.fromCharCode(b); return btoa(s); }
function b64ToBytes(b64)   { const s=atob(b64),u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i); return u; }

/* ── Storage helpers — identical pattern to Vault ── */
function loadStored()    { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):null; }
function saveStored(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }
async function persist() {
  // spread stored first so the original salt is ALWAYS preserved
  const stored = loadStored();
  const blob   = await encryptBlob(_data, _key);
  saveStored({ ...stored, ...blob });
}

/* ============================================================
   File blob storage — IndexedDB (NOT localStorage)
   localStorage has a hard ~5-10MB quota shared across the whole
   site. Photos, resumes, ID scans and documents are far too large
   for that, so the actual file BYTES live in IndexedDB (quota is
   typically hundreds of MB to several GB) while only lightweight
   metadata {id, name, mime, size, addedAt} stays in the encrypted
   localStorage blob. Each file is still individually AES-GCM
   encrypted with the same master key before it touches IndexedDB.
   ============================================================ */
async function storeFileBlob(fileId, dataUrl) {
  const blob = await encryptBlob({ dataUrl }, _key);
  await db.put(IDB_STORE, { id: fileId, ...blob });
}
async function loadFileBlob(fileId) {
  const record = await db.get(IDB_STORE, fileId);
  if (!record) throw new Error('File data not found — it may not have finished uploading.');
  const { dataUrl } = await decryptBlob({ iv: record.iv, ct: record.ct }, _key);
  return dataUrl;
}
async function deleteFileBlob(fileId) {
  try { await db.delete(IDB_STORE, fileId); } catch(e) { /* best-effort */ }
}

/* Converts a data: URI directly into a real Blob using atob/Uint8Array,
   without round-tripping through fetch(). Fetching a data: URI is a
   non-standard browser behavior, and on some Android Chrome versions
   the resulting Blob can carry restricted permissions that cause
   navigator.share() to fail with "Permission Denied" — this avoids
   that entirely by constructing the Blob the same proven way
   Document Hub does (a native Blob straight from the bytes). */
function dataUrlToBlob(dataUrl, mimeOverride) {
  const [header, base64] = dataUrl.split(',');
  const mime = mimeOverride || (header.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* Same direct conversion, but returns the raw ArrayBuffer instead of
   a Blob — used where a library (e.g. mammoth.js) needs bytes
   directly rather than a Blob object. */
function dataUrlToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* ============================================================
   One-time migration: older saves (before the IndexedDB switch)
   stored file BYTES directly on the file object as `f.data`
   (a base64 data URL) inside the encrypted localStorage blob.
   On unlock, find any such files, move their bytes into
   IndexedDB the same way new uploads work, then strip `.data`
   from the metadata and persist — so old files become viewable
   and downloadable again, and localStorage shrinks back down.
   Safe to run every unlock: does nothing once already migrated.
   ============================================================ */
async function migrateLegacyFileBlobs() {
  if (!_data) return;
  const sections = ['work','edu','certs','companies','idproof','dossier'];
  let migrated = 0;
  let failed   = 0;

  for (const s of sections) {
    for (const entry of (_data[s]||[])) {
      for (const f of (entry.files||[])) {
        if (f.data) {
          try {
            await storeFileBlob(f.id, f.data);
            delete f.data;
            migrated++;
          } catch(e) { failed++; }
        }
      }
    }
  }
  // Photos and resume use the same legacy pattern
  for (const p of (_data.photos||[])) {
    if (p.data) {
      try { await storeFileBlob(p.id, p.data); delete p.data; migrated++; }
      catch(e) { failed++; }
    }
  }
  for (const r of (_data.resume||[])) {
    if (r.data) {
      try { await storeFileBlob(r.id, r.data); delete r.data; migrated++; }
      catch(e) { failed++; }
    }
  }

  if (migrated > 0) {
    await persist(); // save the now-slimmer metadata (file bytes removed)
    toast(`✓ Upgraded storage for ${migrated} older file(s)`);
  }
  if (failed > 0) {
    toast(`⚠ ${failed} older file(s) could not be upgraded — they may need to be re-attached`, 'warn');
  }
}

/* ============================================================
   Setup — first-time password creation
   ============================================================ */
function renderSetup() {
  _root.innerHTML = `
    <div class="cd-lock-screen">
      <div class="cd-lock-icon">🔐</div>
      <div class="cd-lock-title">Set Up Career Details</div>
      <div class="cd-lock-sub">Create a master password to protect your personal data.
        This password cannot be recovered — keep it safe.</div>
      <div class="vault-field">
        <span class="vault-field__label">New Password</span>
        <div class="vault-pwrow">
          <input type="password" id="pw1" class="cd-pw-input" placeholder="Enter master password" autocomplete="new-password">
          <button type="button" class="vault-pwrow__btn" id="pw1-reveal">👁</button>
        </div>
      </div>
      <div class="vault-field">
        <span class="vault-field__label">Confirm Password</span>
        <div class="vault-pwrow">
          <input type="password" id="pw2" class="cd-pw-input" placeholder="Confirm master password" autocomplete="new-password">
          <button type="button" class="vault-pwrow__btn" id="pw2-reveal">👁</button>
        </div>
      </div>
      <div class="vault-err" id="setup-err"></div>
      <button class="btn btn--primary cd-btn" id="setup-btn">CREATE &amp; UNLOCK</button>
      <div class="cd-lock-warn">⚠ If you forget this password, your data cannot be recovered.</div>
    </div>
  `;
  const pw1 = _root.querySelector('#pw1');
  const pw2 = _root.querySelector('#pw2');
  // show/hide toggles
  _root.querySelector('#pw1-reveal').onclick = () => { pw1.type = pw1.type==='password'?'text':'password'; pw1.focus(); };
  _root.querySelector('#pw2-reveal').onclick = () => { pw2.type = pw2.type==='password'?'text':'password'; pw2.focus(); };
  _root.querySelector('#setup-btn').onclick = async () => {
    const p1 = pw1.value, p2 = pw2.value;
    const errEl = _root.querySelector('#setup-err');
    errEl.textContent = '';
    if (!p1) { errEl.textContent = 'Enter a password.'; return; }
    if (p1.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (p1 !== p2) { errEl.textContent = 'Passwords do not match.'; return; }
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      _key  = await deriveKey(p1, salt);
      _data = emptyData();
      // Store salt first, then persist — exactly like Vault's handleCreate
      saveStored({ salt: bytesToB64(salt), iv: '', ct: '' });
      await persist();
      startIdle();
      toast('✓ Career Details unlocked');
      recordActivity('careerdetails', 'Setup complete');
      renderMain();
    } catch(e) { toast('Setup failed: ' + e.message, 'err'); }
  };
  [pw1,pw2].forEach(el => el.addEventListener('keydown', e => { if(e.key==='Enter') _root.querySelector('#setup-btn').click(); }));
}

/* ============================================================
   Unlock screen
   ============================================================ */
function renderUnlock() {
  // Random suffix breaks browser autofill association — same trick as Vault
  const fieldName = `cdpw_${Math.random().toString(36).slice(2,10)}`;
  _root.innerHTML = `
    <div class="cd-lock-screen">
      <div class="cd-lock-icon">🔒</div>
      <div class="cd-lock-title">Career Details</div>
      <div class="cd-lock-sub">Enter your master password to access your personal data.</div>
      <div class="cd-build-tag">build ${MODULE_BUILD}</div>
      <div class="vault-field">
        <span class="vault-field__label">Password</span>
        <div class="vault-pwrow vault-pwrow--unlock">
          <input type="password" id="pw" class="cd-pw-input"
                 name="${fieldName}"
                 placeholder="Master password"
                 autocomplete="off"
                 data-form-type="other"
                 data-lpignore="true"
                 data-1p-ignore="true"
                 autocorrect="off" autocapitalize="off" spellcheck="false"
                 value="">
          <button type="button" class="vault-pwrow__btn" id="pw-reveal" title="Show/hide">👁</button>
        </div>
        <div class="vault-err" id="unlock-err"></div>
      </div>
      <button class="btn btn--primary cd-btn" id="unlock-btn">UNLOCK</button>
      <button class="vault-tool-btn cd-reset-btn" id="reset-btn">Reset (wipe all data)</button>
    </div>
  `;
  const pw = _root.querySelector('#pw');
  // Kill autofill after render — same as Vault
  setTimeout(() => { pw.value = ''; pw.focus(); }, 0);
  setTimeout(() => { pw.value = ''; }, 120);

  // Show/hide toggle
  const reveal = _root.querySelector('#pw-reveal');
  let revealed = false;
  reveal.onclick = () => {
    revealed = !revealed;
    pw.type = revealed ? 'text' : 'password';
    reveal.classList.toggle('is-active', revealed);
    pw.focus();
  };

  const doUnlock = async () => {
    let p = pw.value;
    const errEl = _root.querySelector('#unlock-err');
    errEl.textContent = '';
    if (!p) return;
    try {
      const stored = loadStored();
      const key    = await deriveKey(p, b64ToBytes(stored.salt));
      p = ''; pw.value = ''; // wipe immediately
      _data = stored.ct ? await decryptBlob({ iv: stored.iv, ct: stored.ct }, key) : emptyData();
      _data.work      = _data.work      || [];
      _data.edu       = _data.edu       || [];
      _data.certs     = _data.certs     || [];
      _data.photos    = _data.photos    || [];
      _data.resume    = _data.resume    || [];
      _data.companies = _data.companies || [];
      _data.idproof   = _data.idproof   || [];
      _data.dossier   = _data.dossier   || [];
      _key = key;
      await migrateLegacyFileBlobs(); // move any pre-IndexedDB file bytes (old .data field) into IndexedDB
      startIdle();
      toast('✓ Unlocked');
      recordActivity('careerdetails', 'Unlocked');
      renderMain();
    } catch(e) {
      p = ''; pw.value = '';
      errEl.textContent = 'Wrong password.';
      pw.classList.add('shake');
      setTimeout(() => { pw.classList.remove('shake'); pw.focus(); }, 400);
    }
  };
  _root.querySelector('#unlock-btn').onclick = doUnlock;
  pw.addEventListener('keydown', e => { if(e.key==='Enter') doUnlock(); });
  _root.querySelector('#reset-btn').onclick = () => {
    if (!confirm('This will permanently delete ALL Career Details data. Cannot be undone. Continue?')) return;
    localStorage.removeItem(STORAGE_KEY);
    _key=null; _data=null;
    toast('✓ Data wiped');
    renderSetup();
  };
}

/* ============================================================
   Main screen — tabs
   ============================================================ */
const TABS = [
  { id:'work',      label:'💼 Work'      },
  { id:'edu',       label:'🎓 Education' },
  { id:'certs',     label:'📜 Certs'     },
  { id:'photos',    label:'📷 Photos'    },
  { id:'resume',    label:'📄 Resume'    },
  { id:'companies', label:'🏢 Companies' },
  { id:'idproof',   label:'🪪 ID Proof'  },
  { id:'dossier',   label:'🗂 Dossier'   },
  { id:'organizer', label:'🗃 Doc Organizer' },
];

/* ============================================================
   Shared search / sort / empty-state helpers
   (used by Work, Education, Certs, ID Proof, Dossier tabs)
   ============================================================ */
function searchBar(prefix, searchVal, sortOptions, sortVal, totalCount) {
  return `
    <div class="cd-search-row">
      <input type="text" id="${prefix}-search" class="cd-input cd-search-input"
             placeholder="Search…" value="${esc(searchVal||'')}">
      ${sortOptions && sortOptions.length ? `
        <select id="${prefix}-sort" class="cd-select">
          ${sortOptions.map(o=>`<option value="${esc(o.val)}" ${sortVal===o.val?'selected':''}>${esc(o.lbl)}</option>`).join('')}
        </select>
      ` : ''}
      <span class="cd-search-count">${totalCount} total</span>
    </div>
  `;
}

function wireSearchBar(container, prefix, onSearch, onSort) {
  const searchEl = container.querySelector(`#${prefix}-search`);
  if (searchEl) {
    let debounce;
    searchEl.oninput = (e) => {
      clearTimeout(debounce);
      const v = e.target.value;
      // debounce slightly so typing doesn't re-render on every keystroke
      debounce = setTimeout(() => onSearch(v), 250);
    };
    // keep cursor position friendly — focus stays since renderMain() rebuilds DOM;
    // re-focus + restore cursor at end after re-render
    searchEl.focus();
    const len = searchEl.value.length;
    searchEl.setSelectionRange(len, len);
  }
  const sortEl = container.querySelector(`#${prefix}-sort`);
  if (sortEl && onSort) {
    sortEl.onchange = (e) => onSort(e.target.value);
  }
}

function applySearchSort(list, searchVal, sortVal, searchTextFn) {
  let out = list;
  if (searchVal && searchVal.trim()) {
    const q = searchVal.trim().toLowerCase();
    out = out.filter(e => searchTextFn(e).toLowerCase().includes(q));
  }
  if (sortVal === 'oldest') {
    out = [...out].reverse();
  } else if (sortVal === 'company') {
    out = [...out].sort((a,b) => (a.company||'').localeCompare(b.company||''));
  } else if (sortVal === 'title') {
    out = [...out].sort((a,b) => (a.jobTitle||'').localeCompare(b.jobTitle||''));
  }
  // 'newest' = default insertion order (unshift puts newest first already)
  return out;
}

function emptyMsg(totalCount, label) {
  return totalCount === 0
    ? `<div class="cd-empty">No ${label} entries added yet.</div>`
    : `<div class="cd-empty">No results match your search/filter.</div>`;
}

function renderMain() {
  _root.innerHTML = `
    <div class="cd-wrap">
      <div class="cd-toolbar">
        <button class="vault-tool-btn" id="export-btn">⬇ EXPORT</button>
        <button class="vault-tool-btn" id="import-btn">⬆ IMPORT</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
        <span class="cd-storage-tag" id="storage-tag">storage: …</span>
        <button class="vault-tool-btn cd-lock-btn" id="lock-btn">🔒 LOCK</button>
      </div>
      <div class="cd-tabs" id="cd-tabs">
        ${TABS.map(t=>`
          <button class="cd-tab ${_tab===t.id?'is-active':''}" data-tab="${t.id}">${t.label}</button>
        `).join('')}
      </div>
      <div class="cd-tab-body" id="cd-tab-body"></div>
    </div>
  `;
  _root.querySelectorAll('.cd-tab').forEach(btn => {
    btn.onclick = () => {
      _tab = btn.dataset.tab;
      if (_tab !== 'organizer') { _orgCategory = null; _orgViewing = null; orgRevokeUrls(); }
      renderMain();
    };
  });
  _root.querySelector('#lock-btn').onclick   = () => { lock(); routeView(); };
  _root.querySelector('#export-btn').onclick  = exportData;
  _root.querySelector('#import-btn').onclick  = () => _root.querySelector('#import-file').click();
  _root.querySelector('#import-file').onchange = importData;
  renderTab(_root.querySelector('#cd-tab-body'));
  resetIdle();
  updateStorageTag();
}

/* Shows how much of the browser's storage quota is in use, so file
   uploads (photos, resumes, ID scans, documents) can be monitored.
   This reflects the WHOLE browser storage quota shared across all
   sites — not a Career Details-specific limit. */
async function updateStorageTag() {
  const tag = document.getElementById('storage-tag');
  if (!tag) return;
  try {
    const { used, quota } = await db.usage();
    if (!quota) { tag.textContent = 'storage: n/a'; return; }
    const usedMB  = (used / 1024 / 1024).toFixed(1);
    const quotaGB = (quota / 1024 / 1024 / 1024).toFixed(1);
    const pct = quota ? Math.round((used / quota) * 100) : 0;
    tag.textContent = `storage: ${usedMB} MB / ${quotaGB} GB (${pct}%)`;
    tag.classList.toggle('cd-storage-tag--warn', pct >= 80);
  } catch(e) { tag.textContent = 'storage: n/a'; }
}

function renderTab(container) {
  switch(_tab) {
    case 'work':      return renderWork(container);
    case 'edu':       return renderEdu(container);
    case 'certs':     return renderCerts(container);
    case 'photos':    return renderPhotos(container);
    case 'resume':    return renderResume(container);
    case 'companies': return renderCompanies(container);
    case 'idproof':   return renderIdProof(container);
    case 'dossier':   return renderDossier(container);
    case 'organizer': return renderOrganizer(container);
  }
}

/* ============================================================
   TAB 1 — Work Experience
   ============================================================ */
function renderWork(c) {
  const filtered = applySearchSort(_data.work, _workSearch, _workSort,
    e => `${e.jobTitle} ${e.company} ${e.empId} ${e.location}`);
  c.innerHTML = `
    ${searchBar('work', _workSearch, [
      {val:'newest',lbl:'Newest First'},{val:'oldest',lbl:'Oldest First'},
      {val:'company',lbl:'Company A-Z'},{val:'title',lbl:'Title A-Z'}
    ], _workSort, _data.work.length)}
    <button class="btn btn--primary cd-add-btn" id="add-work">+ ADD EXPERIENCE</button>
    <div class="cd-list" id="work-list">
      ${filtered.length===0 ? emptyMsg(_data.work.length, 'work experience') : filtered.map(e=>workRowHtml(e)).join('')}
    </div>
  `;
  wireSearchBar(c, 'work',
    v => { _workSearch=v; renderMain(); },
    v => { _workSort=v;   renderMain(); }
  );
  c.querySelector('#add-work').onclick = () => { _editCtx = { section:'work', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'work', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('work', btn.dataset.id);
  });
  wireRowViewButtons(c, _data.work);
}

function workRowHtml(e) {
  return `
    <div class="cd-row" data-id="${e.id}">
      <div class="cd-row__main">
        <div class="cd-row__title">${esc(e.jobTitle||'—')} <span class="cd-row__at">@</span> ${esc(e.company||'—')}</div>
        <div class="cd-row__meta">
          ${esc(e.empId?'EMP: '+e.empId:'')}
          ${e.onboardDate||e.offboardDate ? ' · '+esc(e.onboardDate||'?')+' → '+(e.offboardDate?esc(e.offboardDate):'Present') : ''}
        </div>
        ${e.jobTitle2 ? `<div class="cd-row__sub">${esc(e.jobTitle2)}</div>` : ''}
        ${e.comments  ? `<div class="cd-row__comment">${esc(e.comments.slice(0,100))}${e.comments.length>100?'…':''}</div>` : ''}
        ${(e.files||[]).length ? `<div class="cd-row__files">📎 ${e.files.length} file(s)</div>` : ''}
      </div>
      <div class="cd-row__actions">
        <button class="vault-tool-btn cd-row-edit" data-id="${e.id}">EDIT</button>
        ${rowViewBtn(e)}
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 2 — Education
   ============================================================ */
function renderEdu(c) {
  const levels = [...new Set(_data.edu.map(x=>x.level).filter(Boolean))].sort();
  let list = _data.edu.filter(e =>
    (!_eduFilter || e.level===_eduFilter) &&
    (!_eduSearch || `${e.institution} ${e.degree} ${e.university} ${e.specialization}`.toLowerCase().includes(_eduSearch.toLowerCase()))
  );
  if (_eduSort==='oldest') list = [...list].reverse();
  c.innerHTML = `
    ${searchBar('edu', _eduSearch, [
      {val:'newest',lbl:'Newest First'},{val:'oldest',lbl:'Oldest First'}
    ], _eduSort, _data.edu.length)}
    <div class="cd-filter-bar" style="margin-bottom:10px;">
      <select id="edu-level-filter" class="cd-select">
        <option value="">All Levels</option>
        ${levels.map(l=>`<option value="${esc(l)}" ${_eduFilter===l?'selected':''}>${esc(l)}</option>`).join('')}
      </select>
      <button class="vault-tool-btn" id="edu-filter-clear">CLEAR</button>
    </div>
    <button class="btn btn--primary cd-add-btn" id="add-edu">+ ADD EDUCATION</button>
    <div class="cd-list">
      ${list.length===0 ? emptyMsg(_data.edu.length,'education record') : list.map(e=>eduRowHtml(e)).join('')}
    </div>
  `;
  wireSearchBar(c,'edu', v=>{_eduSearch=v;renderMain();}, v=>{_eduSort=v;renderMain();});
  c.querySelector('#edu-level-filter').onchange = e => { _eduFilter=e.target.value; renderMain(); };
  c.querySelector('#edu-filter-clear').onclick  = () => { _eduFilter=''; renderMain(); };
  c.querySelector('#add-edu').onclick = () => { _editCtx = { section:'edu', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'edu', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('edu', btn.dataset.id);
  });
  wireRowViewButtons(c, _data.edu);
}

function eduRowHtml(e) {
  return `
    <div class="cd-row" data-id="${e.id}">
      <div class="cd-row__main">
        <div class="cd-row__title">${esc(e.level||'—')}</div>
        <div class="cd-row__sub">${esc(e.degree||'')}${e.specialization?' ('+esc(e.specialization)+')':''}</div>
        <div class="cd-row__meta">
          ${esc(e.institution||'')}
          ${e.university ? ' · Aff: '+esc(e.university) : ''}
        </div>
        <div class="cd-row__meta">
          ${e.fromDate&&e.toDate ? esc(e.fromDate)+' → '+esc(e.toDate) : ''}
          ${e.yearOfPassing ? ' · Pass: '+esc(e.yearOfPassing) : ''}
          ${e.percentage ? ' · '+esc(e.percentage)+'%' : ''}
          ${e.rollNo ? ' · Roll: '+esc(e.rollNo) : ''}
        </div>
        ${e.comments  ? `<div class="cd-row__comment">${esc(e.comments.slice(0,100))}${e.comments.length>100?'…':''}</div>` : ''}
        ${(e.files||[]).length ? `<div class="cd-row__files">📎 ${e.files.length} file(s)</div>` : ''}
      </div>
      <div class="cd-row__actions">
        <button class="vault-tool-btn cd-row-edit" data-id="${e.id}">EDIT</button>
        ${rowViewBtn(e)}
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 3 — Certifications
   ============================================================ */
function renderCerts(c) {
  const today = new Date().toISOString().slice(0,10);
  let list = _data.certs.filter(e => {
    const matchSearch = !_certSearch || `${e.name} ${e.issuer} ${e.certId}`.toLowerCase().includes(_certSearch.toLowerCase());
    const matchFilter = !_certFilter ||
      (_certFilter==='active'  && (!e.expiryDate || e.expiryDate >= today)) ||
      (_certFilter==='expired' && e.expiryDate && e.expiryDate < today);
    return matchSearch && matchFilter;
  });
  if (_certSort==='oldest') list=[...list].reverse();
  c.innerHTML = `
    ${searchBar('cert', _certSearch, [
      {val:'newest',lbl:'Newest First'},{val:'oldest',lbl:'Oldest First'}
    ], _certSort, _data.certs.length)}
    <div class="cd-filter-bar" style="margin-bottom:10px;">
      <select id="cert-status-filter" class="cd-select">
        <option value="" ${!_certFilter?'selected':''}>All Status</option>
        <option value="active"  ${_certFilter==='active'?'selected':''}>Active</option>
        <option value="expired" ${_certFilter==='expired'?'selected':''}>Expired</option>
      </select>
      <button class="vault-tool-btn" id="cert-filter-clear">CLEAR</button>
    </div>
    <button class="btn btn--primary cd-add-btn" id="add-cert">+ ADD CERTIFICATE</button>
    <div class="cd-list">
      ${list.length===0 ? emptyMsg(_data.certs.length,'certificate') : list.map(e=>certRowHtml(e)).join('')}
    </div>
  `;
  wireSearchBar(c,'cert', v=>{_certSearch=v;renderMain();}, v=>{_certSort=v;renderMain();});
  c.querySelector('#cert-status-filter').onchange = e => { _certFilter=e.target.value; renderMain(); };
  c.querySelector('#cert-filter-clear').onclick   = () => { _certFilter=''; renderMain(); };
  c.querySelector('#add-cert').onclick = () => { _editCtx = { section:'certs', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'certs', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('certs', btn.dataset.id);
  });
  wireRowViewButtons(c, _data.certs);
}

function certRowHtml(e) {
  return `
    <div class="cd-row" data-id="${e.id}">
      <div class="cd-row__main">
        <div class="cd-row__title">${esc(e.name||'—')}</div>
        <div class="cd-row__sub">${esc(e.issuer||'')}${e.certId?' · ID: '+esc(e.certId):''}</div>
        <div class="cd-row__meta">${e.issueDate?'Issued: '+esc(e.issueDate):''}${e.expiryDate?' · Expires: '+esc(e.expiryDate):''}</div>
        ${e.comments  ? `<div class="cd-row__comment">${esc(e.comments.slice(0,100))}${e.comments.length>100?'…':''}</div>` : ''}
        ${(e.files||[]).length ? `<div class="cd-row__files">📎 ${e.files.length} file(s)</div>` : ''}
      </div>
      <div class="cd-row__actions">
        <button class="vault-tool-btn cd-row-edit" data-id="${e.id}">EDIT</button>
        ${rowViewBtn(e)}
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 4 — Profile Photos (versioned)
   ============================================================ */
function renderPhotos(c) {
  c.innerHTML = `
    <div class="cd-file-zone">
      <div class="cd-file-label">Upload a new profile photo</div>
      <input type="file" id="photo-input" accept="image/*" hidden>
      <button class="btn btn--primary" id="photo-pick-btn">📷 SELECT PHOTO</button>
      <div class="cd-note">All versions are stored. Mark one as Primary.</div>
    </div>
    <div class="cd-photo-grid" id="photo-grid">
      ${_data.photos.length===0
        ? `<div class="cd-empty">No photos uploaded yet.</div>`
        : _data.photos.map((p,i) => photoCardHtml(p,i)).join('')}
    </div>
  `;
  c.querySelector('#photo-pick-btn').onclick = () => c.querySelector('#photo-input').click();
  c.querySelector('#photo-input').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value='';
    if (!file) return;
    toast('Uploading photo…');
    try {
      const dataUrl = await fileToBase64(file);
      const id = uuid();
      await storeFileBlob(id, dataUrl);              // bytes → IndexedDB (encrypted)
      _data.photos.unshift({ id, name:file.name, mime:file.type, size:file.size, addedAt:Date.now(), primary: _data.photos.length===0 });
      await persist(); renderMain();                  // metadata only → localStorage
      toast('✓ Photo added');
    } catch(err) { toast('Photo upload failed: '+err.message, 'err'); }
  };
  c.querySelectorAll('.photo-primary-btn').forEach(btn => {
    btn.onclick = async () => {
      _data.photos.forEach(p => p.primary = p.id===btn.dataset.id);
      await persist(); renderMain();
      toast('✓ Primary photo set');
    };
  });
  c.querySelectorAll('.photo-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this photo?')) return;
      await deleteFileBlob(btn.dataset.id);
      _data.photos = _data.photos.filter(p=>p.id!==btn.dataset.id);
      await persist(); renderMain();
      toast('✓ Photo deleted');
    };
  });
  c.querySelectorAll('.photo-dl-btn').forEach(btn => {
    btn.onclick = async () => {
      const p = _data.photos.find(x=>x.id===btn.dataset.id);
      if (!p) return;
      try { downloadFile(await loadFileBlob(p.id), p.name, p.mime); }
      catch(err) { toast('Download failed: '+err.message, 'err'); }
    };
  });
  c.querySelectorAll('.photo-view-btn').forEach(btn => {
    btn.onclick = async () => {
      const startIndex = _data.photos.findIndex(x => x.id === btn.dataset.id);
      if (startIndex === -1) return;
      await openFileViewerGallery(_data.photos, startIndex);
    };
  });
  // Load each thumbnail asynchronously from IndexedDB
  _data.photos.forEach(p => {
    loadFileBlob(p.id).then(dataUrl => {
      const img = c.querySelector(`.cd-photo-img[data-id="${p.id}"]`);
      if (img) img.src = dataUrl;
    }).catch(() => { /* file missing — thumbnail stays blank */ });
  });
}

function photoCardHtml(p, i) {
  return `
    <div class="cd-photo-card ${p.primary?'is-primary':''}">
      <img class="cd-photo-img" data-id="${p.id}" alt="Photo ${i+1}">
      ${p.primary ? '<div class="cd-photo-badge">★ PRIMARY</div>' : ''}
      <div class="cd-photo-name">${esc(p.name)}</div>
      <div class="cd-photo-date">${formatDate(p.addedAt)}</div>
      <div class="cd-photo-actions">
        ${!p.primary ? `<button class="vault-tool-btn photo-primary-btn" data-id="${p.id}">SET PRIMARY</button>` : ''}
        <button class="vault-tool-btn photo-view-btn" data-id="${p.id}">👁 VIEW</button>
        <button class="vault-tool-btn photo-dl-btn" data-id="${p.id}">⬇ DL</button>
        <button class="vault-tool-btn photo-del-btn" data-id="${p.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 5 — Resume (versioned)
   ============================================================ */
function renderResume(c) {
  c.innerHTML = `
    <div class="cd-file-zone">
      <div class="cd-file-label">Upload a new resume version</div>
      <input type="file" id="resume-input" accept=".pdf,.doc,.docx,application/pdf,application/msword" hidden>
      <button class="btn btn--primary" id="resume-pick-btn">📄 SELECT RESUME</button>
      <div class="cd-note">All versions kept. Mark one as Active.</div>
    </div>
    <button class="vault-tool-btn pdf-toolkit-link" id="open-pdf-toolkit">🛠 Open PDF Toolkit — convert DOC to PDF, merge, split, edit, reduce size</button>
    <div class="cd-list" id="resume-list">
      ${_data.resume.length===0
        ? `<div class="cd-empty">No resume uploaded yet.</div>`
        : _data.resume.map((r,i) => resumeRowHtml(r,i)).join('')}
    </div>
  `;
  c.querySelector('#open-pdf-toolkit').onclick = () => goToModule('pdftoolkit');
  c.querySelector('#resume-pick-btn').onclick = () => c.querySelector('#resume-input').click();
  c.querySelector('#resume-input').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value='';
    if (!file) return;
    toast('Uploading resume…');
    try {
      const dataUrl = await fileToBase64(file);
      const id = uuid();
      await storeFileBlob(id, dataUrl);
      _data.resume.unshift({ id, name:file.name, mime:file.type, size:file.size, addedAt:Date.now(), active:_data.resume.length===0, notes:'' });
      await persist(); renderMain();
      toast('✓ Resume added');
    } catch(err) { toast('Resume upload failed: '+err.message, 'err'); }
  };
  c.querySelectorAll('.resume-active-btn').forEach(btn => {
    btn.onclick = async () => {
      _data.resume.forEach(r => r.active = r.id===btn.dataset.id);
      await persist(); renderMain();
      toast('✓ Active resume set');
    };
  });
  c.querySelectorAll('.resume-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this resume version?')) return;
      await deleteFileBlob(btn.dataset.id);
      _data.resume = _data.resume.filter(r=>r.id!==btn.dataset.id);
      await persist(); renderMain();
      toast('✓ Resume deleted');
    };
  });
  c.querySelectorAll('.resume-dl-btn').forEach(btn => {
    btn.onclick = async () => {
      const r = _data.resume.find(x=>x.id===btn.dataset.id);
      if (!r) return;
      try { downloadFile(await loadFileBlob(r.id), r.name, r.mime); }
      catch(err) { toast('Download failed: '+err.message, 'err'); }
    };
  });
  c.querySelectorAll('.resume-view-btn').forEach(btn => {
    btn.onclick = async () => {
      const viewable = _data.resume.filter(x => canView(x.mime, x.name));
      const startIndex = viewable.findIndex(x => x.id === btn.dataset.id);
      if (startIndex === -1) { toast('Preview not available for this file type — use Download instead', 'warn'); return; }
      await openFileViewerGallery(viewable, startIndex);
    };
  });
  c.querySelectorAll('.resume-docxview-btn').forEach(btn => {
    btn.onclick = async () => {
      const r = _data.resume.find(x=>x.id===btn.dataset.id);
      if (!r) return;
      await openDocxPreview(r.id, r.name, r.mime);
    };
  });
}

function resumeRowHtml(r, i) {
  const size = r.size > 1024*1024 ? (r.size/1024/1024).toFixed(1)+' MB' : Math.round(r.size/1024)+' KB';
  return `
    <div class="cd-row ${r.active?'cd-row--active':''}">
      <div class="cd-row__main">
        <div class="cd-row__title">📄 ${esc(r.name)} ${r.active?'<span class="cd-badge">ACTIVE</span>':''}</div>
        <div class="cd-row__meta">${formatDate(r.addedAt)} · ${size}</div>
        ${r.notes ? `<div class="cd-row__comment">${esc(r.notes)}</div>` : ''}
      </div>
      <div class="cd-row__actions">
        ${!r.active ? `<button class="vault-tool-btn resume-active-btn" data-id="${r.id}">SET ACTIVE</button>` : ''}
        ${canView(r.mime, r.name) ? `<button class="vault-tool-btn resume-view-btn" data-id="${r.id}">👁 VIEW</button>` : ''}
        ${isDocxFile(r.mime, r.name) ? `<button class="vault-tool-btn resume-docxview-btn" data-id="${r.id}">📖 PREVIEW</button>` : ''}
        <button class="vault-tool-btn resume-dl-btn" data-id="${r.id}">⬇ DL</button>
        <button class="vault-tool-btn resume-del-btn" data-id="${r.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 6 — Company Applications
   ============================================================ */
let _coFilter    = { year:'', month:'' };
let _workSearch  = ''; let _workSort   = 'newest';
let _eduSearch   = ''; let _eduFilter  = ''; let _eduSort = 'newest';
let _certSearch  = ''; let _certFilter = ''; let _certSort = 'newest';
let _idSearch    = ''; let _idFilter   = '';
let _dossierSearch = ''; let _dossierFilter = '';

function renderCompanies(c) {
  const years  = [...new Set(_data.companies.map(x=>x.applyYear).filter(Boolean))].sort().reverse();
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const filtered = _data.companies.filter(x => {
    if (_coFilter.year  && x.applyYear  !== _coFilter.year)  return false;
    if (_coFilter.month && x.applyMonth !== _coFilter.month) return false;
    return true;
  });

  c.innerHTML = `
    <div class="cd-filter-bar">
      <select id="filter-year" class="cd-select">
        <option value="">All Years</option>
        ${years.map(y=>`<option value="${y}" ${_coFilter.year===y?'selected':''}>${y}</option>`).join('')}
      </select>
      <select id="filter-month" class="cd-select">
        <option value="">All Months</option>
        ${months.map((m,i)=>`<option value="${m}" ${_coFilter.month===m?'selected':''}>${mNames[i]}</option>`).join('')}
      </select>
      <button class="vault-tool-btn" id="filter-clear">CLEAR</button>
    </div>
    <button class="btn btn--primary cd-add-btn" id="add-co">+ ADD APPLICATION</button>
    <div class="cd-list">
      ${filtered.length===0
        ? `<div class="cd-empty">${_data.companies.length===0?'No applications recorded yet.':'No results match the filter.'}</div>`
        : filtered.map(e=>companyRowHtml(e)).join('')}
    </div>
  `;
  c.querySelector('#filter-year').onchange  = (e) => { _coFilter.year  = e.target.value; renderMain(); };
  c.querySelector('#filter-month').onchange = (e) => { _coFilter.month = e.target.value; renderMain(); };
  c.querySelector('#filter-clear').onclick  = () => { _coFilter={year:'',month:''}; renderMain(); };
  c.querySelector('#add-co').onclick = () => { _editCtx = { section:'companies', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'companies', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('companies', btn.dataset.id);
  });
  // password toggle
  c.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.onclick = () => {
      const span = btn.previousElementSibling;
      if (span.dataset.hidden==='1') {
        const co = _data.companies.find(x=>x.id===btn.dataset.id);
        span.textContent = co ? (co.passwords||[])[0]||'' : '';
        span.dataset.hidden='0'; btn.textContent='🙈';
      } else {
        span.textContent='••••••••';
        span.dataset.hidden='1'; btn.textContent='👁';
      }
    };
  });
  wireRowViewButtons(c, _data.companies);
}

function companyRowHtml(e) {
  const pw = (e.passwords||[])[0]||'';
  return `
    <div class="cd-row" data-id="${e.id}">
      <div class="cd-row__main">
        <div class="cd-row__title">${esc(e.company||'—')}</div>
        <div class="cd-row__meta">
          ${e.applyYear&&e.applyMonth?esc(e.applyMonth)+'/'+esc(e.applyYear):''}
          ${e.hrContact?' · HR: '+esc(e.hrContact):''}
        </div>
        ${e.url ? `<div class="cd-row__sub"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a></div>` : ''}
        ${e.tagEmail ? `<div class="cd-row__sub">📧 ${esc(e.tagEmail)}</div>` : ''}
        ${pw ? `<div class="cd-row__sub">🔑 <span data-hidden="1">••••••••</span>
          <button class="pw-toggle" data-id="${e.id}" style="margin-left:4px;">👁</button>
          ${(e.passwords||[]).length>1?`<span style="color:var(--ink-dim);font-size:10px;"> +${(e.passwords||[]).length-1} prev</span>`:''}
        </div>` : ''}
        ${e.comments ? `<div class="cd-row__comment">${esc(e.comments.slice(0,100))}${e.comments.length>100?'…':''}</div>` : ''}
        ${(e.files||[]).length ? `<div class="cd-row__files">📎 ${e.files.length} file(s)</div>` : ''}
      </div>
      <div class="cd-row__actions">
        <button class="vault-tool-btn cd-row-edit" data-id="${e.id}">EDIT</button>
        ${rowViewBtn(e)}
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 7 — ID Proof
   ============================================================ */
function renderIdProof(c) {
  const idTypes = [...new Set(_data.idproof.map(x=>x.idName).filter(Boolean))].sort();
  const today   = new Date().toISOString().slice(0,10);
  let list = _data.idproof.filter(e =>
    (!_idFilter || e.idName===_idFilter) &&
    (!_idSearch || `${e.idName} ${e.idNumber} ${e.issuedBy}`.toLowerCase().includes(_idSearch.toLowerCase()))
  );
  c.innerHTML = `
    ${searchBar('id', _idSearch, [], '', _data.idproof.length)}
    <div class="cd-filter-bar" style="margin-bottom:10px;">
      <select id="id-type-filter" class="cd-select">
        <option value="">All Types</option>
        ${idTypes.map(t=>`<option value="${esc(t)}" ${_idFilter===t?'selected':''}>${esc(t)}</option>`).join('')}
      </select>
      <button class="vault-tool-btn" id="id-filter-clear">CLEAR</button>
    </div>
    <button class="btn btn--primary cd-add-btn" id="add-idproof">+ ADD ID PROOF</button>
    <div class="cd-list">
      ${list.length===0 ? emptyMsg(_data.idproof.length,'ID proof') : list.map(e=>idProofRowHtml(e)).join('')}
    </div>
  `;
  wireSearchBar(c,'id', v=>{_idSearch=v;renderMain();}, null);
  c.querySelector('#id-type-filter').onchange = e => { _idFilter=e.target.value; renderMain(); };
  c.querySelector('#id-filter-clear').onclick  = () => { _idFilter=''; renderMain(); };
  c.querySelector('#add-idproof').onclick = () => { _editCtx = { section:'idproof', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'idproof', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('idproof', btn.dataset.id);
  });
  wireRowViewButtons(c, _data.idproof);
}

function idProofRowHtml(e) {
  return `
    <div class="cd-row" data-id="${e.id}">
      <div class="cd-row__main">
        <div class="cd-row__title">🪪 ${esc(e.idName||'—')}</div>
        <div class="cd-row__sub">${e.idNumber ? 'No: ' + esc(e.idNumber) : ''}</div>
        <div class="cd-row__meta">
          ${e.issuedBy ? 'Issued by: ' + esc(e.issuedBy) : ''}
          ${e.issueDate ? ' · ' + esc(e.issueDate) : ''}
          ${e.expiryDate ? ' · Expires: ' + esc(e.expiryDate) : ''}
        </div>
        ${e.comments ? `<div class="cd-row__comment">${esc(e.comments.slice(0,100))}${e.comments.length>100?'…':''}</div>` : ''}
        ${(e.files||[]).length ? `<div class="cd-row__files">📎 ${e.files.length} file(s)</div>` : ''}
      </div>
      <div class="cd-row__actions">
        <button class="vault-tool-btn cd-row-edit" data-id="${e.id}">EDIT</button>
        ${rowViewBtn(e)}
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 8 — Dossier (Personal/Professional Documents)
   ============================================================ */
function renderDossier(c) {
  const types = [...new Set(_data.dossier.map(x=>x.docType).filter(Boolean))].sort();
  c.innerHTML = `
    ${searchBar('dossier', _dossierSearch, [], '', _data.dossier.length)}
    <div class="cd-filter-bar" style="margin-bottom:10px;">
      <select id="dossier-filter" class="cd-select">
        <option value="">All Types</option>
        ${types.map(t=>`<option value="${esc(t)}" ${_dossierFilter===t?'selected':''}>${esc(t)}</option>`).join('')}
      </select>
      <button class="vault-tool-btn" id="dossier-clear">CLEAR</button>
    </div>
    <button class="btn btn--primary cd-add-btn" id="add-dossier">+ ADD DOCUMENT</button>
    <div class="cd-list" id="dossier-list">
      ${renderDossierList()}
    </div>
  `;
  wireSearchBar(c,'dossier', v=>{_dossierSearch=v;renderMain();}, null);
  c.querySelector('#dossier-filter').onchange = e => { _dossierFilter=e.target.value; renderMain(); };
  c.querySelector('#dossier-clear').onclick   = () => { _dossierFilter=''; renderMain(); };
  c.querySelector('#add-dossier').onclick = () => { _editCtx = { section:'dossier', id:null }; renderEditor(_editCtx); };
  wireDossierActions(c);
}

function renderDossierList() {
  const list = _data.dossier.filter(e =>
    (!_dossierFilter || e.docType===_dossierFilter) &&
    (!_dossierSearch || `${e.docName} ${e.docNumber} ${e.issuedBy} ${e.docType}`.toLowerCase().includes(_dossierSearch.toLowerCase()))
  );
  if (list.length===0) return `<div class="cd-empty">${_data.dossier.length===0?'No documents added yet.':'No results match the filter.'}</div>`;
  return list.map(e=>dossierRowHtml(e)).join('');
}

function wireDossierActions(c) {
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'dossier', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('dossier', btn.dataset.id);
  });
  c.querySelectorAll('.dossier-dl-btn').forEach(btn => {
    btn.onclick = async () => {
      const entry = _data.dossier.find(x=>x.id===btn.dataset.id);
      if (!entry || !(entry.files||[]).length) { toast('No files attached','warn'); return; }
      for (const f of entry.files) {
        try { downloadFile(await loadFileBlob(f.id), f.name, f.mime); }
        catch(err) { toast(`Could not download ${f.name}: ${err.message}`, 'err'); }
      }
    };
  });
  wireRowViewButtons(c, _data.dossier);
}

function dossierRowHtml(e) {
  const fileCount = (e.files||[]).length;
  return `
    <div class="cd-row" data-id="${e.id}">
      <div class="cd-row__main">
        <div class="cd-row__title">🗂 ${esc(e.docName||'—')}
          ${e.docType ? `<span class="cd-badge">${esc(e.docType)}</span>` : ''}
        </div>
        <div class="cd-row__sub">${e.docNumber ? 'No: ' + esc(e.docNumber) : ''}</div>
        <div class="cd-row__meta">
          ${e.issuedBy ? 'Issued by: ' + esc(e.issuedBy) : ''}
          ${e.issueDate ? ' · ' + esc(e.issueDate) : ''}
          ${e.expiryDate ? ' · Expires: ' + esc(e.expiryDate) : ''}
        </div>
        ${e.comments ? `<div class="cd-row__comment">${esc(e.comments.slice(0,100))}${e.comments.length>100?'…':''}</div>` : ''}
        ${fileCount ? `<div class="cd-row__files">📎 ${fileCount} file(s)</div>` : ''}
      </div>
      <div class="cd-row__actions">
        <button class="vault-tool-btn cd-row-edit" data-id="${e.id}">EDIT</button>
        ${rowViewBtn(e)}
        ${fileCount ? `<button class="vault-tool-btn dossier-dl-btn" data-id="${e.id}">⬇ DL</button>` : ''}
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 9 — Doc Organizer
   ------------------------------------------------------------
   Read-only file browser across every section (Work, Education,
   Certs, Photos, Resume, Companies, ID Proof, Dossier). Three
   levels: category grid → flat file list for that category →
   file detail screen with DOWNLOAD / OPEN / DELETE and a SHARE
   row using the Web Share API (navigator.share), which is the
   reliable cross-device way to hand a file to Android's native
   share sheet — the same pattern Document Hub already uses,
   since blob-URL "open in new tab" alone is unreliable on mobile.
   Editing entries is NOT done here — purely browse/open/share/
   delete the file itself.
   ============================================================ */
let _orgCategory = null; // null = category grid; else one of the section ids
let _orgViewing  = null; // { section, entryId, fileId } when viewing one file
let _orgObjectUrls = [];

const ORG_CATEGORIES = [
  { id:'work',      label:'💼 Work Experience' },
  { id:'edu',        label:'🎓 Education'        },
  { id:'certs',      label:'📜 Certificates'     },
  { id:'photos',     label:'📷 Photos'           },
  { id:'resume',     label:'📄 Resume'           },
  { id:'companies',  label:'🏢 Companies'        },
  { id:'idproof',    label:'🪪 ID Proof'         },
  { id:'dossier',    label:'🗂 Dossier'          },
];

function orgRevokeUrls() {
  _orgObjectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch(e){} });
  _orgObjectUrls = [];
}

/* Flattens every file in a category into one list, each carrying
   a label describing which entry it belongs to (so files aren't
   anonymous once pulled out of their original card). */
function orgFlattenFiles(section) {
  const out = [];
  if (section === 'photos') {
    _data.photos.forEach(p => out.push({ id:p.id, name:p.name, mime:p.mime, size:p.size, addedAt:p.addedAt, entryLabel: p.primary ? 'Primary photo' : 'Photo version' }));
  } else if (section === 'resume') {
    _data.resume.forEach(r => out.push({ id:r.id, name:r.name, mime:r.mime, size:r.size, addedAt:r.addedAt, entryLabel: r.active ? 'Active resume' : 'Resume version' }));
  } else {
    const labelFor = (section, e) => {
      if (section==='work')      return `${e.jobTitle||'Untitled'} @ ${e.company||'—'}`;
      if (section==='edu')       return `${e.level||'Education'} — ${e.degree||''}`.trim();
      if (section==='certs')     return e.name || 'Certificate';
      if (section==='companies') return e.company || 'Company';
      if (section==='idproof')   return e.idName || 'ID Proof';
      if (section==='dossier')   return e.docName || 'Document';
      return 'Entry';
    };
    (_data[section]||[]).forEach(e => {
      (e.files||[]).forEach(f => out.push({
        id:f.id, name:f.name, mime:f.mime, size:f.size, addedAt:f.addedAt,
        entryLabel: labelFor(section, e),
      }));
    });
  }
  return out.sort((a,b) => (b.addedAt||0) - (a.addedAt||0));
}

function renderOrganizer(c) {
  orgRevokeUrls();
  if (_orgViewing) return renderOrgFileDetail(c);
  if (_orgCategory) return renderOrgFileList(c);
  return renderOrgCategoryGrid(c);
}

function renderOrgCategoryGrid(c) {
  const counts = {};
  ORG_CATEGORIES.forEach(cat => { counts[cat.id] = orgFlattenFiles(cat.id).length; });
  const totalFiles = Object.values(counts).reduce((a,b)=>a+b, 0);

  c.innerHTML = `
    <div class="pdfk-sub" style="margin-bottom:10px;">Browse every file across Career Details in one place — ${totalFiles} file(s) total.</div>
    <div class="org-cat-grid">
      ${ORG_CATEGORIES.map(cat => `
        <button class="org-cat-card" data-cat="${cat.id}">
          <div class="org-cat-label">${cat.label}</div>
          <div class="org-cat-count">${counts[cat.id]} file(s)</div>
        </button>
      `).join('')}
    </div>
  `;
  c.querySelectorAll('.org-cat-card').forEach(btn => {
    btn.onclick = () => { _orgCategory = btn.dataset.cat; renderMain(); };
  });
}

function renderOrgFileList(c) {
  const cat = ORG_CATEGORIES.find(x => x.id === _orgCategory);
  const files = orgFlattenFiles(_orgCategory);
  c.innerHTML = `
    <button class="vault-crumb" id="org-back-cat">← DOC ORGANIZER</button>
    <h2 class="pdfk-h2" style="margin-bottom:10px;">${cat ? cat.label : ''}</h2>
    <div class="cd-list">
      ${files.length===0
        ? `<div class="cd-empty">No files in this category yet.</div>`
        : files.map(f => `
          <div class="cd-row org-file-row" data-id="${f.id}">
            <div class="cd-row__main">
              <div class="cd-row__title">${orgFileIcon(f)} ${esc(f.name)}</div>
              <div class="cd-row__meta">${esc(f.entryLabel)}</div>
              <div class="cd-row__meta">${formatDate(f.addedAt)} · ${fileSizeStr(f.size)}</div>
            </div>
            <div class="cd-row__actions">
              <button class="vault-tool-btn org-open-btn" data-id="${f.id}">OPEN</button>
            </div>
          </div>
        `).join('')}
    </div>
  `;
  c.querySelector('#org-back-cat').onclick = () => { _orgCategory = null; renderMain(); };
  c.querySelectorAll('.org-open-btn, .org-file-row').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const id = el.dataset.id || el.closest('.org-file-row')?.dataset.id;
      if (id) { _orgViewing = id; renderMain(); }
    };
  });
}

function orgFileIcon(f) {
  if (canView(f.mime, f.name) && (f.mime||'').startsWith('image/')) return '🖼';
  if ((f.mime||'')==='application/pdf' || /\.pdf$/i.test(f.name)) return '📕';
  if (isDocFile(f.mime, f.name)) return '📝';
  return '📄';
}

async function renderOrgFileDetail(c) {
  const files = orgFlattenFiles(_orgCategory);
  const file = files.find(f => f.id === _orgViewing);
  if (!file) { _orgViewing = null; return renderOrgFileList(c); }

  c.innerHTML = `<div class="pdfk-note">Loading…</div>`;
  let dataUrl;
  try { dataUrl = await loadFileBlob(file.id); }
  catch(err) { c.innerHTML = `<div class="cd-empty">Could not load this file: ${esc(err.message)}</div>`; return; }

  const blob     = dataUrlToBlob(dataUrl, file.mime);
  const objUrl   = URL.createObjectURL(blob);
  _orgObjectUrls.push(objUrl);

  const isImg  = (file.mime||'').startsWith('image/');
  const isPdf  = (file.mime||'')==='application/pdf' || /\.pdf$/i.test(file.name);
  const isDocx = isDocxFile(file.mime, file.name);
  const isDoc  = isDocFile(file.mime, file.name);

  let preview = '';
  if (isImg) {
    preview = `<img class="dh-preview__img" src="${objUrl}" alt="">`;
  } else {
    const extLabel = (file.name.split('.').pop()||'').toUpperCase() || (isPdf ? 'PDF' : 'FILE');
    const hint = isPdf
      ? 'Tap OPEN or SHARE FILE to view in your PDF reader.'
      : isDocx
        ? 'Word documents can\'t be rendered natively in a browser — tap PREVIEW for a readable text approximation, or LAUNCH to open in Word/LibreOffice.'
        : isDoc
          ? 'Old .doc format isn\'t supported for in-app preview — tap LAUNCH to open in Word/LibreOffice.'
          : 'No preview available — tap OPEN or SHARE FILE to view in another app.';
    preview = `
      <div class="dh-preview__icon ${isPdf?'dh-preview__icon--pdf':''}">
        <div class="dh-preview__sheet"></div>
        <div class="dh-preview__ext">${esc(extLabel)}</div>
        <div class="dh-preview__hint">${hint}</div>
        ${isDocx ? `<button class="btn btn--primary" id="org-docx-preview" style="margin-top:10px;">📖 PREVIEW CONTENT</button>` : ''}
      </div>`;
  }

  c.innerHTML = `
    <button class="vault-crumb" id="org-back-file">← ${esc(ORG_CATEGORIES.find(x=>x.id===_orgCategory)?.label || '')}</button>

    <div class="dh-preview">${preview}</div>

    <div class="dh-meta">
      <div class="dh-meta__row"><span class="dh-meta__k">NAME</span><span class="dh-meta__v">${esc(file.name)}</span></div>
      <div class="dh-meta__row"><span class="dh-meta__k">FROM</span><span class="dh-meta__v">${esc(file.entryLabel)}</span></div>
      <div class="dh-meta__row"><span class="dh-meta__k">TYPE</span><span class="dh-meta__v">${esc(file.mime||'unknown')}</span></div>
      <div class="dh-meta__row"><span class="dh-meta__k">SIZE</span><span class="dh-meta__v">${fileSizeStr(file.size)}</span></div>
      <div class="dh-meta__row"><span class="dh-meta__k">ADDED</span><span class="dh-meta__v">${formatDate(file.addedAt)}</span></div>
    </div>

    <div class="dh-detail-actions">
      <a class="btn" id="org-dl" href="${objUrl}" download="${esc(file.name)}">DOWNLOAD</a>
      ${!isDoc ? `<a class="btn" id="org-open" href="${objUrl}" target="_blank" rel="noopener">OPEN</a>` : ''}
      <button class="btn vault-actions__del" id="org-del">DELETE</button>
    </div>

    <div class="dh-share">
      <div class="dh-share__head">SEND OUT</div>
      <button class="btn btn--primary dh-share__main" id="org-sh-native">📤&nbsp; SHARE FILE</button>
      <div class="dh-share__row">
        <button class="dh-share__btn" id="org-sh-wa" type="button"><span class="dh-share__icon">💬</span><span class="dh-share__lbl">WhatsApp</span></button>
        <button class="dh-share__btn" id="org-sh-email" type="button"><span class="dh-share__icon">✉</span><span class="dh-share__lbl">Email</span></button>
        <button class="dh-share__btn" id="org-sh-print" type="button"><span class="dh-share__icon">🖨</span><span class="dh-share__lbl">Print</span></button>
        <button class="dh-share__btn" id="org-sh-copy" type="button"><span class="dh-share__icon">📋</span><span class="dh-share__lbl">Copy</span></button>
      </div>
      <div class="dh-share__hint">
        SHARE FILE attaches the actual file via your device's native share sheet
        (WhatsApp, Drive, Telegram, your PDF viewer, etc.) — this is the most
        reliable way to open files on mobile. The 4 buttons below send a text
        summary only; files don't attach via direct links.
      </div>
    </div>
  `;

  c.querySelector('#org-back-file').onclick = () => { _orgViewing = null; orgRevokeUrls(); renderMain(); };
  c.querySelector('#org-dl').addEventListener('click', () => toast('✓ Saved to Downloads'));
  const openBtn = c.querySelector('#org-open');
  if (openBtn) openBtn.addEventListener('click', () => toast('Opening…'));
  const docxPreviewBtn = c.querySelector('#org-docx-preview');
  if (docxPreviewBtn) docxPreviewBtn.onclick = () => openDocxPreview(file.id, file.name, file.mime);
  c.querySelector('#org-del').onclick = async () => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    await orgDeleteFile(_orgCategory, file.id);
    _orgViewing = null;
    orgRevokeUrls();
    toast('✓ Deleted');
    renderMain();
  };

  c.querySelector('#org-sh-native').onclick = () => orgShareNative(file, blob);
  c.querySelector('#org-sh-wa').onclick     = () => orgShareWhatsApp(file);
  c.querySelector('#org-sh-email').onclick  = () => orgShareEmail(file);
  c.querySelector('#org-sh-print').onclick  = () => orgPrintFile(file, objUrl);
  c.querySelector('#org-sh-copy').onclick   = () => orgCopyInfo(file);
}

/* Removes the file from wherever it actually lives in _data (photos,
   resume, or an entry's files[] array within the given section), then
   cleans up its IndexedDB blob and persists. */
async function orgDeleteFile(section, fileId) {
  await deleteFileBlob(fileId);
  if (section === 'photos') {
    _data.photos = _data.photos.filter(p => p.id !== fileId);
  } else if (section === 'resume') {
    _data.resume = _data.resume.filter(r => r.id !== fileId);
  } else {
    (_data[section]||[]).forEach(e => {
      if (e.files) e.files = e.files.filter(f => f.id !== fileId);
    });
  }
  await persist();
}

async function orgShareNative(file, blob) {
  if (!navigator.share) { toast('Sharing not supported on this browser', 'warn'); return; }
  const mimeType = file.mime || blob.type || 'application/octet-stream';
  const fileObj = new File([blob], file.name, {
    type: mimeType,
    lastModified: file.addedAt || Date.now(),
  });

  /* CRITICAL: navigator.share() can only be called ONCE per user click.
     Browsers tie it to the "user activation" of that click, and calling
     it a second time — even synchronously from a catch block — fails
     with "must be handling a user gesture", because the activation was
     already consumed by the first attempt. So the choice between
     file-share and text-share must be made BEFORE calling share() at
     all, using only canShare() (which does NOT consume the gesture),
     and there is no retry after that — whichever path is chosen is
     the only navigator.share() call made for this click.

     DOC/DOCX is also excluded from file-share up front: canShare() can
     report true for it and then the real share() call still rejects
     it, which is exactly what caused the original bug. */
  const isWordDoc = isDocFile(mimeType, file.name);
  const canShareFiles = !isWordDoc && navigator.canShare && navigator.canShare({ files: [fileObj] });

  try {
    if (canShareFiles) {
      await navigator.share({ title: file.name, text: file.name, files: [fileObj] });
      toast('✓ Shared');
    } else {
      const reason = isWordDoc ? "Word documents aren't reliably file-shareable on this device — use Download instead." : '';
      await navigator.share({ title: file.name, text: `${file.name} · ${fileSizeStr(file.size)}${reason ? ' — ' + reason : ''}` });
      toast(isWordDoc ? 'Shared as text — use Download to send the actual file' : 'Text shared (file attach not supported here)', 'warn');
    }
  } catch(err) {
    if (err.name === 'AbortError') return; // user cancelled — not an error
    toast('Share failed: ' + err.message + ' — try Download instead', 'err');
  }
}
function orgShareWhatsApp(file) {
  const text = encodeURIComponent(`📄 ${file.name}\n${fileSizeStr(file.size)} · ${formatDate(file.addedAt)}\n\n(Use SHARE FILE button to attach the actual file.)`);
  window.open(`https://wa.me/?text=${text}`, '_blank');
}
function orgShareEmail(file) {
  const subject = encodeURIComponent(`File: ${file.name}`);
  const body = encodeURIComponent(`${file.name}\nSize: ${fileSizeStr(file.size)}\nType: ${file.mime}\nAdded: ${formatDate(file.addedAt)}\n\n(Use SHARE FILE to attach the actual file.)`);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
function orgPrintFile(file, url) {
  if ((file.mime||'').startsWith('image/')) {
    const w = window.open('', '_blank');
    if (!w) { toast('Popup blocked — allow popups to print', 'warn'); return; }
    w.document.write(
      '<!doctype html><html><head>' + `<title>${esc(file.name)}</title>` +
      '<style>body{margin:0;padding:0;background:#fff;}img{display:block;max-width:100%;height:auto;margin:0 auto;}@media print{@page{margin:1cm;}}</style>' +
      `</head><body><img src="${url}" onload="setTimeout(function(){window.print();},150)"></body></html>`
    );
    w.document.close();
  } else if ((file.mime||'')==='application/pdf') {
    const w = window.open(url, '_blank');
    if (!w) { toast('Popup blocked — open then print manually', 'warn'); return; }
    setTimeout(() => { try { w.print(); } catch(e){} }, 1500);
  } else {
    toast('Print not available for this file type', 'warn');
  }
}
async function orgCopyInfo(file) {
  const text = `${file.name}\nSize: ${fileSizeStr(file.size)}\nType: ${file.mime}\nAdded: ${formatDate(file.addedAt)}`;
  try { await navigator.clipboard.writeText(text); toast('✓ Info copied'); }
  catch(e) { toast('Copy failed — clipboard blocked', 'err'); }
}

/* ============================================================
   Editor — dynamic form per section
   ============================================================ */
function renderEditor(ctx) {
  const { section, id } = ctx;
  const isNew = !id;
  let entry;
  if (isNew) {
    entry = newEntry(section);
  } else {
    entry = JSON.parse(JSON.stringify(_data[section].find(x=>x.id===id)));
  }

  _root.innerHTML = `
    <button class="vault-crumb" id="back-btn">← ${TABS.find(t=>t.id===section)?.label||section.toUpperCase()}</button>
    <div class="cd-editor" id="editor-body"></div>
    <div class="vault-actions" style="margin-top:16px;">
      <button class="btn btn--primary" id="save-btn">SAVE</button>
      <button class="btn" id="cancel-btn">CANCEL</button>
      ${!isNew ? '<button class="btn vault-actions__del" id="del-btn">DELETE</button>' : ''}
    </div>
  `;

  const body = _root.querySelector('#editor-body');
  buildForm(body, section, entry);

  _root.querySelector('#back-btn').onclick   = backToMain;
  _root.querySelector('#cancel-btn').onclick = backToMain;

  const saveBtn = _root.querySelector('#save-btn');
  let saving = false; // re-entrancy guard — blocks double-click / double-tap

  saveBtn.onclick = async () => {
    if (saving) return;           // ignore extra clicks while a save is in flight
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING…';

    try {
      collectForm(body, section, entry);

      // Idempotent write: always look up by id. If it already exists
      // (e.g. this is a second save attempt on the same entry), update
      // it in place instead of inserting a new copy.
      const idx = _data[section].findIndex(x => x.id === entry.id);
      if (idx >= 0) {
        _data[section][idx] = entry;
      } else {
        _data[section].unshift(entry);
      }

      await persist();
      toast(isNew ? '✓ Added' : '✓ Saved');
      recordActivity('careerdetails', section);
      backToMain();
    } catch (e) {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE';
      toast('Save failed: ' + e.message, 'err');
    }
  };

  if (!isNew) {
    const delBtn = _root.querySelector('#del-btn');
    let deleting = false; // re-entrancy guard for delete too
    delBtn.onclick = () => {
      if (deleting) return;
      deleting = true;
      delBtn.disabled = true;
      deleteEntry(section, id).finally(() => { deleting = false; });
    };
  }
}

function newEntry(section) {
  const base = { id: uuid(), createdAt: Date.now(), files: [], comments: '' };
  switch(section) {
    case 'work':      return { ...base, jobTitle:'', jobTitle2:'', company:'', empId:'', onboardDate:'', offboardDate:'', location:'' };
    case 'edu':       return { ...base, level:'', institution:'', university:'', degree:'', specialization:'', mode:'', yearOfPassing:'', fromDate:'', toDate:'', rollNo:'', percentage:'' };
    case 'certs':     return { ...base, name:'', issuer:'', certId:'', issueDate:'', expiryDate:'', credUrl:'' };
    case 'companies': return { ...base, company:'', url:'', hrContact:'', hrEmail:'', tagEmail:'', applyYear:'', applyMonth:'', passwords:[], jdFile:null };
    case 'idproof':   return { ...base, idName:'', idNumber:'', issuedBy:'', issueDate:'', expiryDate:'' };
    case 'dossier':   return { ...base, docName:'', docNumber:'', docType:'', issuedBy:'', issueDate:'', expiryDate:'' };
    default:          return base;
  }
}

/* ── Build form fields ── */
function buildForm(container, section, entry) {
  let html = '';

  if (section === 'idproof') {
    const idTypes = ['Passport','Aadhaar Card','PAN Card','Driving Licence','Voter ID','National ID','Employee ID Card','Student ID','Birth Certificate','Other'];
    html = `
      ${fieldSelectWithOther('ID Type *', 'idName', idTypes, entry.idName)}
      ${field('ID Number *', 'idNumber', entry.idNumber)}
      ${field('Issued By', 'issuedBy', entry.issuedBy)}
      ${fieldDate('Issue Date', 'issueDate', entry.issueDate)}
      ${fieldDate('Expiry Date (if any)', 'expiryDate', entry.expiryDate)}
      ${fileSection(entry.files, 'Upload ID Proof (image/PDF — any size)')}
      ${commentSection(entry.comments)}
    `;
  } else if (section === 'dossier') {
    const docTypes = ['Agreement','Contract','Appointment Letter','Offer Letter','Relieving Letter','Salary Slip','Bank Statement','Tax Document','Insurance','Property Document','Legal Document','Academic Certificate','Medical Record','Other'];
    html = `
      ${field('Document Name *', 'docName', entry.docName)}
      ${field('Document Number / Reference ID', 'docNumber', entry.docNumber)}
      ${fieldSelectWithOther('Document Type', 'docType', docTypes, entry.docType)}
      ${field('Issued By / Source', 'issuedBy', entry.issuedBy)}
      ${fieldDate('Issue Date', 'issueDate', entry.issueDate)}
      ${fieldDate('Expiry Date (if any)', 'expiryDate', entry.expiryDate)}
      ${fileSection(entry.files, 'Upload Document (any format, any size — including ZIP)')}
      ${commentSection(entry.comments)}
    `;
  } else if (section === 'work') {
    html = `
      ${field('Job Title *', 'jobTitle', entry.jobTitle)}
      ${field('Second Title / Role (if any)', 'jobTitle2', entry.jobTitle2)}
      ${field('Company Name *', 'company', entry.company)}
      ${field('Employee ID', 'empId', entry.empId)}
      ${field('Location / City', 'location', entry.location)}
      ${fieldDate('Onboard Date', 'onboardDate', entry.onboardDate)}
      ${fieldDate('Offboard Date (leave blank if current)', 'offboardDate', entry.offboardDate)}
      ${fileSection(entry.files)}
      ${commentSection(entry.comments)}
    `;
  } else if (section === 'edu') {
    const levels = ['Post Graduation','Graduation','Standard XII / Pre-University','Standard X','Diploma','Other'];
    html = `
      ${fieldSelect('Education Level *', 'level', levels, entry.level)}
      ${field('Name & Location of School / College / Institute', 'institution', entry.institution)}
      ${field('Course Mode (Regular / Correspondence)', 'mode', entry.mode)}
      ${field('Affiliated University / Board', 'university', entry.university)}
      ${field('Degree / Diploma Name *', 'degree', entry.degree)}
      ${field('Specialization', 'specialization', entry.specialization)}
      ${field('Year of Passing', 'yearOfPassing', entry.yearOfPassing)}
      ${fieldDate('From Date', 'fromDate', entry.fromDate)}
      ${fieldDate('To Date', 'toDate', entry.toDate)}
      ${field('Roll No / Registration No / Exam Seat No', 'rollNo', entry.rollNo)}
      ${field('Percentage / Grade', 'percentage', entry.percentage)}
      ${fileSection(entry.files)}
      ${commentSection(entry.comments)}
    `;
  } else if (section === 'certs') {
    html = `
      ${field('Certificate Name *', 'name', entry.name)}
      ${field('Issuing Organization', 'issuer', entry.issuer)}
      ${field('Certificate ID / Credential ID', 'certId', entry.certId)}
      ${fieldDate('Issue Date', 'issueDate', entry.issueDate)}
      ${fieldDate('Expiry Date (if any)', 'expiryDate', entry.expiryDate)}
      ${field('Credential URL', 'credUrl', entry.credUrl)}
      ${fileSection(entry.files)}
      ${commentSection(entry.comments)}
    `;
  } else if (section === 'companies') {
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const mNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const years  = [];
    for (let y=new Date().getFullYear(); y>=2000; y--) years.push(String(y));
    html = `
      ${field('Company Name *', 'company', entry.company)}
      ${field('Company Website URL', 'url', entry.url)}
      ${field('HR Contact Name', 'hrContact', entry.hrContact)}
      ${field('HR Email', 'hrEmail', entry.hrEmail)}
      ${field('Tagged / Application Email', 'tagEmail', entry.tagEmail)}
      ${fieldSelect('Application Year', 'applyYear', years, entry.applyYear)}
      ${fieldSelect('Application Month', 'applyMonth', months.map((m,i)=>({val:m,lbl:mNames[i]})), entry.applyMonth, true)}
      ${passwordSection(entry.passwords||[])}
      ${fileSection(entry.files, 'JD / Offer Letter / Other Docs')}
      ${commentSection(entry.comments)}
    `;
  }

  container.innerHTML = html;
  wireFilePicker(container, entry);
  wirePasswordSection(container, entry);
  wireOtherSelects(container);
}

/* Wires every dropdown built with fieldSelectWithOther: toggles its
   paired text box based on whether "Other" is currently selected. */
function wireOtherSelects(container) {
  container.querySelectorAll('.pdfk-other-select').forEach(sel => {
    const wrap = container.querySelector(`#${sel.dataset.otherTarget}-wrap`);
    if (!wrap) return;
    const sync = () => {
      const isOther = sel.value === 'Other';
      wrap.hidden = !isOther;
      if (isOther) wrap.querySelector('input').focus();
    };
    sel.addEventListener('change', sync);
  });
}

function field(label, name, val='') {
  return `
    <label class="vault-field">
      <span class="vault-field__label">${label}</span>
      <input type="text" name="${name}" value="${esc(val)}" class="cd-input">
    </label>
  `;
}
function fieldDate(label, name, val='') {
  return `
    <label class="vault-field">
      <span class="vault-field__label">${label}</span>
      <input type="text" name="${name}" value="${esc(val)}" class="cd-input" placeholder="DD/MM/YYYY or MM/YYYY">
    </label>
  `;
}
function fieldSelect(label, name, options, val='', useObj=false) {
  const opts = options.map(o => {
    const v = useObj ? o.val : o;
    const l = useObj ? o.lbl : o;
    return `<option value="${esc(v)}" ${val===v?'selected':''}>${esc(l)}</option>`;
  }).join('');
  return `
    <label class="vault-field">
      <span class="vault-field__label">${label}</span>
      <select name="${name}" class="cd-input cd-select">${opts}</select>
    </label>
  `;
}

/* Dropdown that reveals a free-text input when "Other" is selected,
   so a custom type (e.g. "New PAN Card", "Old Passport") can be typed
   in instead of being stuck with the literal word "Other". If the
   entry's current value isn't in the preset list at all (i.e. it was
   already a custom value from a previous save), the dropdown opens
   pre-set to "Other" with that value already filled into the text box. */
function fieldSelectWithOther(label, name, options, val='') {
  const isPreset = options.includes(val);
  const showOther = val && !isPreset; // existing custom value not in the list
  const selectVal = showOther ? 'Other' : (val || '');
  const opts = options.map(o =>
    `<option value="${esc(o)}" ${selectVal===o?'selected':''}>${esc(o)}</option>`
  ).join('');
  return `
    <label class="vault-field">
      <span class="vault-field__label">${label}</span>
      <select name="${name}" class="cd-input cd-select pdfk-other-select" data-other-target="${name}-other">${opts}</select>
    </label>
    <label class="vault-field pdfk-other-field" id="${name}-other-wrap" ${showOther ? '' : 'hidden'}>
      <span class="vault-field__label">Custom ${label.replace(' *','').replace('*','')}</span>
      <input type="text" class="cd-input" id="${name}-other" placeholder="Type your own, e.g. New PAN Card"
             value="${esc(showOther ? val : '')}">
    </label>
  `;
}

function commentSection(val='') {
  return `
    <label class="vault-field vault-field--rich">
      <span class="vault-field__label">Comments / Notes (no limit)</span>
      <div class="rich-toolbar">
        <button type="button" class="rich-btn" data-act="bold" title="Bold"><b>B</b></button>
        <button type="button" class="rich-btn" data-act="headline" title="Headline"><b>H</b></button>
        <button type="button" class="rich-btn" data-act="color" title="Color"><span style="color:var(--lime)">◐</span></button>
        <button type="button" class="rich-btn" data-act="preview" title="Preview">👁</button>
        <button type="button" class="rich-btn" data-act="readmode" title="Read Mode">📖 READ MODE</button>
      </div>
      <textarea class="vault-textarea rich-area" name="comments" rows="5"
                placeholder="Add detailed notes, remarks, timeline… no character limit.">${esc(val)}</textarea>
      <div class="rich-preview" id="cd-preview" hidden></div>
    </label>
  `;
}

function fileSection(files=[], label='Attachments (any file type, any size)') {
  return `
    <div class="vault-field">
      <span class="vault-field__label">${label}</span>
      <div class="cd-file-list" id="file-list">
        ${files.map(f=>`
          <div class="cd-file-item" data-fid="${f.id}">
            <span class="cd-file-item__name">${esc(f.name)}</span>
            <span class="cd-file-item__size">${fileSizeStr(f.size)}</span>
            ${canView(f.mime, f.name) ? `<button type="button" class="vault-tool-btn file-view-btn" data-fid="${f.id}" title="View">👁</button>` : ''}
            ${isDocxFile(f.mime, f.name) ? `<button type="button" class="vault-tool-btn file-docxview-btn" data-fid="${f.id}" title="Preview content">📖 PREVIEW</button>` : ''}
            ${isDocFile(f.mime, f.name) ? `<button type="button" class="vault-tool-btn file-launch-btn" data-fid="${f.id}" title="Launch externally">🚀 LAUNCH</button>` : ''}
            <button type="button" class="vault-tool-btn file-dl-btn" data-fid="${f.id}" title="Download">⬇</button>
            <button type="button" class="vault-tool-btn file-del-btn" data-fid="${f.id}" title="Remove">×</button>
          </div>
        `).join('')}
        ${files.length===0?'<div class="cd-file-empty">No files yet</div>':''}
      </div>
      <input type="file" id="file-picker" multiple hidden>
      <button type="button" class="vault-tool-btn" id="file-pick-btn">📎 ATTACH FILE(S)</button>
    </div>
  `;
}

function passwordSection(passwords=[]) {
  const current = passwords[0]||'';
  const history = passwords.slice(1, HISTORY_MAX+1);
  return `
    <div class="vault-field">
      <span class="vault-field__label">Portal Password (up to ${HISTORY_MAX} versions kept)</span>
      <div class="vault-pwrow">
        <input type="password" id="pw-current" name="pw-current" value="${esc(current)}" class="cd-input" placeholder="Current portal password" autocomplete="off">
        <button type="button" class="vault-pwrow__btn" id="pw-toggle-btn">👁</button>
      </div>
      ${history.length ? `
        <div class="cd-pw-history">
          <div class="cd-pw-history-label">Previous passwords (${history.length}):</div>
          ${history.map((p,i)=>`
            <div class="cd-pw-hist-item">
              <span class="cd-pw-hist-val" data-hidden="1">••••••••</span>
              <button type="button" class="vault-tool-btn pw-hist-toggle">👁</button>
              <span class="cd-pw-hist-data" hidden>${esc(p)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function wireFilePicker(container, entry) {
  const picker = container.querySelector('#file-picker');
  if (!picker) return;

  const refreshFileList = () => {
    const list = container.querySelector('#file-list');
    if (!list) return;
    list.innerHTML = (entry.files||[]).map(f=>`
      <div class="cd-file-item" data-fid="${f.id}">
        <span class="cd-file-item__name">${esc(f.name)}</span>
        <span class="cd-file-item__size">${fileSizeStr(f.size)}</span>
        ${canView(f.mime, f.name) ? `<button type="button" class="vault-tool-btn file-view-btn" data-fid="${f.id}" title="View">👁</button>` : ''}
        ${isDocxFile(f.mime, f.name) ? `<button type="button" class="vault-tool-btn file-docxview-btn" data-fid="${f.id}" title="Preview content">📖 PREVIEW</button>` : ''}
        ${isDocFile(f.mime, f.name) ? `<button type="button" class="vault-tool-btn file-launch-btn" data-fid="${f.id}" title="Launch externally">🚀 LAUNCH</button>` : ''}
        <button type="button" class="vault-tool-btn file-dl-btn" data-fid="${f.id}" title="Download">⬇</button>
        <button type="button" class="vault-tool-btn file-del-btn" data-fid="${f.id}" title="Remove">×</button>
      </div>
    `).join('') || '<div class="cd-file-empty">No files yet</div>';
    wireFileActions(container, entry, refreshFileList);
  };

  const pickBtn = container.querySelector('#file-pick-btn');
  if (pickBtn) pickBtn.onclick = () => picker.click();
  picker.onchange = async (e) => {
    const files = Array.from(e.target.files||[]);
    e.target.value='';
    if (!files.length) return;
    toast(`Uploading ${files.length} file(s)…`);
    let okCount = 0;
    for (const file of files) {
      try {
        const dataUrl = await fileToBase64(file);
        const id = uuid();
        await storeFileBlob(id, dataUrl);   // bytes → IndexedDB (encrypted)
        entry.files = entry.files||[];
        entry.files.push({ id, name:file.name, mime:file.type, size:file.size, addedAt:Date.now() });
        okCount++;
      } catch(err) { toast(`Failed to attach ${file.name}: ${err.message}`, 'err'); }
    }
    refreshFileList();
    if (okCount) toast(`✓ ${okCount} file(s) attached`);
  };
  wireFileActions(container, entry, refreshFileList);

  // Rich text toolbar
  const ta = container.querySelector('textarea[name="comments"]');
  const preview = container.querySelector('#cd-preview');
  if (ta && preview) {
    container.querySelectorAll('.rich-btn').forEach(btn => {
      btn.onclick = () => handleRichBtn(btn.dataset.act, ta, preview, btn);
    });
    ta.addEventListener('input', () => { if (!preview.hidden) renderPreview(preview, ta.value); });
  }
}

function wireFileActions(container, entry, refresh) {
  container.querySelectorAll('.file-view-btn').forEach(btn => {
    btn.onclick = async () => {
      const viewableFiles = (entry.files||[]).filter(f => canView(f.mime, f.name));
      const startIndex = viewableFiles.findIndex(x => x.id === btn.dataset.fid);
      if (startIndex === -1) return;
      await openFileViewerGallery(viewableFiles, startIndex);
    };
  });
  container.querySelectorAll('.file-docxview-btn').forEach(btn => {
    btn.onclick = async () => {
      const f = (entry.files||[]).find(x=>x.id===btn.dataset.fid);
      if (!f) return;
      await openDocxPreview(f.id, f.name, f.mime);
    };
  });
  container.querySelectorAll('.file-launch-btn').forEach(btn => {
    btn.onclick = async () => {
      const f = (entry.files||[]).find(x=>x.id===btn.dataset.fid);
      if (!f) return;
      await launchFileBlob(f.id, f.name, f.mime);
    };
  });
  container.querySelectorAll('.file-dl-btn').forEach(btn => {
    btn.onclick = async () => {
      const f = (entry.files||[]).find(x=>x.id===btn.dataset.fid);
      if (!f) return;
      try { downloadFile(await loadFileBlob(f.id), f.name, f.mime); }
      catch(err) { toast('Download failed: '+err.message, 'err'); }
    };
  });
  container.querySelectorAll('.file-del-btn').forEach(btn => {
    btn.onclick = async () => {
      await deleteFileBlob(btn.dataset.fid);
      entry.files = (entry.files||[]).filter(x=>x.id!==btn.dataset.fid);
      refresh();
      toast('File removed');
    };
  });
}

function wirePasswordSection(container, entry) {
  const pwInput = container.querySelector('#pw-current');
  const pwToggle = container.querySelector('#pw-toggle-btn');
  if (!pwInput || !pwToggle) return;
  pwToggle.onclick = () => {
    pwInput.type = pwInput.type==='password' ? 'text' : 'password';
    pwToggle.textContent = pwInput.type==='password' ? '👁' : '🙈';
  };
  // history toggle
  container.querySelectorAll('.pw-hist-toggle').forEach(btn => {
    btn.onclick = () => {
      const span = btn.previousElementSibling;
      const data = btn.nextElementSibling;
      if (span.dataset.hidden==='1') {
        span.textContent = data.textContent;
        span.dataset.hidden='0'; btn.textContent='🙈';
      } else {
        span.textContent='••••••••';
        span.dataset.hidden='1'; btn.textContent='👁';
      }
    };
  });
}

/* ── Collect form values back into entry ── */
function collectForm(container, section, entry) {
  container.querySelectorAll('[name]').forEach(el => {
    const name = el.getAttribute('name');
    if (name === 'comments') { entry.comments = el.value; return; }
    if (name === 'pw-current') {
      const newPw = el.value;
      if (newPw) {
        const old = entry.passwords||[];
        if (old[0] !== newPw) {
          entry.passwords = [newPw, ...old.slice(0, HISTORY_MAX-1)];
        }
      }
      return;
    }
    if (el.tagName==='SELECT'||el.tagName==='INPUT'||el.tagName==='TEXTAREA') {
      entry[name] = el.value;
    }
    // If this is an "Other"-enabled dropdown set to "Other", use the
    // typed custom value instead of the literal word "Other" — but
    // only overwrite if the user actually typed something.
    if (el.classList && el.classList.contains('pdfk-other-select') && el.value === 'Other') {
      const otherInput = container.querySelector(`#${el.dataset.otherTarget}`);
      if (otherInput && otherInput.value.trim()) {
        entry[name] = otherInput.value.trim();
      }
    }
  });
}

/* ============================================================
   Rich text toolbar (Reader-style)
   ============================================================ */
function handleRichBtn(act, ta, preview, btn) {
  if (act==='readmode') {
    // grab the section title from the nearest vault-field__label sibling if available
    const label = btn.closest('.vault-field')?.querySelector('.vault-field__label')?.textContent || 'Comments';
    openReaderOverlay({ title: label, body: ta.value, speakable: true });
    return;
  }
  if (act==='preview') {
    if (!preview.hidden) { preview.hidden=true; ta.style.display=''; btn.classList.remove('is-active'); }
    else { renderPreview(preview, ta.value); preview.hidden=false; ta.style.display='none'; btn.classList.add('is-active'); }
    return;
  }
  if (preview && !preview.hidden) { toast('Toggle preview off to edit','warn'); return; }
  const s=ta.selectionStart, e=ta.selectionEnd, v=ta.value, sel=v.slice(s,e)||'text';
  let ins;
  if (act==='bold')     ins=`**${sel}**`;
  else if (act==='headline') {
    const ls=v.lastIndexOf('\n',s-1)+1, le=v.indexOf('\n',s);
    const end=le===-1?v.length:le, line=v.slice(ls,end);
    const nl=line.startsWith('## ')?line.slice(3):`## ${line}`;
    ta.value=v.slice(0,ls)+nl+v.slice(end);
    ta.focus(); ta.selectionStart=ta.selectionEnd=ls+nl.length; return;
  } else if (act==='color') {
    const cycle=['','lime','orange','red'];
    const next=cycle[(cycle.indexOf(ta.dataset.lastColor||'')+1)%cycle.length];
    ta.dataset.lastColor=next;
    ins=next?`[${next}]${sel}[/${next}]`:sel;
    toast(next?`Color: ${next}`:'Color cleared');
  }
  if (ins!==undefined) {
    ta.value=v.slice(0,s)+ins+v.slice(e);
    ta.focus(); ta.selectionStart=s; ta.selectionEnd=s+ins.length;
  }
}
function renderPreview(el, raw) {
  if (!raw||!raw.trim()) { el.innerHTML=''; el.hidden=true; return; }
  el.hidden=false;
  let h=esc(raw);
  h=h.replace(/^##\s+(.+)$/gm,'<span class="rich-h">$1</span>');
  h=h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/\[(lime|orange|red)\]([\s\S]*?)\[\/\1\]/g,(_,c,t)=>`<span class="rich-c rich-c--${c}">${t}</span>`);
  h=h.replace(/\n/g,'<br>');
  el.innerHTML=h;
}

/* ============================================================
   Delete entry
   ============================================================ */
async function deleteEntry(section, id) {
  if (!confirm('Delete this entry? Cannot be undone.')) return;
  const entry = _data[section].find(x=>x.id===id);
  // Clean up any attached file blobs in IndexedDB so deleted entries
  // don't leave orphaned encrypted files taking up storage forever.
  if (entry && (entry.files||[]).length) {
    for (const f of entry.files) await deleteFileBlob(f.id);
  }
  _data[section] = _data[section].filter(x=>x.id!==id);
  await persist();
  toast('✓ Deleted');
  backToMain();
}

/* ============================================================
   Export / Import  (password-protected)
   ============================================================ */
/* ── Password modal — replaces browser prompt() with hidden input ── */
function showPasswordModal(title, onConfirm) {
  const existing = document.getElementById('cd-pw-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'cd-pw-modal';
  modal.className = 'cd-modal-overlay';
  modal.innerHTML = `
    <div class="cd-modal">
      <div class="cd-modal__title">${title}</div>
      <div class="vault-pwrow">
        <input type="password" id="cd-modal-pw" class="cd-pw-input"
               placeholder="Password" autocomplete="off"
               data-lpignore="true" data-1p-ignore="true" value="">
        <button type="button" class="vault-pwrow__btn" id="cd-modal-reveal">👁</button>
      </div>
      <div class="cd-modal__actions">
        <button class="btn btn--primary" id="cd-modal-ok">OK</button>
        <button class="btn" id="cd-modal-cancel">CANCEL</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const inp = modal.querySelector('#cd-modal-pw');
  setTimeout(() => { inp.value=''; inp.focus(); }, 0);

  // show/hide
  let rev = false;
  modal.querySelector('#cd-modal-reveal').onclick = () => {
    rev = !rev; inp.type = rev ? 'text' : 'password'; inp.focus();
  };

  const confirm = async () => {
    const pw = inp.value;
    inp.value='';
    modal.remove();
    if (pw) await onConfirm(pw);
  };
  modal.querySelector('#cd-modal-ok').onclick     = confirm;
  modal.querySelector('#cd-modal-cancel').onclick = () => { inp.value=''; modal.remove(); };
  inp.addEventListener('keydown', e => { if(e.key==='Enter') confirm(); if(e.key==='Escape') { inp.value=''; modal.remove(); } });
}

async function exportData() {
  showPasswordModal('Enter master password to export:', async (pw) => {
    try {
      const stored  = loadStored();
      const testKey = await deriveKey(pw, b64ToBytes(stored.salt));
      await decryptBlob({ iv: stored.iv, ct: stored.ct }, testKey); // verify pw

      // Collect every file id referenced anywhere in _data so the export
      // is a complete, self-contained backup (metadata + actual bytes).
      const allFileIds = collectAllFileIds(_data);
      toast(allFileIds.length ? `Packaging ${allFileIds.length} file(s)…` : 'Packaging…');
      const fileBlobs = {};
      for (const id of allFileIds) {
        try { fileBlobs[id] = await loadFileBlob(id); }
        catch(e) { /* file missing in IndexedDB — skip, metadata stays but file won't restore */ }
      }

      const exportSalt = crypto.getRandomValues(new Uint8Array(16));
      const exportKey  = await deriveKey(pw, exportSalt);
      const blob = await encryptBlob({ data: _data, files: fileBlobs, exportedAt: new Date().toISOString() }, exportKey);
      const payload = JSON.stringify({ app:'smartapp', module:'careerdetails', v:2, salt: bytesToB64(exportSalt), ...blob });
      const url = URL.createObjectURL(new Blob([payload], { type:'application/json' }));
      const a   = document.createElement('a');
      a.href = url; a.download = `careerdetails-export-${ts()}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
      toast('✓ Exported (encrypted, with files)');
    } catch(e) { toast('Export failed — wrong password: '+e.message,'err'); }
  });
}

/* Walk every section and pull out every file id referenced, so export/import
   know exactly which IndexedDB blobs belong to this data set. */
function collectAllFileIds(data) {
  const ids = [];
  ['work','edu','certs','companies','idproof','dossier'].forEach(s => {
    (data[s]||[]).forEach(e => (e.files||[]).forEach(f => ids.push(f.id)));
  });
  (data.photos||[]).forEach(p => ids.push(p.id));
  (data.resume||[]).forEach(r => ids.push(r.id));
  return ids;
}

async function importData(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value='';
  if (!file) return;
  showPasswordModal('Enter the password used when this file was exported:', async (pw) => {
    try {
      const text = await file.text();
      const obj  = JSON.parse(text);
      if (obj.module !== 'careerdetails') return toast('Not a Career Details export file','err');
      const key  = await deriveKey(pw, b64ToBytes(obj.salt));
      const dec  = await decryptBlob({ iv: obj.iv, ct: obj.ct }, key);
      const incoming = dec.data;
      const incomingFiles = dec.files || {}; // { fileId: dataUrl } — present in v2+ exports
      const fileCount = Object.keys(incomingFiles).length;
      if (!confirm(`Import will MERGE with current data${fileCount?` (including ${fileCount} file(s))`:''}. Exported: ${dec.exportedAt||'unknown'}. Continue?`)) return;

      ['work','edu','certs','photos','resume','companies','idproof','dossier'].forEach(s => {
        const cur = _data[s]||[];
        const inc = incoming[s]||[];
        const ids = new Set(cur.map(x=>x.id));
        inc.forEach(x => { if(!ids.has(x.id)) cur.push(x); });
        _data[s] = cur;
      });

      // Restore file bytes into IndexedDB for every file id in this import
      if (fileCount) {
        toast(`Restoring ${fileCount} file(s)…`);
        for (const [fileId, dataUrl] of Object.entries(incomingFiles)) {
          try { await storeFileBlob(fileId, dataUrl); }
          catch(err) { console.warn('Failed to restore file', fileId, err); }
        }
      }

      await persist();
      toast('✓ Import complete');
      renderMain();
    } catch(e) { toast('Import failed — wrong password or corrupt file','err'); }
  });
}

/* ============================================================
   Lock / Idle
   ============================================================ */
function lock() {
  _key  = null;
  _data = null;
  _editCtx = null;
  clearTimeout(_idleTimer);
}
function startIdle() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => { lock(); if(_root) { toast('Career Details locked (idle)','warn'); routeView(); } }, IDLE_MS);
  document.addEventListener('pointerdown', resetIdle, { passive:true });
  document.addEventListener('keydown',     resetIdle, { passive:true });
}
function resetIdle() {
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => { lock(); if(_root) { toast('Career Details locked (idle)','warn'); routeView(); } }, IDLE_MS);
}

/* ============================================================
   Helpers
   ============================================================ */
function backToMain() { _editCtx=null; renderMain(); }

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0,v=c==='x'?r:(r&3|8); return v.toString(16);
  });
}

/* ── Row-level VIEW button — shown on list cards (not just inside the
   editor) so a file can be previewed without opening EDIT first.
   Only rendered when the entry has at least one previewable file
   (canView() already excludes ZIPs and other non-previewable types). */
function rowViewBtn(entry) {
  const viewableFiles = (entry.files||[]).filter(f => canView(f.mime, f.name));
  if (!viewableFiles.length) return '';
  const label = viewableFiles.length > 1 ? `👁 VIEW (${viewableFiles.length})` : '👁 VIEW';
  return `<button class="vault-tool-btn cd-row-view" data-id="${entry.id}" title="View">${label}</button>`;
}

/* Wires every .cd-row-view button inside `container` for the given
   in-memory `list` (e.g. _data.work, _data.dossier, …). Opens the
   file viewer with ALL of that entry's viewable files loaded, so
   Prev/Next navigation works when there's more than one. */
function wireRowViewButtons(container, list) {
  container.querySelectorAll('.cd-row-view').forEach(btn => {
    btn.onclick = async () => {
      const entry = list.find(x => x.id === btn.dataset.id);
      if (!entry) return;
      const viewableFiles = (entry.files||[]).filter(f => canView(f.mime, f.name));
      if (!viewableFiles.length) return;
      await openFileViewerGallery(viewableFiles, 0);
    };
  });
}

function esc(s) {
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatDate(ts) {
  if(!ts) return '—';
  const d=new Date(ts);
  return d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
}

function fileSizeStr(bytes) {
  if (!bytes) return '';
  if (bytes>1024*1024) return (bytes/1024/1024).toFixed(1)+' MB';
  return Math.round(bytes/1024)+' KB';
}

function ts() {
  const d=new Date();
  return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes());
}
function pad(n){return String(n).padStart(2,'0');}

async function fileToBase64(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=()=>rej(r.error);
    r.readAsDataURL(file);
  });
}


/* ── File viewer — opens image/PDF inline in overlay ── */
function canView(mime, name) {
  const m = (mime||'').toLowerCase();
  const n = (name||'').toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf'
      || n.endsWith('.jpg') || n.endsWith('.jpeg')
      || n.endsWith('.png') || n.endsWith('.gif')
      || n.endsWith('.webp') || n.endsWith('.pdf');
}

/* DOC/DOCX files can't be previewed inline in a browser. LAUNCH opens
   (or, if the browser can't open it inline, downloads) the raw file
   so the device's own Word/LibreOffice/viewer app can handle it
   locally — the file never leaves the device either way. */
function isDocFile(mime, name) {
  const m = (mime||'').toLowerCase();
  const n = (name||'').toLowerCase();
  return m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx');
}

async function launchFileBlob(fileId, name, mime) {
  try {
    const dataUrl = await loadFileBlob(fileId);
    const blob = dataUrlToBlob(dataUrl, mime);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    toast(`Launching ${name} — opens with your device's default app if available, or downloads`, 'ok');
  } catch(err) { toast('Could not launch file: ' + err.message, 'err'); }
}

/* ============================================================
   In-app DOCX text preview (mammoth.js)
   ------------------------------------------------------------
   Browsers have no built-in way to render .docx content — unlike
   PDF/images there's no native viewer. mammoth.js parses the
   .docx XML entirely offline and converts it to basic HTML
   (paragraphs, bold/italic, headings, simple tables). It is a
   READABLE APPROXIMATION, not a pixel-perfect copy: complex
   layout, headers/footers, text boxes, and design won't carry
   over. .doc (old binary format, pre-2007) is NOT supported by
   this approach — only .docx. mammoth loads as a classic script
   (not an ES module) and attaches itself to window.mammoth.
   ============================================================ */
let _mammothLoading = null;
function ensureMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (_mammothLoading) return _mammothLoading;
  _mammothLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './vendor/mammoth.browser.min.js';
    script.onload = () => window.mammoth ? resolve(window.mammoth) : reject(new Error('mammoth failed to initialize'));
    script.onerror = () => reject(new Error('Could not load DOCX preview library'));
    document.head.appendChild(script);
  });
  return _mammothLoading;
}

function isDocxFile(mime, name) {
  const m = (mime||'').toLowerCase();
  const n = (name||'').toLowerCase();
  return n.endsWith('.docx') || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

async function openDocxPreview(fileId, name, mime) {
  if (!isDocxFile(mime, name)) {
    toast('In-app preview only supports .docx files (not old .doc format) — use LAUNCH to open this file instead', 'warn');
    return;
  }
  const existing = document.getElementById('cd-docx-viewer');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cd-docx-viewer';
  overlay.className = 'cd-viewer-overlay';
  overlay.innerHTML = `
    <div class="cd-viewer-box">
      <div class="cd-viewer-toolbar">
        <span class="cd-viewer-name">${esc(name)}</span>
        <button class="vault-tool-btn cd-viewer-close" id="cd-docx-close">✕ Close</button>
      </div>
      <div class="cd-viewer-body cd-docx-body" id="cd-docx-body">
        <div class="pdfk-note">Loading preview…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', keyHandler); };
  const keyHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', keyHandler);
  overlay.querySelector('#cd-docx-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const bodyEl = overlay.querySelector('#cd-docx-body');
  try {
    const mammoth = await ensureMammoth();
    const dataUrl = await loadFileBlob(fileId);
    const arrayBuffer = dataUrlToArrayBuffer(dataUrl);
    const result = await mammoth.convertToHtml({ arrayBuffer });
    bodyEl.innerHTML = `
      <div class="cd-docx-doc">${result.value}</div>
      ${result.messages && result.messages.length ? `<div class="cd-docx-note">Note: some formatting may not be shown exactly as in the original.</div>` : ''}
    `;
  } catch(err) {
    bodyEl.innerHTML = `
      <div class="cd-viewer-unsupported">
        Couldn't generate a preview for this file.<br>
        ${esc(err.message)}<br><br>
        Use Launch / Download above to open it in Word or LibreOffice instead.
      </div>`;
  }
}

/* Opens the file viewer for a SET of files (e.g. all photos attached to
   one work-experience entry), with Prev/Next navigation between them.
   `files` = [{id, name, mime}, …] (metadata only — bytes loaded on demand
   per-file so we don't decrypt everything up front). `startIndex` = which
   one to show first. */
async function openFileViewerGallery(files, startIndex) {
  let index = startIndex;
  const showCurrent = async () => {
    const f = files[index];
    try {
      const dataUrl = await loadFileBlob(f.id);
      openFileViewer(dataUrl, f.name, f.mime, {
        position: files.length > 1 ? `${index + 1} / ${files.length}` : null,
        onPrev: files.length > 1 ? () => { index = (index - 1 + files.length) % files.length; showCurrent(); } : null,
        onNext: files.length > 1 ? () => { index = (index + 1) % files.length; showCurrent(); } : null,
      });
    } catch(err) { toast('Could not open file: ' + err.message, 'err'); }
  };
  await showCurrent();
}

function openFileViewer(dataUrl, name, mime, nav = {}) {
  const existing = document.getElementById('cd-file-viewer');
  if (existing) existing.remove();

  const isImg = (mime||'').startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isPdf = (mime||'') === 'application/pdf' || /\.pdf$/i.test(name);

  const overlay = document.createElement('div');
  overlay.id = 'cd-file-viewer';
  overlay.className = 'cd-viewer-overlay';
  overlay.innerHTML = `
    <div class="cd-viewer-box">
      <div class="cd-viewer-toolbar">
        <span class="cd-viewer-name">${esc(name)}</span>
        ${nav.position ? `<span class="cd-viewer-position">${esc(nav.position)}</span>` : ''}
        <button class="vault-tool-btn" id="cd-viewer-dl">⬇ Download</button>
        <button class="vault-tool-btn cd-viewer-close" id="cd-viewer-close">✕ Close</button>
      </div>
      <div class="cd-viewer-body" id="cd-viewer-body">
        ${nav.onPrev ? `<button class="cd-viewer-nav cd-viewer-nav--prev" id="cd-viewer-prev" title="Previous">‹</button>` : ''}
        ${isImg ? `<img src="${dataUrl}" class="cd-viewer-img" alt="${esc(name)}">` : ''}
        ${isPdf ? `<iframe src="${dataUrl}" class="cd-viewer-iframe" title="${esc(name)}"></iframe>` : ''}
        ${!isImg && !isPdf ? `<div class="cd-viewer-unsupported">Preview not available for this file type.<br>Use the Download button.</div>` : ''}
        ${nav.onNext ? `<button class="cd-viewer-nav cd-viewer-nav--next" id="cd-viewer-next" title="Next">›</button>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#cd-viewer-dl').onclick    = () => downloadFile(dataUrl, name, mime);
  overlay.querySelector('#cd-viewer-close').onclick = () => { overlay.remove(); document.removeEventListener('keydown', keyHandler); };
  overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); document.removeEventListener('keydown', keyHandler); } });
  if (nav.onPrev) overlay.querySelector('#cd-viewer-prev').onclick = () => { overlay.remove(); document.removeEventListener('keydown', keyHandler); nav.onPrev(); };
  if (nav.onNext) overlay.querySelector('#cd-viewer-next').onclick = () => { overlay.remove(); document.removeEventListener('keydown', keyHandler); nav.onNext(); };
  const keyHandler = (e) => {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', keyHandler); }
    else if (e.key === 'ArrowLeft'  && nav.onPrev) { overlay.remove(); document.removeEventListener('keydown', keyHandler); nav.onPrev(); }
    else if (e.key === 'ArrowRight' && nav.onNext) { overlay.remove(); document.removeEventListener('keydown', keyHandler); nav.onNext(); }
  };
  document.addEventListener('keydown', keyHandler);
}

function downloadFile(dataUrl, name, mime) {
  const a=document.createElement('a');
  a.href=dataUrl; a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>a.remove(),500);
}
