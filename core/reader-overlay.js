/* ============================================================
   core/reader-overlay.js
   Shared distraction-free reader. Used by:
   - Reader/Notes module (its own copy still works there too)
   - Vault notes (📖 toolbar button)
   - Sign-Up Kit notes (📖 toolbar button)
   ============================================================ */

import { toast } from './ui.js';

let _keyHandler = null;

/**
 * Open the reader overlay.
 * @param {object} opts
 * @param {string} opts.title    - shown in the top bar
 * @param {string} opts.body     - raw note body (with markdown-like markers)
 */
export function openReaderOverlay({ title, body }) {
  closeReaderOverlay();   // close any existing first

  const overlay = document.createElement('div');
  overlay.id = 'shared-reader';
  overlay.className = 'rd-reader';
  overlay.innerHTML = `
    <header class="rd-reader__top">
      <button class="rd-reader__close" id="sr-close">✕ CLOSE</button>
      <span class="rd-reader__title">${esc(title || 'Untitled')}</span>
      <button class="rd-reader__copy" id="sr-copy" title="Copy">⧉</button>
    </header>
    <main class="rd-reader__body">
      ${(body || '').trim()
        ? renderRichToHtml(body || '')
        : '<div class="rd-reader__empty">This note is empty.</div>'}
    </main>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  overlay.querySelector('#sr-close').onclick = closeReaderOverlay;
  overlay.querySelector('#sr-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(body || '');
      toast('✓ Copied');
    } catch {
      toast('Copy failed', 'err');
    }
  };

  _keyHandler = (e) => { if (e.key === 'Escape') closeReaderOverlay(); };
  document.addEventListener('keydown', _keyHandler);
}

export function closeReaderOverlay() {
  const overlay = document.getElementById('shared-reader');
  if (overlay) overlay.remove();
  if (_keyHandler) {
    document.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }
  document.body.style.overflow = '';
}

function renderRichToHtml(raw) {
  let html = esc(raw);
  html = html.replace(/^##\s+(.+)$/gm, '<span class="rich-h">$1</span>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[(lime|orange|red)\]([\s\S]*?)\[\/\1\]/g,
    (_m, c, t) => `<span class="rich-c rich-c--${c}">${t}</span>`);
  html = html.replace(/\n/g, '<br>');
  return html;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
