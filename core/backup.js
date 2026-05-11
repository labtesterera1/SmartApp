/* ============================================================
   core/backup.js
   Shared helpers for export / import across all modules.
   - downloadJson(filename, obj)  → triggers a save dialog
   - readJsonFromFile(file)        → returns parsed object
   - readJsonFromZip(file, entry)  → reads one .json out of a zip
   - buildFullBackupZip(parts)     → creates a single .zip of everything
   - askMergeOrReplace(label)      → modal-style prompt, returns 'merge'|'replace'|null
   ============================================================ */

import { VERSION } from './version.js';

/* ---------- Backup history tracking ----------
   Stamped every time the user successfully exports anything.
   Used by the auto-export reminder on home screen. */
const LAST_BACKUP_KEY = 'smartapp_last_backup_v1';
const REMINDER_DISMISSED_KEY = 'smartapp_reminder_dismissed_v1';
const REMIND_AFTER_DAYS = 14;

export function markBackupNow() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    // Clear any dismissal so the next overdue cycle reminds again
    localStorage.removeItem(REMINDER_DISMISSED_KEY);
  } catch {}
}

export function getLastBackupTs() {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export function getDaysSinceBackup() {
  const ts = getLastBackupTs();
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

/** Show reminder if: never backed up OR ≥14 days since AND not dismissed today. */
export function shouldShowBackupReminder() {
  const days = getDaysSinceBackup();
  if (days !== null && days < REMIND_AFTER_DAYS) return false;
  try {
    const dismissed = parseInt(localStorage.getItem(REMINDER_DISMISSED_KEY) || '0', 10);
    if (!Number.isFinite(dismissed) || dismissed <= 0) return true;
    // Dismissed within the last 24 hours → don't re-show today
    return (Date.now() - dismissed) > 24 * 3600 * 1000;
  } catch { return true; }
}

export function dismissBackupReminder() {
  try { localStorage.setItem(REMINDER_DISMISSED_KEY, String(Date.now())); } catch {}
}

/* ---------- Downloading ---------- */
export function downloadJson(filename, obj) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(filename, blob);
}

export function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/* ---------- Reading an uploaded file as JSON ---------- */
export function readJsonFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (err) { reject(new Error('File is not valid JSON')); }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

/* ---------- Filename timestamp ---------- */
export function timestampStr(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/* ---------- Standard wrapper for exported JSON ----------
   Each module wraps its data in this so import can validate. */
export function wrap(moduleId, payload, extra = {}) {
  return {
    app: 'smartapp',
    version: VERSION,
    module: moduleId,
    exportedAt: new Date().toISOString(),
    ...extra,
    payload,
  };
}

export function unwrap(obj, expectedModule) {
  if (!obj || typeof obj !== 'object') throw new Error('Empty file');
  if (obj.app !== 'smartapp') throw new Error('Not a SmartApp backup');
  if (expectedModule && obj.module !== expectedModule) {
    throw new Error(`Wrong module — expected ${expectedModule}, got ${obj.module}`);
  }
  if (!('payload' in obj)) throw new Error('Backup file is missing payload');
  return obj.payload;
}

/* ---------- Merge vs Replace prompt ----------
   Returns 'merge' | 'replace' | null (cancelled). */
export function askMergeOrReplace(moduleLabel, counts) {
  return new Promise(resolve => {
    const existing = document.getElementById('bk-prompt');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bk-prompt';
    overlay.className = 'bk-prompt';
    overlay.innerHTML = `
      <div class="bk-prompt__card">
        <div class="bk-prompt__head">IMPORT ${escapeHtml(moduleLabel.toUpperCase())}</div>
        <div class="bk-prompt__body">
          <div class="bk-prompt__row">
            <span>Currently on device:</span>
            <strong>${counts.current ?? '?'}</strong>
          </div>
          <div class="bk-prompt__row">
            <span>In backup file:</span>
            <strong>${counts.incoming ?? '?'}</strong>
          </div>
          <div class="bk-prompt__note">
            <strong style="color:var(--lime);">MERGE</strong> keeps everything — combines both sets (newer wins on conflicts).<br>
            <strong style="color:var(--warn);">REPLACE</strong> deletes current data and uses only the backup.
          </div>
        </div>
        <div class="bk-prompt__actions">
          <button class="btn btn--primary" data-act="merge">MERGE</button>
          <button class="btn" data-act="replace">REPLACE</button>
          <button class="btn bk-prompt__cancel" data-act="cancel">CANCEL</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const choice = btn.dataset.act;
      overlay.remove();
      resolve(choice === 'cancel' ? null : choice);
    });
  });
}

/* ---------- Generic merge by ID with newer-wins ----------
   For arrays of {id, updatedAt}. */
export function mergeById(current, incoming) {
  const map = new Map();
  (current || []).forEach(rec => map.set(rec.id, rec));
  (incoming || []).forEach(rec => {
    const existing = map.get(rec.id);
    if (!existing) {
      map.set(rec.id, rec);
    } else {
      const a = existing.updatedAt || 0;
      const b = rec.updatedAt || 0;
      if (b > a) map.set(rec.id, rec);
    }
  });
  return Array.from(map.values());
}

/* ---------- Content-based dedup ----------
   After an ID-merge, two records may still be content-identical with
   different IDs (e.g. user re-imported a file whose IDs drifted from the
   ones already in IDB, perhaps because of cross-device usage or legacy
   data). This finds clusters of records with the same `signature(rec)`
   and keeps only the newest in each cluster.

   Returns { kept: [...], removed: [...] }.

   Callers use `removed` to delete the stale rows from IDB. */
export function dedupByContent(records, signatureFn) {
  const clusters = new Map();   // sig → [records]
  (records || []).forEach(rec => {
    let sig;
    try { sig = signatureFn(rec); }
    catch { sig = null; }
    if (!sig) {
      // Untouchable — no signature → don't dedup
      const key = `__nosig_${rec.id || Math.random()}`;
      clusters.set(key, [rec]);
      return;
    }
    const list = clusters.get(sig) || [];
    list.push(rec);
    clusters.set(sig, list);
  });

  const kept = [];
  const removed = [];
  for (const list of clusters.values()) {
    if (list.length === 1) { kept.push(list[0]); continue; }
    // Sort by recency, keep newest
    list.sort((a, b) => {
      const ta = a.updatedAt || a.createdAt || 0;
      const tb = b.updatedAt || b.createdAt || 0;
      return tb - ta;
    });
    kept.push(list[0]);
    for (let i = 1; i < list.length; i++) removed.push(list[i]);
  }
  return { kept, removed };
}

/* ---------- Signature builders for each module ---------- */
export const SIG = {
  signupkit: (a) => {
    const u = (a.username || '').trim().toLowerCase();
    const d = (a.domain || '').trim().toLowerCase();
    const dc = (a.domainCustom || '').trim().toLowerCase();
    const fn = (a.firstName || '').trim().toLowerCase();
    const ln = (a.lastName || '').trim().toLowerCase();
    if (!u && !fn && !ln) return null;   // not safe to dedup
    return `acc::${u}::${d || dc}::${fn}::${ln}`;
  },
  signup_urls: (u) => {
    const name = (u.name || '').trim().toLowerCase();
    const url = (u.url || '').trim().toLowerCase();
    if (!url && !name) return null;
    return `url::${name}::${url}`;
  },
  reader: (n) => {
    const title = (n.title || '').trim().toLowerCase();
    const body = (n.body || '').trim().slice(0, 120).toLowerCase();
    if (!title && !body) return null;
    return `note::${title}::${body}`;
  },
  documents: (d) => {
    const name = (d.name || '').trim().toLowerCase();
    const size = d.originalSize || d.size || 0;
    if (!name) return null;
    return `doc::${name}::${size}`;
  },
};

/* ---------- Helpers ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------- Blob <-> base64 (for Document Hub binary photos) ---------- */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      // result is "data:<mime>;base64,<payload>" — strip the prefix
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64, mime = 'application/octet-stream') {
  const bin = atob(b64);
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

/* ---------- Light vs Full bundle picker modal ----------
   Used by EXPORT ALL. Returns 'light' | 'full' | null. */
export function askLightOrFull(approxBlobs) {
  return new Promise(resolve => {
    const existing = document.getElementById('bk-prompt');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bk-prompt';
    overlay.className = 'bk-prompt';
    overlay.innerHTML = `
      <div class="bk-prompt__card">
        <div class="bk-prompt__head">EXPORT ALL — CHOOSE FORMAT</div>
        <div class="bk-prompt__body">
          <div class="bk-prompt__note">
            <strong style="color:var(--lime);">LIGHT</strong> — Sign-Up Kit, Reader, Settings, and Document Hub <em>metadata</em> only. Small file (a few MB). Photos NOT included — use Document Hub's own export for blobs.<br><br>
            <strong style="color:var(--lime);">FULL</strong> — Everything above <em>plus</em> all photo blobs from Document Hub. Approx ${escapeHtml(approxBlobs || '?')} of photos. One file, but large — may not transfer over email or WhatsApp.<br><br>
            <strong style="color:var(--warn);">Vault is never included in bulk exports.</strong> Use the Vault module's own export.
          </div>
        </div>
        <div class="bk-prompt__actions">
          <button class="btn btn--primary" data-act="light">LIGHT (metadata only)</button>
          <button class="btn btn--primary" data-act="full">FULL (with photos)</button>
          <button class="btn bk-prompt__cancel" data-act="cancel">CANCEL</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const choice = btn.dataset.act;
      overlay.remove();
      resolve(choice === 'cancel' ? null : choice);
    });
  });
}

/* ---------- File classification ----------
   Identifies what kind of SmartApp file the user picked. */
export function classifySmartAppFile(obj) {
  if (!obj || typeof obj !== 'object') return { kind: 'invalid', reason: 'Empty file' };
  if (obj.app !== 'smartapp') return { kind: 'invalid', reason: 'Not a SmartApp file' };

  // Vault exports use a different envelope. Recognize and refuse politely.
  // (Vault writes its own structure — see vault.js exportVault.)
  if (obj.kind === 'vault-backup' || obj.module === 'vault') {
    return { kind: 'vault', reason: 'Vault file — import from the Vault module instead.' };
  }

  if (obj.kind === 'full-backup' && obj.modules) {
    return { kind: 'bundle', moduleNames: Object.keys(obj.modules) };
  }
  if (obj.module) {
    return { kind: 'module', moduleName: obj.module };
  }
  return { kind: 'invalid', reason: 'Unknown format' };
}

/* ---------- Version-aware import check ----------
   Compares file version to app version. Returns 'ok' | 'newer' | 'older' | 'unknown'.
*/
export function compareVersions(fileVer, appVer) {
  if (!fileVer || !appVer) return 'unknown';
  const parse = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
  const f = parse(fileVer), a = parse(appVer);
  for (let i = 0; i < Math.max(f.length, a.length); i++) {
    const fn = f[i] || 0, an = a[i] || 0;
    if (fn > an) return 'newer';
    if (fn < an) return 'older';
  }
  return 'ok';
}
