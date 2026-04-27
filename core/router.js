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
import { initPersistence, refreshUsage } from './persistence.js';
import { getProfilePic, clearProfilePic, saveProfilePicFromFile } from './profile.js';
import { toast } from './ui.js';

// ↓↓↓ THE REGISTRY — edit this to add/remove icons ↓↓↓
const MODULES = [ledger, documents, sweep, vault];
// ↑↑↑ that's it — the launcher reads from here ↑↑↑

let activeModule = null;

export function startApp() {
  startClock();
  injectVersion();
  paintAvatar();
  bindAvatarUpload();
  trackInstallPrompt();
  bindSettingsButton();
  initPersistence();   // fire-and-forget — registers SW + asks for persistent storage
  showLauncher();
}

/* ---------- PWA install state (event captured for settings screen) ---------- */
let _deferredInstall = null;
let _isInstalled = false;

function trackInstallPrompt() {
  // Detect already-installed standalone mode
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    _isInstalled = true;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstall = e;
  });

  window.addEventListener('appinstalled', () => {
    _isInstalled = true;
    _deferredInstall = null;
    toast('✓ App installed');
    // Refresh settings if open
    if (document.querySelector('#settings-screen')) renderSettings();
  });
}

function bindSettingsButton() {
  const gear = document.getElementById('open-settings');
  if (gear) gear.addEventListener('click', renderSettings);
}

function injectVersion() {
  const top = document.getElementById('topbar-id');
  if (top) top.innerHTML = `SMARTAPP <span class="topbar__ver">v${VERSION}</span>`;
  const bot = document.querySelector('.ruler__label');
  if (bot) bot.textContent = `v${VERSION} · ${BUILD}`;
}

/* ---------- Avatar ---------- */
function paintAvatar() {
  const btn = document.getElementById('avatar');
  const initial = document.getElementById('avatar-initial');
  if (!btn) return;
  const pic = getProfilePic();
  if (pic) {
    btn.style.backgroundImage = `url(${pic})`;
    btn.classList.add('avatar--has-pic');
    if (initial) initial.style.display = 'none';
  } else {
    btn.style.backgroundImage = '';
    btn.classList.remove('avatar--has-pic');
    if (initial) initial.style.display = '';
  }
}
function bindAvatarUpload() {
  const btn = document.getElementById('avatar');
  const input = document.getElementById('avatar-input');
  if (!btn || !input) return;
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      await saveProfilePicFromFile(file);
      paintAvatar();
      toast('✓ Profile picture saved');
    } catch (err) {
      toast('Could not save picture: ' + err.message, 'err');
    }
  });
}

/* ---------- Settings screen ---------- */
async function renderSettings() {
  cleanupActiveModule();
  setTopbarTitle('SETTINGS');

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="screen" id="settings-screen">
      <button class="screen__back" id="back">← HOME</button>
      <div class="screen__title">Settings</div>
      <div class="screen__subtitle">app · install · storage</div>

      <div class="set-card">
        <div class="set-card__head">APP</div>
        <div class="set-row">
          <span class="set-row__k">VERSION</span>
          <span class="set-row__v">v${VERSION} · ${BUILD}</span>
        </div>
        <div class="set-row">
          <span class="set-row__k">AUTHOR</span>
          <span class="set-row__v"><em style="font-family:var(--serif);color:var(--lime);">by Nik</em></span>
        </div>
      </div>

      <div class="set-card">
        <div class="set-card__head">INSTALL</div>
        <div id="install-status"></div>
      </div>

      <div class="set-card">
        <div class="set-card__head">STORAGE</div>
        <div id="storage-status"></div>
      </div>

      <div class="set-card">
        <div class="set-card__head">PROFILE</div>
        <div class="set-row">
          <span class="set-row__k">PICTURE</span>
          <span class="set-row__v">
            <button class="vault-tool-btn" id="set-pic">CHANGE</button>
            <button class="vault-tool-btn" id="clear-pic">CLEAR</button>
          </span>
        </div>
      </div>
    </div>
  `;

  view.querySelector('#back').addEventListener('click', showLauncher);

  // Install card
  const installEl = view.querySelector('#install-status');
  if (_isInstalled) {
    installEl.innerHTML = `
      <div class="set-row">
        <span class="set-row__k">STATUS</span>
        <span class="set-row__v" style="color:var(--lime);">✓ App Installed</span>
      </div>
      <div class="set-row__note">Running in standalone mode. Data is protected from routine cache clearing.</div>
    `;
  } else if (_deferredInstall) {
    installEl.innerHTML = `
      <div class="set-row">
        <span class="set-row__k">STATUS</span>
        <span class="set-row__v" style="color:var(--warn);">Not installed</span>
      </div>
      <button class="btn btn--primary set-install" id="install-now">📱 INSTALL APP</button>
      <div class="set-row__note">Adds SmartApp to your home screen as a standalone app.</div>
    `;
    installEl.querySelector('#install-now').onclick = async () => {
      _deferredInstall.prompt();
      const choice = await _deferredInstall.userChoice;
      if (choice.outcome === 'accepted') toast('✓ Installing…');
      _deferredInstall = null;
      renderSettings();
    };
  } else {
    installEl.innerHTML = `
      <div class="set-row">
        <span class="set-row__k">STATUS</span>
        <span class="set-row__v" style="color:var(--ink-dim);">Not installed</span>
      </div>
      <div class="set-row__note">
        Browser hasn't offered install yet. Use the browser menu →
        <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        Engagement (visiting a few times) often unlocks the prompt.
      </div>
    `;
  }

  // Storage card
  const storageEl = view.querySelector('#storage-status');
  const status = await refreshUsage();
  const persistedLabel = status.persisted === true
    ? `<span style="color:var(--lime);">✓ Persistent</span>`
    : status.persisted === false
      ? `<span style="color:var(--warn);">Temporary</span>`
      : `<span style="color:var(--ink-dim);">Unknown</span>`;
  const usedMB  = (status.usage / (1024 * 1024)).toFixed(1);
  const quotaMB = (status.quota / (1024 * 1024)).toFixed(0);
  storageEl.innerHTML = `
    <div class="set-row">
      <span class="set-row__k">MODE</span>
      <span class="set-row__v">${persistedLabel}</span>
    </div>
    <div class="set-row">
      <span class="set-row__k">USED</span>
      <span class="set-row__v">${usedMB} MB / ${quotaMB} MB</span>
    </div>
    <div class="set-row__note">
      ${status.persisted === true
        ? 'Browser cache clearing will not wipe your data. "Clear all site data" still will — keep export backups.'
        : 'Storage may be evicted under pressure. Use Export Backup in Vault and Document Hub for safety.'}
    </div>
  `;

  // Profile pic actions
  view.querySelector('#set-pic').onclick = () =>
    document.getElementById('avatar-input').click();
  view.querySelector('#clear-pic').onclick = () => {
    if (!confirm('Remove profile picture?')) return;
    clearProfilePic();
    paintAvatar();
    toast('✓ Picture cleared');
  };
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
