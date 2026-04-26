/* ============================================================
   core/router.js
   The whole modular system lives here.
   To add a module: import it, add it to MODULES. Done.
   To remove: delete the line. Done.
   ============================================================ */

import ledger     from '../modules/ledger.js';
import documents  from '../modules/documents.js';
import sweep      from '../modules/sweep.js';
import vault      from '../modules/vault.js';
import { VERSION, BUILD } from './version.js';

// ↓↓↓ THE REGISTRY — edit this to add/remove icons ↓↓↓
const MODULES = [ledger, documents, sweep, vault];
// ↑↑↑ that's it — the launcher reads from here ↑↑↑

let activeModule = null;

export function startApp() {
  startClock();
  injectVersion();
  showLauncher();
}

function injectVersion() {
  const top = document.getElementById('topbar-id');
  if (top) top.innerHTML = `SMARTAPP <span class="topbar__ver">v${VERSION}</span>`;
  const bot = document.querySelector('.ruler__label');
  if (bot) bot.textContent = `v${VERSION} · ${BUILD}`;
}

/* ---------- Launcher ---------- */
function showLauncher() {
  cleanupActiveModule();
  setTopbarTitle('HOME');

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="launcher">
      <div class="launcher__hello">
        <h1>Hello,<br><em>let's work.</em></h1>
        <p>${MODULES.length} module${MODULES.length === 1 ? '' : 's'} · tap to open</p>
      </div>

      <div class="launcher__sectionlabel">Modules</div>

      <div class="tilegrid" id="tilegrid"></div>
    </div>
  `;

  const grid = view.querySelector('#tilegrid');
  MODULES.forEach((mod, i) => {
    grid.appendChild(buildTile(mod, i));
  });
}

function buildTile(mod, index) {
  const btn = document.createElement('button');
  btn.className = 'tile';
  const status = mod.status || 'ready';
  const statusLabel = status === 'ready' ? 'Ready' : 'Soon';
  btn.innerHTML = `
    <span class="tile__br1"></span><span class="tile__br2"></span>
    <div class="tile__index">${String(index + 1).padStart(2, '0')}</div>
    <div class="tile__name">${escape(mod.name)}</div>
    <div class="tile__tag">${escape(mod.tagline || '')}</div>
    <div class="tile__row">
      <span class="tile__status is-${status === 'ready' ? 'ready' : 'soon'}">
        <span class="pip"></span>${statusLabel}
      </span>
      <span class="tile__chev">→</span>
    </div>
  `;
  btn.addEventListener('click', () => openModule(mod));
  return btn;
}

/* ---------- Module open/close ---------- */
async function openModule(mod) {
  cleanupActiveModule();
  setTopbarTitle(mod.name.toUpperCase());

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="screen">
      <button class="screen__back" id="back">← HOME</button>
      <div class="screen__title">${escape(mod.name)}</div>
      <div class="screen__subtitle">${escape(mod.tagline || '')}</div>
      <div id="module-root"></div>
    </div>
  `;

  view.querySelector('#back').addEventListener('click', showLauncher);

  const root = view.querySelector('#module-root');
  activeModule = mod;
  try {
    await mod.render(root);
  } catch (err) {
    console.error(`[${mod.id}] render failed:`, err);
    root.innerHTML = `<div class="placeholder">
      <div class="placeholder__icon">!</div>
      <div>Module failed to load.</div>
      <div style="margin-top:6px;font-size:10px;">${escape(err.message)}</div>
    </div>`;
  }
}

function cleanupActiveModule() {
  if (activeModule && typeof activeModule.cleanup === 'function') {
    try { activeModule.cleanup(); } catch (e) { console.warn(e); }
  }
  activeModule = null;
}

/* ---------- Helpers ---------- */
function setTopbarTitle(text) {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = text;
}

function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    el.textContent =
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  };
  tick();
  setInterval(tick, 30 * 1000);
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
