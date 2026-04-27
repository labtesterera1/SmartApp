/* ============================================================
   core/profile.js
   Lightweight profile-pic store.
   - Image kept as compressed JPEG data URL in localStorage
   - Resized to 96×96 max before saving (small + fast to render)
   - No name / email / anything else — just the avatar
   ============================================================ */

const KEY = 'smartapp_profile_pic_v1';

export function getProfilePic() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function clearProfilePic() {
  try { localStorage.removeItem(KEY); } catch {}
}

/** Accepts a File (from <input type=file>), saves a 96x96 JPEG. */
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

        // Cover-fit (square crop)
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
          localStorage.setItem(KEY, dataUrl);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}
