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

const STORAGE_KEY   = 'smartapp_careerdetails_v1';
const PBKDF2_ITER   = 250000;
const IDLE_MS       = 5 * 60 * 1000;
const HISTORY_MAX   = 5;

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
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}
async function encrypt(plain, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify(plain))
  );
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
async function decrypt(blob, key) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(blob.iv) },
    key, unb64(blob.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}
function b64(u8)  { let s=''; for (const b of u8) s+=String.fromCharCode(b); return btoa(s); }
function unb64(s) { const b=atob(s),u=new Uint8Array(b.length); for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i); return u; }

async function save() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = _key; // use current in-memory key
  const blob = await encrypt(_data, key);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ salt: b64(salt), ...blob }));
}
async function saveWithKey(key) {
  _key = key;
  await save();
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
        <input type="password" id="pw1" class="cd-pw-input" placeholder="Enter master password" autocomplete="new-password">
      </div>
      <div class="vault-field">
        <span class="vault-field__label">Confirm Password</span>
        <input type="password" id="pw2" class="cd-pw-input" placeholder="Confirm master password" autocomplete="new-password">
      </div>
      <button class="btn btn--primary cd-btn" id="setup-btn">CREATE &amp; UNLOCK</button>
      <div class="cd-lock-warn">⚠ If you forget this password, your data cannot be recovered.</div>
    </div>
  `;
  const pw1 = _root.querySelector('#pw1');
  const pw2 = _root.querySelector('#pw2');
  _root.querySelector('#setup-btn').onclick = async () => {
    const p1 = pw1.value, p2 = pw2.value;
    if (!p1) return toast('Enter a password', 'warn');
    if (p1.length < 6) return toast('Password must be at least 6 characters', 'warn');
    if (p1 !== p2) return toast('Passwords do not match', 'warn');
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key  = await deriveKey(p1, salt);
      _data = emptyData();
      const blob = await encrypt(_data, key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ salt: b64(salt), ...blob }));
      _key = key;
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
  _root.innerHTML = `
    <div class="cd-lock-screen">
      <div class="cd-lock-icon">🔒</div>
      <div class="cd-lock-title">Career Details</div>
      <div class="cd-lock-sub">Enter your master password to access your personal data.</div>
      <div class="vault-field">
        <span class="vault-field__label">Password</span>
        <input type="password" id="pw" class="cd-pw-input" placeholder="Master password" autocomplete="current-password">
      </div>
      <button class="btn btn--primary cd-btn" id="unlock-btn">UNLOCK</button>
      <button class="vault-tool-btn cd-reset-btn" id="reset-btn">Reset (wipe all data)</button>
    </div>
  `;
  const pw = _root.querySelector('#pw');
  pw.focus();
  _root.querySelector('#unlock-btn').onclick = async () => {
    const p = pw.value;
    if (!p) return toast('Enter password', 'warn');
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const salt   = unb64(stored.salt);
      const key    = await deriveKey(p, salt);
      _data = await decrypt({ iv: stored.iv, ct: stored.ct }, key);
      // ensure all sections exist (forward-compat)
      _data.work      = _data.work      || [];
      _data.edu       = _data.edu       || [];
      _data.certs     = _data.certs     || [];
      _data.photos    = _data.photos    || [];
      _data.resume    = _data.resume    || [];
      _data.companies = _data.companies || [];
      _key = key;
      startIdle();
      toast('✓ Unlocked');
      recordActivity('careerdetails', 'Unlocked');
      renderMain();
    } catch(e) { toast('Wrong password', 'err'); pw.value=''; pw.focus(); }
  };
  pw.addEventListener('keydown', e => { if(e.key==='Enter') _root.querySelector('#unlock-btn').click(); });
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
];

function renderMain() {
  _root.innerHTML = `
    <div class="cd-wrap">
      <div class="cd-toolbar">
        <button class="vault-tool-btn" id="export-btn">⬇ EXPORT</button>
        <button class="vault-tool-btn" id="import-btn">⬆ IMPORT</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
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
    btn.onclick = () => { _tab = btn.dataset.tab; renderMain(); };
  });
  _root.querySelector('#lock-btn').onclick   = () => { lock(); routeView(); };
  _root.querySelector('#export-btn').onclick  = exportData;
  _root.querySelector('#import-btn').onclick  = () => _root.querySelector('#import-file').click();
  _root.querySelector('#import-file').onchange = importData;
  renderTab(_root.querySelector('#cd-tab-body'));
  resetIdle();
}

function renderTab(container) {
  switch(_tab) {
    case 'work':      return renderWork(container);
    case 'edu':       return renderEdu(container);
    case 'certs':     return renderCerts(container);
    case 'photos':    return renderPhotos(container);
    case 'resume':    return renderResume(container);
    case 'companies': return renderCompanies(container);
  }
}

/* ============================================================
   TAB 1 — Work Experience
   ============================================================ */
function renderWork(c) {
  c.innerHTML = `
    <button class="btn btn--primary cd-add-btn" id="add-work">+ ADD EXPERIENCE</button>
    <div class="cd-list" id="work-list">
      ${_data.work.length === 0
        ? `<div class="cd-empty">No work experience added yet.</div>`
        : _data.work.map(e => workRowHtml(e)).join('')}
    </div>
  `;
  c.querySelector('#add-work').onclick = () => { _editCtx = { section:'work', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'work', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('work', btn.dataset.id);
  });
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
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 2 — Education
   ============================================================ */
function renderEdu(c) {
  c.innerHTML = `
    <button class="btn btn--primary cd-add-btn" id="add-edu">+ ADD EDUCATION</button>
    <div class="cd-list" id="edu-list">
      ${_data.edu.length === 0
        ? `<div class="cd-empty">No education records added yet.</div>`
        : _data.edu.map(e => eduRowHtml(e)).join('')}
    </div>
  `;
  c.querySelector('#add-edu').onclick = () => { _editCtx = { section:'edu', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'edu', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('edu', btn.dataset.id);
  });
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
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 3 — Certifications
   ============================================================ */
function renderCerts(c) {
  c.innerHTML = `
    <button class="btn btn--primary cd-add-btn" id="add-cert">+ ADD CERTIFICATE</button>
    <div class="cd-list">
      ${_data.certs.length === 0
        ? `<div class="cd-empty">No certificates added yet.</div>`
        : _data.certs.map(e => certRowHtml(e)).join('')}
    </div>
  `;
  c.querySelector('#add-cert').onclick = () => { _editCtx = { section:'certs', id:null }; renderEditor(_editCtx); };
  c.querySelectorAll('.cd-row-edit').forEach(btn => {
    btn.onclick = () => { _editCtx = { section:'certs', id: btn.dataset.id }; renderEditor(_editCtx); };
  });
  c.querySelectorAll('.cd-row-del').forEach(btn => {
    btn.onclick = () => deleteEntry('certs', btn.dataset.id);
  });
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
    const data = await fileToBase64(file);
    _data.photos.unshift({ id:uuid(), name:file.name, mime:file.type, data, addedAt:Date.now(), primary: _data.photos.length===0 });
    await save(); renderMain();
    toast('✓ Photo added');
  };
  c.querySelectorAll('.photo-primary-btn').forEach(btn => {
    btn.onclick = async () => {
      _data.photos.forEach(p => p.primary = p.id===btn.dataset.id);
      await save(); renderMain();
      toast('✓ Primary photo set');
    };
  });
  c.querySelectorAll('.photo-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this photo?')) return;
      _data.photos = _data.photos.filter(p=>p.id!==btn.dataset.id);
      await save(); renderMain();
      toast('✓ Photo deleted');
    };
  });
  c.querySelectorAll('.photo-dl-btn').forEach(btn => {
    btn.onclick = () => {
      const p = _data.photos.find(x=>x.id===btn.dataset.id);
      if (p) downloadFile(p.data, p.name, p.mime);
    };
  });
}

function photoCardHtml(p, i) {
  return `
    <div class="cd-photo-card ${p.primary?'is-primary':''}">
      <img class="cd-photo-img" src="${p.data}" alt="Photo ${i+1}">
      ${p.primary ? '<div class="cd-photo-badge">★ PRIMARY</div>' : ''}
      <div class="cd-photo-name">${esc(p.name)}</div>
      <div class="cd-photo-date">${formatDate(p.addedAt)}</div>
      <div class="cd-photo-actions">
        ${!p.primary ? `<button class="vault-tool-btn photo-primary-btn" data-id="${p.id}">SET PRIMARY</button>` : ''}
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
    <div class="cd-list" id="resume-list">
      ${_data.resume.length===0
        ? `<div class="cd-empty">No resume uploaded yet.</div>`
        : _data.resume.map((r,i) => resumeRowHtml(r,i)).join('')}
    </div>
  `;
  c.querySelector('#resume-pick-btn').onclick = () => c.querySelector('#resume-input').click();
  c.querySelector('#resume-input').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value='';
    if (!file) return;
    const data = await fileToBase64(file);
    _data.resume.unshift({ id:uuid(), name:file.name, mime:file.type, size:file.size, data, addedAt:Date.now(), active:_data.resume.length===0, notes:'' });
    await save(); renderMain();
    toast('✓ Resume added');
  };
  c.querySelectorAll('.resume-active-btn').forEach(btn => {
    btn.onclick = async () => {
      _data.resume.forEach(r => r.active = r.id===btn.dataset.id);
      await save(); renderMain();
      toast('✓ Active resume set');
    };
  });
  c.querySelectorAll('.resume-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this resume version?')) return;
      _data.resume = _data.resume.filter(r=>r.id!==btn.dataset.id);
      await save(); renderMain();
      toast('✓ Resume deleted');
    };
  });
  c.querySelectorAll('.resume-dl-btn').forEach(btn => {
    btn.onclick = () => {
      const r = _data.resume.find(x=>x.id===btn.dataset.id);
      if (r) downloadFile(r.data, r.name, r.mime);
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
        <button class="vault-tool-btn resume-dl-btn" data-id="${r.id}">⬇ DL</button>
        <button class="vault-tool-btn resume-del-btn" data-id="${r.id}">DEL</button>
      </div>
    </div>
  `;
}

/* ============================================================
   TAB 6 — Company Applications
   ============================================================ */
let _coFilter = { year:'', month:'' };

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
        <button class="vault-tool-btn cd-row-del" data-id="${e.id}">DEL</button>
      </div>
    </div>
  `;
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
  _root.querySelector('#save-btn').onclick   = async () => {
    collectForm(body, section, entry);
    if (!isNew) {
      const idx = _data[section].findIndex(x=>x.id===id);
      if (idx>=0) _data[section][idx] = entry;
    } else {
      _data[section].unshift(entry);
    }
    await save();
    toast(isNew ? '✓ Added' : '✓ Saved');
    recordActivity('careerdetails', section);
    backToMain();
  };
  if (!isNew) {
    _root.querySelector('#del-btn').onclick = () => deleteEntry(section, id);
  }
}

function newEntry(section) {
  const base = { id: uuid(), createdAt: Date.now(), files: [], comments: '' };
  switch(section) {
    case 'work':      return { ...base, jobTitle:'', jobTitle2:'', company:'', empId:'', onboardDate:'', offboardDate:'', location:'' };
    case 'edu':       return { ...base, level:'', institution:'', university:'', degree:'', specialization:'', mode:'', yearOfPassing:'', fromDate:'', toDate:'', rollNo:'', percentage:'' };
    case 'certs':     return { ...base, name:'', issuer:'', certId:'', issueDate:'', expiryDate:'', credUrl:'' };
    case 'companies': return { ...base, company:'', url:'', hrContact:'', hrEmail:'', tagEmail:'', applyYear:'', applyMonth:'', passwords:[], jdFile:null };
    default:          return base;
  }
}

/* ── Build form fields ── */
function buildForm(container, section, entry) {
  let html = '';

  if (section === 'work') {
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
            <button type="button" class="vault-tool-btn file-dl-btn" data-fid="${f.id}">⬇</button>
            <button type="button" class="vault-tool-btn file-del-btn" data-fid="${f.id}">×</button>
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
        <button type="button" class="vault-tool-btn file-dl-btn" data-fid="${f.id}">⬇</button>
        <button type="button" class="vault-tool-btn file-del-btn" data-fid="${f.id}">×</button>
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
    toast(`Loading ${files.length} file(s)…`);
    for (const file of files) {
      const data = await fileToBase64(file);
      entry.files = entry.files||[];
      entry.files.push({ id:uuid(), name:file.name, mime:file.type, size:file.size, data, addedAt:Date.now() });
    }
    refreshFileList();
    toast(`✓ ${files.length} file(s) attached`);
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
  container.querySelectorAll('.file-dl-btn').forEach(btn => {
    btn.onclick = () => {
      const f = (entry.files||[]).find(x=>x.id===btn.dataset.fid);
      if (f) downloadFile(f.data, f.name, f.mime);
    };
  });
  container.querySelectorAll('.file-del-btn').forEach(btn => {
    btn.onclick = () => {
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
  _data[section] = _data[section].filter(x=>x.id!==id);
  await save();
  toast('✓ Deleted');
  backToMain();
}

/* ============================================================
   Export / Import  (password-protected)
   ============================================================ */
async function exportData() {
  const pw = prompt('Enter your master password to export:');
  if (!pw) return;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const salt   = unb64(stored.salt);
    const testKey = await deriveKey(pw, salt);
    await decrypt({ iv: stored.iv, ct: stored.ct }, testKey); // verify
    const exportSalt = crypto.getRandomValues(new Uint8Array(16));
    const exportKey  = await deriveKey(pw, exportSalt);
    const blob = await encrypt({ data: _data, exportedAt: new Date().toISOString() }, exportKey);
    const payload = JSON.stringify({ app:'smartapp', module:'careerdetails', v:1, salt: b64(exportSalt), ...blob });
    const url = URL.createObjectURL(new Blob([payload], { type:'application/json' }));
    const a   = document.createElement('a');
    a.href = url; a.download = `careerdetails-export-${ts()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
    toast('✓ Exported (encrypted)');
  } catch(e) { toast('Export failed — wrong password or error: '+e.message,'err'); }
}

async function importData(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value='';
  if (!file) return;
  const pw = prompt('Enter the password used when this file was exported:');
  if (!pw) return;
  try {
    const text = await file.text();
    const obj  = JSON.parse(text);
    if (obj.module !== 'careerdetails') return toast('Not a Career Details export file','err');
    const salt = unb64(obj.salt);
    const key  = await deriveKey(pw, salt);
    const dec  = await decrypt({ iv: obj.iv, ct: obj.ct }, key);
    const incoming = dec.data;
    if (!confirm(`Import will MERGE with current data. Exported at: ${dec.exportedAt||'unknown'}. Continue?`)) return;
    // Merge: incoming entries not already present by ID
    ['work','edu','certs','photos','resume','companies'].forEach(s => {
      const cur = _data[s]||[];
      const inc = incoming[s]||[];
      const ids = new Set(cur.map(x=>x.id));
      inc.forEach(x => { if(!ids.has(x.id)) cur.push(x); });
      _data[s] = cur;
    });
    await save();
    toast('✓ Import complete');
    renderMain();
  } catch(e) { toast('Import failed — wrong password or corrupt file','err'); }
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

function downloadFile(dataUrl, name, mime) {
  const a=document.createElement('a');
  a.href=dataUrl; a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>a.remove(),500);
}
