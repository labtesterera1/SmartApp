/* ============================================================
   core/profile.js
   Lightweight profile + recent activity store.
   - Profile pic: compressed JPEG data URL (96×96), localStorage
   - Display name: short string, localStorage
   - Recent activity: ring buffer of {moduleId, label, ts}, localStorage
   ============================================================ */

const PIC_KEY    = 'smartapp_profile_pic_v1';
const NAME_KEY   = 'smartapp_profile_name_v1';
const STYLE_KEY  = 'smartapp_profile_style_v1';
const BANNER_KEY = 'smartapp_banner_v1';
const RECENT_KEY = 'smartapp_recent_v1';
const RECENT_MAX = 6;

/* ---------- Banner image (overrides time-of-day art when set) ---------- */
export function getBanner() {
  try { return localStorage.getItem(BANNER_KEY) || null; }
  catch { return null; }
}
export function clearBanner() {
  try { localStorage.removeItem(BANNER_KEY); } catch {}
}
/** Saves a compressed JPEG banner image (max 800px wide). */
export function saveBannerFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return reject(new Error('Not an image'));
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX_W = 800;
        const ratio = Math.min(1, MAX_W / img.width);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0c0b09';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(url);
        try {
          localStorage.setItem(BANNER_KEY, dataUrl);
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

/* ---------- Name style preset ----------
   Four curated combinations. Each preset references CSS custom props
   that are defined in app.css to keep DOM tidy. */
export const NAME_STYLES = [
  { id: 'default', label: 'Italic Lime',   font: 'serif',     italic: true,  color: 'lime'  },
  { id: 'bold',    label: 'Bold White',    font: 'serif',     italic: false, color: 'ink'   },
  { id: 'amber',   label: 'Italic Amber',  font: 'serif',     italic: true,  color: 'amber' },
  { id: 'mono',    label: 'Mono Lime',     font: 'mono',      italic: false, color: 'lime'  },
];
export function getNameStyleId() {
  try {
    const s = localStorage.getItem(STYLE_KEY);
    return s && NAME_STYLES.some(p => p.id === s) ? s : 'default';
  } catch { return 'default'; }
}
export function setNameStyleId(id) {
  try {
    if (NAME_STYLES.some(p => p.id === id)) {
      localStorage.setItem(STYLE_KEY, id);
    }
  } catch {}
}
export function getNameStyle() {
  return NAME_STYLES.find(p => p.id === getNameStyleId()) || NAME_STYLES[0];
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
