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

/* ---------- Helpers ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
