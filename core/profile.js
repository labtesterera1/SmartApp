/* ============================================================
   core/profile.js
   Lightweight profile + recent activity store.
   - Profile pic: compressed JPEG data URL (96×96), localStorage
   - Display name: short string, localStorage
   - Recent activity: ring buffer of {moduleId, label, ts}, localStorage
   ============================================================ */

const PIC_KEY    = 'smartapp_profile_pic_v1';
const NAME_KEY   = 'smartapp_profile_name_v1';
const RECENT_KEY = 'smartapp_recent_v1';
const RECENT_MAX = 6;

/* ---------- Display name ---------- */
export function getDisplayName() {
  try { return localStorage.getItem(NAME_KEY) || 'Nik'; }
  catch { return 'Nik'; }
}
export function setDisplayName(name) {
  try {
    const trimmed = String(name || '').trim().slice(0, 24);
    if (!trimmed) localStorage.removeItem(NAME_KEY);
    else          localStorage.setItem(NAME_KEY, trimmed);
  } catch {}
}

/* ---------- Profile picture ---------- */
export function getProfilePic() {
  try { return localStorage.getItem(PIC_KEY) || null; }
  catch { return null; }
}
export function clearProfilePic() {
  try { localStorage.removeItem(PIC_KEY); } catch {}
}

export function saveProfilePicFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return reject(new Error('Not an image'));
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const SIZE = 96;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const ratio = Math.max(SIZE / img.width, SIZE / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (SIZE - w) / 2;
        const y = (SIZE - h) / 2;
        ctx.fillStyle = '#0c0b09';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, x, y, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(url);
        try {
          localStorage.setItem(PIC_KEY, dataUrl);
          resolve(dataUrl);
        } catch (err) { reject(err); }
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

/* ---------- Recent activity ----------
   Modules call recordActivity('vault', 'Gmail backup') after a save.
   Home shows the latest few as chips. */
export function getRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function recordActivity(moduleId, label) {
  if (!moduleId) return;
  try {
    const list = getRecent().filter(
      (r) => !(r.moduleId === moduleId && r.label === label)
    );
    list.unshift({
      moduleId,
      label: String(label || '').slice(0, 40),
      ts: Date.now(),
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {}
}
export function clearRecent() {
  try { localStorage.removeItem(RECENT_KEY); } catch {}
}
