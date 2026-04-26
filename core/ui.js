/* ============================================================
   core/ui.js
   Shared UI helpers, available to every module.
   - toast(message, kind)   → flash a confirmation at the bottom
   ============================================================ */

const TOAST_MS = 2200;
let _toastTimer = null;

/**
 * Show a brief confirmation toast.
 * @param {string} message  - what to display
 * @param {'ok'|'warn'|'err'} [kind='ok']
 */
export function toast(message, kind = 'ok') {
  // Reuse one toast element if one is already on screen
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.className = `toast toast--${kind}`;
  t.textContent = message;
  // Force reflow so the transition triggers reliably
  // eslint-disable-next-line no-unused-expressions
  t.offsetHeight;
  t.classList.add('toast--show');

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('toast--show');
  }, TOAST_MS);
}
