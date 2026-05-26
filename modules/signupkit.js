/* ============================================================
   modules/signupkit.js  —  Sign-Up Kit
   Tabs: URLS (first) | ACCOUNTS
   Features: Add / Edit / Delete URLs, Edge Collections import,
             Export / Import JSON (URLs separate), Favicons,
             Category grouping, Search, Open in new tab
   ============================================================ */

import { toast } from '../core/ui.js';

const UK = 'smartapp_signup_urls_v1';   /* localStorage key for URLs   */
const AK = 'smartapp_signupkit_acc_v1'; /* localStorage key for accounts */

let _root   = null;
let _tab    = 'urls';   /* 'urls' | 'accounts' */
let _filter = '';
let _adding = false;
let _editId = null;

/* ── Data helpers ─────────────────────────────────────────── */
function getUrls()     { try { return JSON.parse(localStorage.getItem(UK))  || []; } catch(e){ return []; } }
function getAccounts() { try { return JSON.parse(localStorage.getItem(AK))  || []; } catch(e){ return []; } }
function saveUrls(a)   { try { localStorage.setItem(UK, JSON.stringify(a)); } catch(e){ toast('Storage full','err'); } }
function saveAccounts(a){ try { localStorage.setItem(AK,JSON.stringify(a)); } catch(e){ toast('Storage full','err'); } }
function uid()         { return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function esc(s)        { return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function getDomain(url){ try{ return new URL(url).hostname; }catch(e){ return ''; } }
function faviconUrl(url){ const d=getDomain(url); return d?`https://www.google.com/s2/favicons?domain=${d}&sz=32`:''; }

/* ── Render ───────────────────────────────────────────────── */
function render() {
  if (!_root) return;
  const urls = getUrls();
  const accs = getAccounts();

  let h = `<style>${CSS}</style>`;

  /* Tab bar — URLS first */
  h += `<div class="sk-tabs">
    <button class="sk-tab${_tab==='urls'?' sk-active':''}" id="sk-t-urls">URLS (${urls.length})</button>
    <button class="sk-tab${_tab==='accounts'?' sk-active':''}" id="sk-t-acc">ACCOUNTS (${accs.length})</button>
  </div>`;

  h += _tab === 'urls' ? renderUrls(urls) : renderAccounts(accs);

  _root.innerHTML = h;
  bind();
}

/* ── URLS tab ─────────────────────────────────────────────── */
function renderUrls(urls) {
  let h = `<div class="sk-toolbar">
    <button class="sk-btn sk-btn-lime" id="sk-add">+ Add URL</button>
    <input class="sk-search" id="sk-search" placeholder="Search…" value="${esc(_filter)}">
    <div class="sk-xfer">
      <button class="sk-btn" id="sk-exp">⬇ Export</button>
      <button class="sk-btn" id="sk-imp">⬆ Import</button>
    </div>
  </div>`;

  /* Add / Edit form */
  if (_adding) h += renderForm(null);
  if (_editId) {
    const u = urls.find(u=>u.id===_editId);
    if (u) h += renderForm(u);
  }

  /* URL list grouped by category */
  const q = _filter.toLowerCase();
  const filtered = q ? urls.filter(u=>(u.name+u.url+u.category+u.notes).toLowerCase().includes(q)) : urls;

  if (!filtered.length) {
    h += `<div class="sk-empty">${q ? 'No results for "'+esc(_filter)+'"' : 'No URLs saved — click + Add URL or Import'}</div>`;
  } else {
    const cats = {};
    filtered.forEach(u => {
      const c = u.category || 'General';
      (cats[c] = cats[c]||[]).push(u);
    });
    Object.keys(cats).sort().forEach(cat => {
      h += `<div class="sk-cat">${esc(cat)}</div>`;
      cats[cat].forEach(u => { h += renderUrlCard(u); });
    });
  }
  return h;
}

function renderForm(u) {
  const isEdit = !!u;
  return `<div class="sk-form">
    <div class="sk-form-head">${isEdit ? 'Edit URL' : 'Add URL'}</div>
    <input class="sk-inp" id="sk-f-url"  type="url"  placeholder="https://…" value="${esc(u?.url||'')}">
    <input class="sk-inp" id="sk-f-name" type="text" placeholder="Site name (auto-detected if empty)" value="${esc(u?.name||'')}">
    <input class="sk-inp" id="sk-f-cat"  type="text" placeholder="Category (e.g. Training, Tools, Sign-Up)" value="${esc(u?.category||'')}" list="sk-cats">
    <datalist id="sk-cats">
      <option value="Training"><option value="Tools"><option value="Sign-Up">
      <option value="Resources"><option value="Documentation"><option value="General">
    </datalist>
    <input class="sk-inp" id="sk-f-notes" type="text" placeholder="Notes (optional)" value="${esc(u?.notes||'')}">
    <div class="sk-row">
      <button class="sk-btn sk-btn-lime" id="sk-f-save">${isEdit ? 'Save Changes' : 'Save URL'}</button>
      <button class="sk-btn" id="sk-f-cancel">Cancel</button>
    </div>
  </div>`;
}

function renderUrlCard(u) {
  const fav = faviconUrl(u.url);
  return `<div class="sk-card" data-id="${u.id}">
    <div class="sk-card-ico">
      ${fav ? `<img src="${fav}" class="sk-fav" onerror="this.style.display='none'" alt="">` : '🔗'}
    </div>
    <div class="sk-card-body">
      <div class="sk-card-name">${esc(u.name || getDomain(u.url) || 'Untitled')}</div>
      <div class="sk-card-url">${esc(u.url)}</div>
      ${u.notes ? `<div class="sk-card-notes">${esc(u.notes)}</div>` : ''}
    </div>
    <div class="sk-card-acts">
      <button class="sk-btn sk-btn-open" data-open="${esc(u.url)}">Open</button>
      <button class="sk-btn sk-btn-edit" data-edit="${u.id}">Edit</button>
      <button class="sk-btn sk-btn-del"  data-del="${u.id}">✕</button>
    </div>
  </div>`;
}

/* ── ACCOUNTS tab ─────────────────────────────────────────── */
function renderAccounts(accs) {
  let h = `<div class="sk-toolbar">
    <button class="sk-btn sk-btn-lime" id="sk-add-acc">+ Add Account</button>
    <div class="sk-xfer">
      <button class="sk-btn" id="sk-exp-acc">⬇ Export</button>
      <button class="sk-btn" id="sk-imp-acc">⬆ Import</button>
    </div>
  </div>`;

  if (!accs.length) {
    h += `<div class="sk-empty">No accounts saved — click + Add Account</div>`;
  } else {
    accs.forEach(a => {
      h += `<div class="sk-acc-card" data-id="${a.id}">
        <div class="sk-acc-name">${esc(a.service||'Account')}</div>
        <div class="sk-acc-meta">${esc(a.username||'')}${a.email?' · '+esc(a.email):''}</div>
        ${a.notes ? `<div class="sk-card-notes">${esc(a.notes)}</div>` : ''}
        <button class="sk-btn sk-btn-del sk-acc-del" data-del="${a.id}">✕</button>
      </div>`;
    });
  }
  return h;
}

/* ── Bind events ──────────────────────────────────────────── */
function bind() {
  const g = id => _root.querySelector('#'+id);

  /* Tabs */
  const tu=g('sk-t-urls'), ta=g('sk-t-acc');
  if(tu) tu.onclick=()=>{_tab='urls';_adding=false;_editId=null;render();};
  if(ta) ta.onclick=()=>{_tab='accounts';_adding=false;_editId=null;render();};

  if (_tab === 'urls') bindUrls();
  else bindAccounts();
}

function bindUrls() {
  const g = id => _root.querySelector('#'+id);

  /* Search */
  const srch=g('sk-search');
  if(srch) srch.oninput=()=>{_filter=srch.value;render();};

  /* Add button */
  const add=g('sk-add');
  if(add) add.onclick=()=>{_adding=!_adding;_editId=null;render();};

  /* Form */
  const save=g('sk-f-save'),cancel=g('sk-f-cancel');
  if(save) save.onclick=doSaveUrl;
  if(cancel) cancel.onclick=()=>{_adding=false;_editId=null;render();};

  /* Card actions (open / edit / delete) */
  _root.querySelectorAll('[data-open]').forEach(btn=>{
    btn.onclick=()=>window.open(btn.dataset.open,'_blank','noopener');
  });
  _root.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.onclick=()=>{_editId=btn.dataset.edit;_adding=false;render();};
  });
  _root.querySelectorAll('[data-del]').forEach(btn=>{
    if(btn.closest('.sk-card')){
      btn.onclick=()=>{ if(!confirm('Delete this URL?'))return; delUrl(btn.dataset.del); };
    }
  });

  /* Export / Import */
  const exp=g('sk-exp'),imp=g('sk-imp');
  if(exp) exp.onclick=doExportUrls;
  if(imp) imp.onclick=doImportUrls;
}

function bindAccounts() {
  const g = id => _root.querySelector('#'+id);

  const addAcc=g('sk-add-acc');
  if(addAcc) addAcc.onclick=doAddAccount;

  _root.querySelectorAll('.sk-acc-del').forEach(btn=>{
    btn.onclick=()=>{
      if(!confirm('Delete this account?'))return;
      const accs=getAccounts().filter(a=>a.id!==btn.dataset.del);
      saveAccounts(accs);render();toast('Account deleted');
    };
  });

  const expAcc=g('sk-exp-acc'),impAcc=g('sk-imp-acc');
  if(expAcc) expAcc.onclick=doExportAccounts;
  if(impAcc) impAcc.onclick=doImportAccounts;
}

/* ── URL CRUD ─────────────────────────────────────────────── */
function doSaveUrl() {
  const g = id => _root.querySelector('#'+id);
  const rawUrl=(g('sk-f-url')||{}).value.trim();
  if(!rawUrl){toast('URL is required','warn');return;}
  let url=rawUrl;
  if(!/^https?:\/\//i.test(url))url='https://'+url;
  const name=(g('sk-f-name')||{}).value.trim() || getDomain(url);
  const category=(g('sk-f-cat')||{}).value.trim()||'General';
  const notes=(g('sk-f-notes')||{}).value.trim();

  const urls=getUrls();
  if(_editId){
    const idx=urls.findIndex(u=>u.id===_editId);
    if(idx>=0) urls[idx]={...urls[idx],url,name,category,notes,updatedAt:Date.now()};
    _editId=null;
    toast('URL updated');
  } else {
    urls.unshift({id:uid(),url,name,category,notes,createdAt:Date.now()});
    _adding=false;
    toast('URL saved');
  }
  saveUrls(urls);render();
}

function delUrl(id) {
  saveUrls(getUrls().filter(u=>u.id!==id));
  toast('URL deleted');render();
}

/* ── Account add (simple prompt-based) ───────────────────── */
function doAddAccount() {
  const service=prompt('Service name (e.g. CyberArk University):');
  if(!service)return;
  const username=prompt('Username / Login:') || '';
  const email=prompt('Email (optional):') || '';
  const notes=prompt('Notes (optional):') || '';
  const accs=getAccounts();
  accs.unshift({id:uid(),service,username,email,notes,createdAt:Date.now()});
  saveAccounts(accs);render();toast('Account saved');
}

/* ── Export URLs ─────────────────────────────────────────── */
function doExportUrls() {
  const urls=getUrls();
  if(!urls.length){toast('No URLs to export','warn');return;}
  const data={_meta:{app:'SmartApp Sign-Up Kit URLs',exportedAt:new Date().toISOString(),count:urls.length},urls};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='signupkit-urls-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  toast('Exported '+urls.length+' URLs');
}

/* ── Import URLs ─────────────────────────────────────────── */
function doImportUrls() {
  const inp=document.createElement('input');
  inp.type='file';
  inp.accept='.json,.html,application/json,text/html,text/plain';
  inp.onchange=async function(){
    if(!inp.files||!inp.files[0])return;
    const file=inp.files[0];
    const text=await file.text();
    let imported=[];
    if(file.name.endsWith('.html')||text.includes('NETSCAPE-Bookmark')||text.includes('<DL>')){
      imported=parseEdgeBookmarks(text);
    } else if(file.name.endsWith('.json')){
      try{
        const data=JSON.parse(text);
        if(data.urls&&Array.isArray(data.urls)) imported=data.urls;
        else if(Array.isArray(data)) imported=data;
        else { toast('Unrecognised JSON format','err'); return; }
      }catch(e){toast('Invalid JSON file','err');return;}
    } else {
      /* Plain text: one URL per line */
      imported=parsePlainTextUrls(text);
    }
    if(!imported.length){toast('No URLs found in file','warn');return;}
    const existing=getUrls();
    const existingUrls=new Set(existing.map(u=>u.url));
    let added=0;
    const merged=[...existing];
    imported.forEach(u=>{
      const url=u.url||u.href||u;
      if(!url||existingUrls.has(url))return;
      merged.push({id:uid(),url,name:u.name||u.title||getDomain(url),category:u.category||u.folder||'Imported',notes:u.notes||'',createdAt:Date.now()});
      added++;
    });
    saveUrls(merged);render();
    toast('Imported '+added+' new URL'+(added!==1?'s':''));
  };
  inp.click();
}

/* ── Edge Bookmarks HTML parser ──────────────────────────── */
function parseEdgeBookmarks(html) {
  const div=document.createElement('div');
  div.innerHTML=html;
  const results=[];
  /* Edge Collections export — links inside DL/DT */
  div.querySelectorAll('a[href]').forEach(a=>{
    const url=a.href;
    if(!url||url.startsWith('javascript:'))return;
    /* Try to find the parent folder name as category */
    let category='Imported';
    let parent=a.parentElement;
    for(let i=0;i<5;i++){
      if(!parent)break;
      const h3=parent.previousElementSibling;
      if(h3&&(h3.tagName==='H3'||h3.tagName==='H2')){category=h3.textContent.trim();break;}
      parent=parent.parentElement;
    }
    results.push({url,name:a.textContent.trim()||getDomain(url),category});
  });
  return results;
}

function parsePlainTextUrls(text) {
  const results=[];
  text.split('\n').forEach(line=>{
    line=line.trim();
    if(!line||line.startsWith('#'))return;
    if(/^https?:\/\//i.test(line)){
      results.push({url:line,name:getDomain(line)});
    } else if(line.includes('.')){
      results.push({url:'https://'+line,name:getDomain('https://'+line)});
    }
  });
  return results;
}

/* ── Export / Import accounts ─────────────────────────────── */
function doExportAccounts() {
  const accs=getAccounts();
  if(!accs.length){toast('No accounts to export','warn');return;}
  const data={_meta:{app:'SmartApp Sign-Up Kit Accounts',exportedAt:new Date().toISOString()},accounts:accs};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='signupkit-accounts-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  toast('Exported '+accs.length+' accounts');
}

function doImportAccounts() {
  const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
  inp.onchange=async function(){
    if(!inp.files||!inp.files[0])return;
    try{
      const data=JSON.parse(await inp.files[0].text());
      const incoming=data.accounts||data;
      if(!Array.isArray(incoming)){toast('Invalid format','err');return;}
      const existing=getAccounts();
      const existIds=new Set(existing.map(a=>a.id));
      let added=0;const merged=[...existing];
      incoming.forEach(a=>{if(a.id&&!existIds.has(a.id)){merged.push(a);added++;}});
      saveAccounts(merged);render();toast('Imported '+added+' account'+(added!==1?'s':''));
    }catch(e){toast('Import failed: '+e.message,'err');}
  };inp.click();
}

/* ── CSS ──────────────────────────────────────────────────── */
const CSS = `
.sk-tabs{display:flex;gap:6px;margin-bottom:12px;}
.sk-tab{padding:7px 14px;font-size:10px;font-weight:700;letter-spacing:.1em;border:1px solid #2a2a2a;background:transparent;color:#555;cursor:pointer;border-radius:4px;text-transform:uppercase;}
.sk-tab.sk-active{background:#d4ff3a;border-color:#d4ff3a;color:#000;}
.sk-toolbar{display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap;}
.sk-btn{padding:7px 12px;font-size:10px;font-weight:700;letter-spacing:.07em;border:1px solid #2a2a2a;background:transparent;color:#aaa;cursor:pointer;border-radius:4px;white-space:nowrap;}
.sk-btn:hover{border-color:#555;color:#fff;}
.sk-btn-lime{background:#d4ff3a;border-color:#d4ff3a;color:#000;}
.sk-btn-lime:hover{background:#c0e830;}
.sk-btn-open{color:#6a9fff;border-color:#1a2a4a;}
.sk-btn-del{color:#ff6b6b;border-color:#3a1a1a;}
.sk-btn-edit{color:#e8b867;border-color:#3a2a0a;}
.sk-search{flex:1;min-width:120px;padding:7px 10px;font-size:11px;background:#111;border:1px solid #2a2a2a;color:#ccc;border-radius:4px;outline:none;}
.sk-search:focus{border-color:#444;}
.sk-xfer{display:flex;gap:6px;margin-left:auto;}
.sk-form{background:#111;border:1px solid #2a2a2a;border-radius:6px;padding:12px;margin-bottom:10px;}
.sk-form-head{font-size:10px;font-weight:700;color:#d4ff3a;letter-spacing:.1em;margin-bottom:10px;}
.sk-inp{display:block;width:100%;padding:8px 10px;margin-bottom:7px;font-size:12px;background:#0a0a0a;border:1px solid #2a2a2a;color:#ccc;border-radius:4px;outline:none;box-sizing:border-box;}
.sk-inp:focus{border-color:#555;}
.sk-row{display:flex;gap:6px;}
.sk-cat{font-size:9px;font-weight:700;letter-spacing:.12em;color:#444;text-transform:uppercase;margin:12px 0 5px;padding-bottom:3px;border-bottom:1px solid #1a1a1a;}
.sk-card{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;margin-bottom:5px;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:6px;}
.sk-card:hover{border-color:#2a2a2a;}
.sk-card-ico{width:24px;flex-shrink:0;font-size:16px;margin-top:2px;}
.sk-fav{width:16px;height:16px;margin-top:3px;}
.sk-card-body{flex:1;min-width:0;}
.sk-card-name{font-size:12px;font-weight:700;color:#ccc;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sk-card-url{font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sk-card-notes{font-size:10px;color:#777;margin-top:3px;}
.sk-card-acts{display:flex;flex-direction:column;gap:4px;flex-shrink:0;}
.sk-acc-card{position:relative;padding:10px 12px;margin-bottom:6px;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:6px;}
.sk-acc-name{font-size:13px;font-weight:700;color:#ccc;margin-bottom:3px;}
.sk-acc-meta{font-size:11px;color:#555;}
.sk-acc-del{position:absolute;top:8px;right:8px;}
.sk-empty{padding:30px;text-align:center;color:#333;font-size:12px;font-style:italic;}
`;

/* ── Module export ────────────────────────────────────────── */
export default {
  id:      'signupkit',
  name:    'Sign-Up Kit',
  tagline: 'URLs · Accounts · Collections',
  render(root) {
    _root   = root;
    _tab    = 'urls';
    _filter = '';
    _adding = false;
    _editId = null;
    render();
  },
  cleanup() { _root = null; }
};
