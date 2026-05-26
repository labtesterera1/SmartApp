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
import capture    from '../modules/capture.js';
import signupkit  from '../modules/signupkit.js';
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
  markBackupNow, getDaysSinceBackup, shouldShowBackupReminder, dismissBackupReminder,
  blobToBase64, base64ToBlob,
  askLightOrFull, classifySmartAppFile, compareVersions,
  dedupByContent, SIG,
} from './backup.js';
import * as speech from './speech.js';

// ↓↓↓ THE REGISTRY — edit this to add/remove icons ↓↓↓
const MODULES = [signupkit, ledger, documents, reader, sweep, vault, capture];
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
  paintHeartbeat();
  showLauncher();
  // Defer the backup reminder so initial render isn't blocked
  setTimeout(maybeShowBackupReminder, 1500);
}

/* ---------- Heartbeat dot ----------
   Painted in the topbar. Lime = persistent ✓, orange = temporary, dim = unknown.
   Tap → opens Settings (so user can see the full diagnostic). */
async function paintHeartbeat() {
  const btn = document.getElementById('heartbeat');
  if (!btn) return;
  let cls = 'is-unknown', label = 'Storage status';
  try {
    const status = await refreshUsage();
    if (status.persisted === true) {
      cls = 'is-ok'; label = 'Storage: Persistent ✓';
    } else if (status.persisted === false) {
      cls = 'is-warn'; label = 'Storage: Temporary — tap for details';
    }
  } catch {}
  btn.className = `heartbeat ${cls}`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.onclick = () => renderSettings();
}

/* ---------- Backup reminder ----------
   Shows a non-blocking toast on app open if it's been ≥14 days since the
   last backup. Dismissed reminders don't re-appear for 24 hours. */
function maybeShowBackupReminder() {
  if (!shouldShowBackupReminder()) return;
  const days = getDaysSinceBackup();
  const msg = days === null
    ? 'No backup yet — visit Settings → BACKUP'
    : `Last backup ${days} days ago — back up soon`;
  showReminderToast(msg);
}

function showReminderToast(msg) {
  // A simple sticky toast with two actions: BACKUP NOW / LATER
  const existing = document.getElementById('reminder-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'reminder-toast';
  t.className = 'reminder-toast';
  t.innerHTML = `
    <span class="reminder-toast__icon">⚠</span>
    <span class="reminder-toast__msg"></span>
    <button class="reminder-toast__act" data-act="open">BACKUP</button>
    <button class="reminder-toast__act reminder-toast__act--dim" data-act="later">LATER</button>
  `;
  t.querySelector('.reminder-toast__msg').textContent = msg;
  t.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'open') {
      dismissBackupReminder();
      t.remove();
      renderSettings();
    } else {
      dismissBackupReminder();
      t.remove();
    }
  });
  document.body.appendChild(t);
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
        <div class="set-card__head">READER</div>
        <div class="set-row">
          <span class="set-row__k">DEFAULT VOICE</span>
          <span class="set-row__v" id="reader-voice-cell">…</span>
        </div>
        <div class="set-row__note set-row__note--inset">
          Used when reading notes aloud. Hindi (Devanagari) text auto-picks a Hindi voice if installed on your device. Available voices come from your operating system — installing more system voices adds more options here.
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
            <button class="vault-tool-btn" id="export-all">⬇ EXPORT ALL</button>
            <button class="vault-tool-btn" id="import-all">⬆ IMPORT ALL</button>
            <input type="file" id="import-all-file" accept=".json,application/json" hidden>
          </span>
        </div>
        <div class="set-row">
          <span class="set-row__k">LAST BACKUP</span>
          <span class="set-row__v" id="last-backup-label"></span>
        </div>
        <div class="set-row__note set-row__note--inset">
          <strong style="color:var(--lime);">EXPORT ALL</strong> bundles Sign-Up Kit + Reader + Documents + Settings. Pick LIGHT or FULL when prompted. <strong style="color:var(--warn);">Vault is never included</strong> — use the Vault module's own export.<br>
          <strong style="color:var(--lime);">IMPORT ALL</strong> accepts any SmartApp export file (individual module or full bundle) — auto-detected on read.
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
          paintHeartbeat();
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
  view.querySelector('#import-all').onclick = () =>
    view.querySelector('#import-all-file').click();
  view.querySelector('#import-all-file').onchange = handleImportAll;

  // Paint LAST BACKUP label
  paintLastBackupLabel(view.querySelector('#last-backup-label'));

  // Paint READER voice picker
  paintReaderVoicePicker(view);
}

function paintReaderVoicePicker(view) {
  const cell = view.querySelector('#reader-voice-cell');
  if (!cell) return;
  if (!speech.isSupported()) {
    cell.innerHTML = `<span style="color:var(--ink-dim);">Not supported on this browser</span>`;
    return;
  }
  const render = () => {
    const voices = speech.getVoices();
    if (!voices || voices.length === 0) {
      cell.innerHTML = `<span style="color:var(--ink-dim);">Loading voices…</span>`;
      return;
    }
    const current = speech.getDefaultVoiceName() || '';
    const options = ['<option value="">— auto-pick by language —</option>']
      .concat(voices.map(v => {
        const sel = v.name === current ? ' selected' : '';
        return `<option value="${escAttr(v.name)}"${sel}>${escHtml(v.name)} (${escHtml(v.lang)})</option>`;
      })).join('');
    cell.innerHTML = `<select class="set-select" id="reader-voice">${options}</select>`;
    const sel = cell.querySelector('#reader-voice');
    sel.onchange = () => {
      speech.setDefaultVoiceName(sel.value || null);
      toast(sel.value ? '✓ Voice saved' : '✓ Voice cleared');
    };
  };
  render();
  // Some browsers populate voices async; render again once they arrive
  try {
    window.speechSynthesis.addEventListener('voiceschanged', render, { once: true });
  } catch {}
}

function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;'
  }[c]));
}

function paintLastBackupLabel(el) {
  if (!el) return;
  const days = getDaysSinceBackup();
  if (days === null) {
    el.innerHTML = '<span style="color:var(--warn);">Never</span>';
  } else if (days === 0) {
    el.innerHTML = '<span style="color:var(--lime);">Today</span>';
  } else if (days < 7) {
    el.innerHTML = `<span style="color:var(--lime);">${days}d ago</span>`;
  } else if (days < 14) {
    el.innerHTML = `<span style="color:var(--ink);">${days}d ago</span>`;
  } else {
    el.innerHTML = `<span style="color:var(--warn);">${days}d ago — back up soon</span>`;
  }
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
    markBackupNow();
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

/* ---------- Export Everything (Light or Full) ---------- */
async function exportEverything() {
  try {
    // Get a rough size estimate for the picker prompt
    const docs = await db.getAll('documents');
    let blobBytes = 0;
    for (const d of docs) {
      if (d.blob && typeof d.blob.size === 'number') blobBytes += d.blob.size;
    }
    const sizeStr = blobBytes < 1024 * 1024
      ? `${(blobBytes / 1024).toFixed(0)} KB`
      : `${(blobBytes / (1024 * 1024)).toFixed(1)} MB`;

    const choice = await askLightOrFull(`${docs.length} files, ~${sizeStr}`);
    if (!choice) return;
    const isFull = (choice === 'full');

    toast(isFull ? 'Bundling FULL backup (may take a moment)…' : 'Bundling LIGHT backup…');

    // Allow the UI to paint the toast before heavy work blocks the main thread
    await new Promise(r => setTimeout(r, 30));

    const [accounts, urls, notes] = await Promise.all([
      db.getAll('signupkit'),
      db.getAll('signup_urls'),
      db.getAll('reader_notes'),
    ]);

    // Documents — Light = metadata only; Full = include base64 blobs
    let documentsPayload;
    if (isFull) {
      const items = [];
      for (const d of docs) {
        const { blob, ...rest } = d;
        items.push({
          ...rest,
          data: blob ? await blobToBase64(blob) : null,
        });
      }
      documentsPayload = { documents: items, hasBlobs: true };
    } else {
      const metaItems = docs.map(d => {
        const { blob, ...rest } = d;
        return { ...rest, _blobOmitted: !!blob };
      });
      documentsPayload = { documents: metaItems, hasBlobs: false };
    }

    const settingsPayload = {
      displayName: getDisplayName(),
      nameStyleId: getNameStyleId(),
      banner: getBanner(),
      bannerFit: getBannerFit(),
      bannerPos: getBannerPos(),
      profilePic: getProfilePic(),
      messages: getMessages(),
    };

    const bundle = {
      app: 'smartapp',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      kind: 'full-backup',
      variant: isFull ? 'full' : 'light',
      modules: {
        signupkit: wrap('signupkit', { accounts, urls }),
        reader:    wrap('reader',    { notes }),
        documents: wrap('documents', documentsPayload),
        settings:  wrap('settings',  settingsPayload),
      },
    };

    const tag = isFull ? 'full' : 'light';
    const filename = `smartapp-${tag}-${timestampStr()}.json`;
    downloadJson(filename, bundle);
    markBackupNow();
    toast(`✓ Backup downloaded (${tag.toUpperCase()})`);
  } catch (err) {
    console.error(err);
    toast('Backup failed: ' + err.message, 'err');
  }
}

/* ---------- IMPORT ALL — auto-detect file type ---------- */
async function handleImportAll(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let obj;
  try { obj = await readJsonFromFile(file); }
  catch (err) { return toast('Import failed: ' + err.message, 'err'); }

  // Vault files are explicitly handled here so we can give a clear message,
  // since users might accidentally try to import them via the bulk button.
  const cls = classifySmartAppFile(obj);
  if (cls.kind === 'invalid') {
    return toast('Not a SmartApp file: ' + cls.reason, 'err');
  }
  if (cls.kind === 'vault') {
    return toast('Vault files import from inside the Vault module', 'warn');
  }

  // Version check — warn if file was created by a newer app
  const cmp = compareVersions(obj.version, VERSION);
  if (cmp === 'newer') {
    if (!confirm(`This file was created by SmartApp v${obj.version}. You're running v${VERSION}. Some fields may be ignored. Continue?`)) {
      return;
    }
  }

  if (cls.kind === 'module') {
    return importSingleModule(obj, cls.moduleName);
  }
  if (cls.kind === 'bundle') {
    return importFullBundle(obj);
  }
}

/* ---------- Import: single module (auto-routed by module name) ---------- */
async function importSingleModule(envelope, moduleName) {
  try {
    const payload = unwrap(envelope, moduleName);
    if (moduleName === 'signupkit') {
      const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
      const urls     = Array.isArray(payload.urls) ? payload.urls : [];
      const choice = await askMergeOrReplace('Sign-Up Kit', {
        current: 'current data',
        incoming: `${accounts.length} acc, ${urls.length} URL`,
      });
      if (!choice) return;
      await applySignupKit({ accounts, urls }, choice);
      toast(`✓ Sign-Up Kit imported (${choice})`);
    }
    else if (moduleName === 'reader') {
      const notes = Array.isArray(payload.notes) ? payload.notes : [];
      const choice = await askMergeOrReplace('Reader Notes', {
        current: 'current data',
        incoming: `${notes.length} notes`,
      });
      if (!choice) return;
      await applyReader(notes, choice);
      toast(`✓ Reader imported (${choice})`);
    }
    else if (moduleName === 'documents') {
      const items = Array.isArray(payload.documents) ? payload.documents : [];
      const hasBlobs = !!payload.hasBlobs;
      const choice = await askMergeOrReplace(
        hasBlobs ? 'Documents (with blobs)' : 'Documents (metadata only)',
        { current: 'current data', incoming: `${items.length} files` }
      );
      if (!choice) return;
      await applyDocuments(items, choice, hasBlobs);
      toast(`✓ Documents imported (${choice})`);
    }
    else if (moduleName === 'settings') {
      if (!confirm('Replace current settings with values from this backup?')) return;
      applySettings(payload);
      paintAvatar();
      renderSettings();
      toast('✓ Settings imported');
    }
    else {
      toast(`Unknown module: ${moduleName}`, 'err');
    }
  } catch (err) {
    toast('Import failed: ' + err.message, 'err');
  }
}

/* ---------- Import: full bundle (one prompt, applies to all) ---------- */
async function importFullBundle(bundle) {
  try {
    const mods = bundle.modules || {};
    const has = {
      signupkit: !!mods.signupkit,
      reader:    !!mods.reader,
      documents: !!mods.documents,
      settings:  !!mods.settings,
    };
    const variant = bundle.variant || (mods.documents?.payload?.hasBlobs ? 'full' : 'light');
    const summary = Object.entries(has)
      .filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(', ');

    const choice = await askMergeOrReplace(
      `Full Bundle (${variant.toUpperCase()})`,
      {
        current: 'current data',
        incoming: summary || 'empty bundle',
      }
    );
    if (!choice) return;

    if (has.signupkit) {
      const p = mods.signupkit.payload || {};
      await applySignupKit({
        accounts: p.accounts || [],
        urls:     p.urls || [],
      }, choice);
    }
    if (has.reader) {
      const p = mods.reader.payload || {};
      await applyReader(p.notes || [], choice);
    }
    if (has.documents) {
      const p = mods.documents.payload || {};
      await applyDocuments(p.documents || [], choice, !!p.hasBlobs);
    }
    if (has.settings) {
      // Settings is always a full replace (single-value fields)
      applySettings(mods.settings.payload || {});
      paintAvatar();
    }
    renderSettings();
    toast(`✓ Full bundle imported (${choice})`);
  } catch (err) {
    console.error(err);
    toast('Bundle import failed: ' + err.message, 'err');
  }
}

/* ---------- Per-module apply helpers ---------- */
async function applySignupKit({ accounts, urls }, choice) {
  if (choice === 'replace') {
    const cur = await db.getAll('signupkit');
    const curU = await db.getAll('signup_urls');
    for (const a of cur)  await db.delete('signupkit', a.id);
    for (const u of curU) await db.delete('signup_urls', u.id);
    for (const a of accounts) await db.put('signupkit', a);
    for (const u of urls)     await db.put('signup_urls', u);
    return;
  }
  // Merge — newer wins per ID, then content-dedup catches drifted IDs
  const curA = await db.getAll('signupkit');
  const curU = await db.getAll('signup_urls');
  const mergedA = mergeById(curA, accounts);
  const mergedU = mergeById(curU, urls);
  const dedupA = dedupByContent(mergedA, SIG.signupkit);
  const dedupU = dedupByContent(mergedU, SIG.signup_urls);
  // Delete stale rows from IDB so they don't reappear
  for (const a of dedupA.removed) await db.delete('signupkit', a.id);
  for (const u of dedupU.removed) await db.delete('signup_urls', u.id);
  for (const a of dedupA.kept)    await db.put('signupkit', a);
  for (const u of dedupU.kept)    await db.put('signup_urls', u);
}

async function applyReader(incoming, choice) {
  if (choice === 'replace') {
    const cur = await db.getAll('reader_notes');
    for (const n of cur) await db.delete('reader_notes', n.id);
    for (const n of incoming) await db.put('reader_notes', n);
    return;
  }
  const cur = await db.getAll('reader_notes');
  const merged = mergeById(cur, incoming);
  const dedup = dedupByContent(merged, SIG.reader);
  for (const n of dedup.removed) await db.delete('reader_notes', n.id);
  for (const n of dedup.kept)    await db.put('reader_notes', n);
}

async function applyDocuments(incoming, choice, hasBlobs) {
  // Convert base64 back to Blob where present
  const restored = incoming.map(item => {
    const { data, _blobOmitted, ...rest } = item;
    if (hasBlobs && data && rest.mime) {
      return { ...rest, blob: base64ToBlob(data, rest.mime) };
    }
    return rest;
  });

  if (choice === 'replace') {
    const cur = await db.getAll('documents');
    for (const d of cur) await db.delete('documents', d.id);
    for (const d of restored) await db.put('documents', d);
    return;
  }
  // Merge documents by ID — newer wins on createdAt/updatedAt
  const cur = await db.getAll('documents');
  const map = new Map();
  cur.forEach(d => map.set(d.id, d));
  restored.forEach(d => {
    const existing = map.get(d.id);
    if (!existing) map.set(d.id, d);
    else {
      const a = existing.updatedAt || existing.createdAt || 0;
      const b = d.updatedAt || d.createdAt || 0;
      if (b > a) {
        // If incoming has no blob but existing does, preserve the existing blob
        if (!d.blob && existing.blob) d.blob = existing.blob;
        map.set(d.id, d);
      }
    }
  });
  const merged = Array.from(map.values());
  const dedup = dedupByContent(merged, SIG.documents);
  for (const d of dedup.removed) await db.delete('documents', d.id);
  for (const d of dedup.kept)    await db.put('documents', d);
}

function applySettings(payload) {
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
