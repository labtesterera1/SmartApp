/* ============================================================
   core/messages.js
   Custom rotating messages — user writes their own list in Settings.
   - Stored as a JSON array of strings in localStorage
   - Home screen rotates through them once per day (deterministic)
   - "Reshuffle" button advances to the next one
   - If list is empty, no banner shows on home
   ============================================================ */

const KEY     = 'smartapp_messages_v1';
const SHUFFLE = 'smartapp_msg_shuffle_v1';

const SAMPLE_DEFAULTS = [
  'One thing at a time.',
  'Ship it. Then improve it.',
  'Quiet head, sharp work.',
];

export function getMessages() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(s => typeof s === 'string' && s.trim()) : [];
  } catch { return []; }
}

export function setMessages(list) {
  try {
    const clean = (Array.isArray(list) ? list : [])
      .map(s => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 50);
    if (clean.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {}
}

export function getSampleDefaults() { return [...SAMPLE_DEFAULTS]; }

function getShuffle() {
  try { return parseInt(localStorage.getItem(SHUFFLE) || '0', 10) || 0; }
  catch { return 0; }
}
export function bumpShuffle() {
  try { localStorage.setItem(SHUFFLE, String(getShuffle() + 1)); } catch {}
}

/** Returns today's message (deterministic by date + shuffle), or null if list empty. */
export function getTodaysMessage() {
  const list = getMessages();
  if (list.length === 0) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  const idx = (day + getShuffle()) % list.length;
  return { text: list[idx], idx, total: list.length };
}
