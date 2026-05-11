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
import reader     from '../modules/reader.js';
import { VERSION, BUILD } from './version.js';
import { initPersistence, refreshUsage } from './persistence.js';
import {
  getProfilePic, clearProfilePic, saveProfilePicFromFile,
  getDisplayName, setDisplayName,
  getRecent, clearRecent,
  getNameStyle, getNameStyleId, setNameStyleId, NAME_STYLES,
  getBanner, clearBanner, saveBannerFromFile,
  getBannerFit, setBannerFit,
  getBannerPos, setBannerPos,
} from './profile.js';
import { toast } from './ui.js';
import { getTodaysMessage, getMessages, setMessages, bumpShuffle, getSampleDefaults } from './messages.js';
import { getTimeArtSvg, getBandLabel } from './timeart.js';
import { db } from './storage.js';
import {
  downloadJson, readJsonFromFile, triggerDownload, timestampStr,
  wrap, unwrap, askMergeOrReplace, mergeById,
} from './backup.js';

// ↓↓↓ THE REGISTRY — edit this to add/remove icons ↓↓↓
const MODULES = [ledger, documents, reader, sweep, vault];
// ↑↑↑ that's it — the launcher reads from here ↑↑↑

let activeModule = null;

export function startApp() {
  startClock();
  injectVersion();
  paintAvatar();
  bindAvatarUpload();
  trackInstallPrompt();
  bindSettingsButton();
  initPersistence();
  showLauncher();
}

/* ---------- PWA install state ---------- */
let _deferredInstall = null;
let _isInstalled = false;

function trackInstallPrompt() {
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
    if (document.querySelector('#settings-screen')) renderSettings();
  });
}

function bindSettingsButton() {
  const gear = document.getElementById('open-settings');
  if (gear) gear.addEventListener('click', renderSettings);
}

function injectVersion() {
  // Version now lives only in Settings → APP card.
  // (Removed from the bottom ruler in v0.13.2 for a cleaner footer.)
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
    if (initial) {
      initial.style.display = '';
      initial.textContent = (getDisplayName()[0] || 'N').toUpperCase();
    }
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
      <div class="screen__subtitle">app · profile · install · storage</div>

      <div class="set-card">
        <div class="set-card__head">PROFILE</div>
        <div class="set-row">
          <span class="set-row__k">NAME</span>
          <span class="set-row__v">
            <input type="text" id="display-name" class="set-input"
                   value="${escape(getDisplayName())}" maxlength="24"
                   placeholder="Your name">
            <button class="vault-tool-btn" id="save-name">SAVE</button>
          </span>
        </div>
        <div class="set-row">
          <span class="set-row__k">STYLE</span>
          <span class="set-row__v">
            <div class="style-picker" id="style-picker">
              ${NAME_STYLES.map(s => `
                <button class="style-chip ${getNameStyleId() === s.id ? 'is-active' : ''}"
                        data-id="${s.id}" type="button">
                  <span class="style-chip__sample namestyle namestyle--${s.id}">${escape(getDisplayName())}</span>
                  <span class="style-chip__lbl">${escape(s.label)}</span>
                </button>
              `).join('')}
            </div>
          </span>
        </div>
        <div class="set-row">
          <span class="set-row__k">PICTURE</span>
          <span class="set-row__v">
            <button class="vault-tool-btn" id="set-pic">CHANGE</button>
            <button class="vault-tool-btn" id="clear-pic">CLEAR</button>
          </span>
        </div>
        <div class="set-row">
          <span class="set-row__k">RECENT</span>
          <span class="set-row__v">
            <button class="vault-tool-btn" id="clear-recent">CLEAR ACTIVITY</button>
          </span>
        </div>
      </div>

      <div class="set-card">
        <div class="set-card__head">DAILY MESSAGES</div>
        <div class="set-row__note set-row__note--inset">
          One per line. The home screen rotates through these — one per day,
          changes at midnight, or tap ↻ to advance manually.
        </div>
        <div style="padding: 0 14px 12px;">
          <textarea id="msg-list" class="set-input" rows="6"
                    style="width:100%;min-height:120px;line-height:1.6;"
                    placeholder="One message per line"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button class="vault-tool-btn" id="save-msgs">SAVE MESSAGES</button>
            <button class="vault-tool-btn" id="sample-msgs">USE SAMPLES</button>
            <button class="vault-tool-btn" id="clear-msgs">CLEAR ALL</button>
          </div>
        </div>
      </div>

      <div class="set-card">
        <div class="set-card__head">HOME BANNER</div>
        <div class="set-row">
          <span class="set-row__k">SOURCE</span>
          <span class="set-row__v" id="banner-status"></span>
        </div>
        <div class="set-row">
          <span class="set-row__k">IMAGE</span>
          <span class="set-row__v">
            <button class="vault-tool-btn" id="upload-banner">UPLOAD</button>
            <button class="vault-tool-btn" id="clear-banner">USE TIME-ART</button>
            <input type="file" id="banner-input" accept="image/*" hidden>
          </span>
        </div>
        <div class="set-row">
          <span class="set-row__k">FIT</span>
          <span class="set-row__v">
            <button class="vault-tool-btn ${getBannerFit() === 'fill' ? 'is-active' : ''}" data-fit="fill" id="fit-fill">FILL</button>
            <button class="vault-tool-btn ${getBannerFit() === 'contain' ? 'is-active' : ''}" data-fit="contain" id="fit-contain">CONTAIN</button>
          </span>
        </div>
        <div class="set-row">
          <span class="set-row__k">POSITION</span>
          <span class="set-row__v">
            <div class="pos-picker">
              ${['top','center','bottom','left','right'].map(p => `
                <button class="pos-btn ${getBannerPos() === p ? 'is-active' : ''}" data-pos="${p}" type="button">
                  ${p.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </span>
        </div>
        <div class="set-row__note set-row__note--inset">
          <strong style="color:var(--lime);">FILL</strong> crops to cover the panel.
          <strong style="color:var(--lime);">CONTAIN</strong> shows the whole image (may letterbox).
          <strong style="color:var(--lime);">POSITION</strong> picks which part of the image stays visible when cropped.
          Image compressed to ~800px JPEG on upload.
        </div>
      </div>

      <div class="set-card">
        <div class="set-card__head">BACKUP &amp; RESTORE</div>
        <div class="set-row">
          <span class="set-row__k">SETTINGS</span>
          <span class="set-row__v">
            <button class="vault-tool-btn" id="export-settings">⬇ EXPORT</button>
            <button class="vault-tool-btn" id="import-settings">⬆ IMPORT</button>
            <input type="file" id="import-settings-file" accept=".json,application/json" hidden>
          </span>
        </div>
        <div class="set-row">
          <span class="set-row__k">EVERYTHING</span>
          <span class="set-row__v">
            <button class="vault-tool-btn" id="export-all">⬇ EXPORT ALL (.zip)</button>
          </span>
        </div>
        <div class="set-row__note set-row__note--inset">
          <strong style="color:var(--lime);">SETTINGS</strong> = name, banner, daily messages, style preset.<br>
          <strong style="color:var(--lime);">EXPORT ALL</strong> bundles every module's data (except Vault — export Vault separately so the master password stays only in your head). One zip per backup. Save regularly.
        </div>
      </div>

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
    </div>
  `;

  view.querySelector('#back').addEventListener('click', showLauncher);

  // Display name save
  view.querySelector('#save-name').onclick = () => {
    const name = view.querySelector('#display-name').value;
    setDisplayName(name);
    paintAvatar();
    toast('✓ Name saved');
    renderSettings();   // refresh chip samples with new name
  };
  view.querySelector('#display-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') view.querySelector('#save-name').click();
  });

  // Style picker
  view.querySelectorAll('.style-chip').forEach(btn => {
    btn.onclick = () => {
      setNameStyleId(btn.dataset.id);
      view.querySelectorAll('.style-chip').forEach(b =>
        b.classList.toggle('is-active', b === btn));
      toast('✓ Style applied');
    };
  });

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
      <div class="set-instr">
        <div class="set-instr__head">INSTALL MANUALLY</div>
        <ol class="set-instr__steps">
          <li>Tap the <strong>⋮</strong> menu (top right of Chrome).</li>
          <li>Look for <strong>"Install app"</strong> — tap it.</li>
          <li>Or if not shown: <strong>"Add to Home screen"</strong>.</li>
          <li>Confirm in the popup.</li>
        </ol>
        <div class="set-instr__note">
          Auto-prompt requires Chrome's engagement signal — visit a few times
          across separate sessions and it will appear here as a button.
        </div>
        <button class="vault-tool-btn set-instr__check" id="check-install">↻ CHECK AGAIN</button>
      </div>
    `;
    installEl.querySelector('#check-install').onclick = () => {
      if (window.matchMedia('(display-mode: standalone)').matches) _isInstalled = true;
      renderSettings();
      toast(_isInstalled ? '✓ Installed' : 'Still not installed', _isInstalled ? 'ok' : 'warn');
    };
  }

  // Storage card — enhanced diagnostic
  const storageEl = view.querySelector('#storage-status');
  const status = await refreshUsage();
  const diag = diagnoseStorage(status);
  storageEl.innerHTML = `
    <div class="set-row">
      <span class="set-row__k">BROWSER</span>
      <span class="set-row__v">${diag.browser}</span>
    </div>
    <div class="set-row">
      <span class="set-row__k">MODE</span>
      <span class="set-row__v">${diag.modeLabel}</span>
    </div>
    <div class="set-row">
      <span class="set-row__k">USED</span>
      <span class="set-row__v">${(status.usage / (1024 * 1024)).toFixed(1)} MB / ${(status.quota / (1024 * 1024)).toFixed(0)} MB</span>
    </div>
    <div class="set-row">
      <span class="set-row__k">PWA</span>
      <span class="set-row__v">${diag.pwaLabel}</span>
    </div>
    <div class="set-row__note set-row__note--inset">
      ${diag.advice}
    </div>
    ${diag.showRetry ? `
      <div style="padding: 0 14px 12px;">
        <button class="vault-tool-btn" id="retry-persist">↻ REQUEST PERSISTENT AGAIN</button>
      </div>
    ` : ''}
  `;

  if (diag.showRetry) {
    view.querySelector('#retry-persist').onclick = async () => {
      try {
        if (navigator.storage && navigator.storage.persist) {
          const granted = await navigator.storage.persist();
          toast(granted ? '✓ Persistent granted' : 'Browser denied persistent mode', granted ? 'ok' : 'warn');
          renderSettings();
        } else {
          toast('Storage API not supported', 'err');
        }
      } catch (err) {
        toast('Request failed: ' + err.message, 'err');
      }
    };
  }

  // Profile actions
  view.querySelector('#set-pic').onclick = () =>
    document.getElementById('avatar-input').click();
  view.querySelector('#clear-pic').onclick = () => {
    if (!confirm('Remove profile picture?')) return;
    clearProfilePic();
    paintAvatar();
    toast('✓ Picture cleared');
  };
  view.querySelector('#clear-recent').onclick = () => {
    if (!confirm('Clear recent activity list?')) return;
    clearRecent();
    toast('✓ Activity cleared');
  };

  // Messages
  const msgList = view.querySelector('#msg-list');
  msgList.value = getMessages().join('\n');
  view.querySelector('#save-msgs').onclick = () => {
    const lines = msgList.value.split('\n');
    setMessages(lines);
    toast(`✓ ${getMessages().length} message${getMessages().length === 1 ? '' : 's'} saved`);
  };
  view.querySelector('#sample-msgs').onclick = () => {
    msgList.value = getSampleDefaults().join('\n');
    toast('Samples loaded — tap SAVE to keep them');
  };
  view.querySelector('#clear-msgs').onclick = () => {
    if (!confirm('Clear all daily messages?')) return;
    setMessages([]);
    msgList.value = '';
    toast('✓ Messages cleared');
  };

  // Banner
  const bannerStatusEl = view.querySelector('#banner-status');
  const refreshBannerStatus = () => {
    bannerStatusEl.innerHTML = getBanner()
      ? '<span style="color:var(--lime);">Your image</span>'
      : '<span style="color:var(--ink-dim);">Time-of-day art</span>';
  };
  refreshBannerStatus();
  const bannerInput = view.querySelector('#banner-input');
  view.querySelector('#upload-banner').onclick = () => bannerInput.click();
  bannerInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      await saveBannerFromFile(file);
      refreshBannerStatus();
      toast('✓ Banner saved');
    } catch (err) {
      toast('Banner failed: ' + err.message, 'err');
    }
  });
  view.querySelector('#clear-banner').onclick = () => {
    if (!getBanner()) {
      toast('Already using time-of-day art', 'warn');
      return;
    }
    clearBanner();
    refreshBannerStatus();
    toast('✓ Switched to time-of-day art');
  };

  // Fit mode
  view.querySelectorAll('[data-fit]').forEach(btn => {
    btn.onclick = () => {
      setBannerFit(btn.dataset.fit);
      view.querySelectorAll('[data-fit]').forEach(b =>
        b.classList.toggle('is-active', b === btn));
      toast(`✓ Fit mode: ${btn.dataset.fit.toUpperCase()}`);
    };
  });

  // Position picker
  view.querySelectorAll('[data-pos]').forEach(btn => {
    btn.onclick = () => {
      setBannerPos(btn.dataset.pos);
      view.querySelectorAll('[data-pos]').forEach(b =>
        b.classList.toggle('is-active', b === btn));
      toast(`✓ Position: ${btn.dataset.pos.toUpperCase()}`);
    };
  });

  // Backup & Restore — Settings export/import
  view.querySelector('#export-settings').onclick = exportSettings;
  view.querySelector('#import-settings').onclick = () =>
    view.querySelector('#import-settings-file').click();
  view.querySelector('#import-settings-file').onchange = handleImportSettings;
  view.querySelector('#export-all').onclick = exportEverything;
}

/* ---------- Settings export / import ---------- */
function exportSettings() {
  try {
    const payload = {
      displayName: getDisplayName(),
      nameStyleId: getNameStyleId(),
      banner: getBanner(),
      bannerFit: getBannerFit(),
      bannerPos: getBannerPos(),
      profilePic: getProfilePic(),
      messages: getMessages(),
    };
    downloadJson(`settings-${timestampStr()}.json`, wrap('settings', payload));
    toast('✓ Settings exported');
  } catch (err) {
    toast('Export failed: ' + err.message, 'err');
  }
}

async function handleImportSettings(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const obj = await readJsonFromFile(file);
    const payload = unwrap(obj, 'settings');
    if (!confirm('Replace current settings with values from this backup?')) return;
    if (typeof payload.displayName === 'string') setDisplayName(payload.displayName);
    if (typeof payload.nameStyleId === 'string') setNameStyleId(payload.nameStyleId);
    if (typeof payload.bannerFit === 'string') setBannerFit(payload.bannerFit);
    if (typeof payload.bannerPos === 'string') setBannerPos(payload.bannerPos);
    if (typeof payload.banner === 'string' && payload.banner.startsWith('data:image')) {
      try { localStorage.setItem('smartapp_banner_v1', payload.banner); } catch {}
    }
    if (typeof payload.profilePic === 'string' && payload.profilePic.startsWith('data:image')) {
      try { localStorage.setItem('smartapp_profile_pic_v1', payload.profilePic); } catch {}
    }
    if (Array.isArray(payload.messages)) setMessages(payload.messages);
    paintAvatar();
    renderSettings();
    toast('✓ Settings imported');
  } catch (err) {
    toast('Import failed: ' + err.message, 'err');
  }
}

/* ---------- Export Everything ---------- */
async function exportEverything() {
  try {
    toast('Bundling backup…');

    // Pull current data from each store directly (the modules cache it but we
    // can't assume any module is rendered right now).
    const [accounts, urls, notes, documents] = await Promise.all([
      db.getAll('signupkit'),
      db.getAll('signup_urls'),
      db.getAll('reader_notes'),
      db.getAll('documents'),
    ]);

    // Documents may contain Blob objects that JSON.stringify can't serialize.
    // Strip the blobs — metadata only — so the zip stays small and JSON-safe.
    const documentsMeta = documents.map(d => {
      const { blob, ...rest } = d;
      return { ...rest, _blobOmitted: !!blob };
    });

    const settingsPayload = {
      displayName: getDisplayName(),
      nameStyleId: getNameStyleId(),
      banner: getBanner(),
      bannerFit: getBannerFit(),
      bannerPos: getBannerPos(),
      profilePic: getProfilePic(),
      messages: getMessages(),
    };

    // Build files in JSZip-style manually (we have no JSZip dependency, but
    // for our purposes a single JSON file with all parts embedded is simpler
    // and the user can still extract each module).
    const bundle = {
      app: 'smartapp',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      kind: 'full-backup',
      modules: {
        signupkit: wrap('signupkit', { accounts, urls }),
        reader:    wrap('reader',    { notes }),
        documents: wrap('documents', { documents: documentsMeta, note: 'Binary blobs not included — use Document Hub Export for blobs.' }),
        settings:  wrap('settings',  settingsPayload),
      },
    };

    const filename = `smartapp-full-${timestampStr()}.json`;
    downloadJson(filename, bundle);
    toast('✓ Full backup downloaded');
  } catch (err) {
    toast('Backup failed: ' + err.message, 'err');
  }
}

/* ---------- Storage diagnostics ---------- */
function diagnoseStorage(status) {
  const ua = navigator.userAgent || '';
  const isEdge    = /\bEdg\//.test(ua);
  const isChrome  = /\bChrome\//.test(ua) && !isEdge;
  const isFirefox = /\bFirefox\//.test(ua);
  const isSafari  = /\bSafari\//.test(ua) && !/\bChrome\//.test(ua) && !isEdge;
  const isMobile  = /\bMobi|\bAndroid|iPhone/.test(ua);

  let browser = 'Unknown';
  if (isEdge)         browser = `Edge${isMobile ? ' (mobile)' : ' (desktop)'}`;
  else if (isChrome)  browser = `Chrome${isMobile ? ' (mobile)' : ' (desktop)'}`;
  else if (isFirefox) browser = `Firefox${isMobile ? ' (mobile)' : ' (desktop)'}`;
  else if (isSafari)  browser = `Safari${isMobile ? ' (mobile)' : ' (desktop)'}`;

  const persisted = status.persisted;
  let modeLabel;
  if (persisted === true) {
    modeLabel = `<span style="color:var(--lime);">✓ Persistent</span>`;
  } else if (persisted === false) {
    modeLabel = `<span style="color:var(--warn);">⚠ Temporary</span>`;
  } else {
    modeLabel = `<span style="color:var(--ink-dim);">Unknown</span>`;
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;
  const pwaLabel = isStandalone
    ? `<span style="color:var(--lime);">✓ Installed (standalone)</span>`
    : `<span style="color:var(--ink-dim);">Browser tab</span>`;

  let advice;
  if (persisted === true) {
    advice = `<strong style="color:var(--lime);">Healthy.</strong> Browser cache clearing will not wipe your data. "Clear all site data" still will — keep export backups.`;
  } else if (persisted === false && isEdge && !isStandalone) {
    advice = `<strong style="color:var(--warn);">⚠ This explains the desktop wipes.</strong> Edge runs in <em>Temporary</em> mode until you install the PWA. Steps to fix: (1) Click the install icon in Edge's address bar (looks like a screen with a down arrow), OR Settings menu → Apps → Install this site as an app. (2) Once installed, open SmartApp from your Start menu — not as a browser tab. (3) Return here and tap RETRY below — should flip to <strong>Persistent</strong>.`;
  } else if (persisted === false && !isStandalone) {
    advice = `<strong style="color:var(--warn);">⚠ Storage may be evicted</strong> if disk is low or you don't visit for ~30 days. Install the PWA to upgrade to Persistent — most browsers grant it automatically after install.`;
  } else if (persisted === false && isStandalone) {
    advice = `Installed but the browser denied persistent mode. Tap RETRY below. If it still denies, your local data is still functional — just keep regular exports.`;
  } else {
    advice = `Cannot determine persistence mode on this browser.`;
  }

  const showRetry = (persisted !== true);

  return { browser, modeLabel, pwaLabel, advice, showRetry };
}

/* ---------- Launcher ---------- */
function showLauncher() {
  cleanupActiveModule();
  setTopbarTitle('HOME');

  const name = getDisplayName();
  const greeting = greetingFor(new Date());
  const style = getNameStyle();

  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="launcher">
      <div class="launcher__top">
        <div class="launcher__greeting">
          <h1>${escape(greeting)}<br><em class="namestyle namestyle--${style.id}">${escape(name)}.</em></h1>
          <p class="launcher__date">${escape(formatDateLong(new Date()))}</p>
        </div>
        <div class="launcher__art ${getBanner() ? 'launcher__art--photo' : ''}" id="time-art" aria-hidden="true">
          ${getBanner()
            ? `<img class="launcher__art-img launcher__art-img--${getBannerFit()} launcher__art-img--pos-${getBannerPos()}" src="${getBanner()}" alt="">`
            : `${getTimeArtSvg()}<span class="launcher__art-label">${escape(getBandLabel())}</span>`}
        </div>
      </div>

      <div id="message-banner"></div>

      <div id="launcher-recent"></div>

      <div class="launcher__sectionlabel">Modules</div>
      <div class="tilegrid" id="tilegrid"></div>
    </div>
  `;

  paintMessage(view.querySelector('#message-banner'));
  paintRecent(view.querySelector('#launcher-recent'));

  const grid = view.querySelector('#tilegrid');
  MODULES.forEach((mod, i) => grid.appendChild(buildTile(mod, i)));
}

function paintMessage(container) {
  const m = getTodaysMessage();
  if (!m) {
    // No messages saved — quiet placeholder hint that links to settings
    container.innerHTML = `
      <button class="msg-empty" id="msg-empty">
        <span class="msg-empty__icon">✎</span>
        <span class="msg-empty__text">Add your own daily messages — tap to set up</span>
      </button>
    `;
    container.querySelector('#msg-empty').onclick = renderSettings;
    return;
  }
  container.innerHTML = `
    <div class="msg-card">
      <span class="msg-card__br1"></span><span class="msg-card__br2"></span>
      <div class="msg-card__head">
        <span class="msg-card__label">MESSAGE · ${m.idx + 1}/${m.total}</span>
        <button class="msg-card__btn" id="msg-shuffle" title="Next message" type="button">↻</button>
      </div>
      <div class="msg-card__text">${escape(m.text)}</div>
    </div>
  `;
  container.querySelector('#msg-shuffle').onclick = () => { bumpShuffle(); paintMessage(container); };
}

function paintRecent(container) {
  const items = getRecent();
  if (items.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="launcher__sectionlabel">Recent</div>
    <div class="recent-strip" id="recent-strip"></div>
  `;
  const strip = container.querySelector('#recent-strip');
  items.forEach((it) => {
    const mod = MODULES.find((m) => m.id === it.moduleId);
    if (!mod) return;
    const chip = document.createElement('button');
    chip.className = 'recent-chip';
    chip.innerHTML = `
      <span class="recent-chip__mod">${escape(mod.name)}</span>
      <span class="recent-chip__lbl">${escape(it.label || '—')}</span>
      <span class="recent-chip__ts">${relativeTime(it.ts)}</span>
    `;
    chip.onclick = () => openModule(mod);
    strip.appendChild(chip);
  });
}

function greetingFor(date) {
  const h = date.getHours();
  if (h < 5)  return 'Good night,';
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  if (h < 21) return 'Good evening,';
  return 'Good night,';
}

function formatDateLong(date) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[date.getDay()]} · ${date.getDate()} ${months[date.getMonth()]}`;
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
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
