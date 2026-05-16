/* ============================================================
   core/reader-overlay.js
   Shared distraction-free reader. Used by:
   - Reader/Notes module (its own copy still works there too)
   - Vault notes (📖 toolbar button)
   - Sign-Up Kit notes (📖 toolbar button)
   ============================================================ */

import { toast } from './ui.js';
import * as speech from './speech.js';

let _keyHandler = null;
let _speechStateOff = null;

/**
 * Open the reader overlay.
 * @param {object} opts
 * @param {string} opts.title    - shown in the top bar
 * @param {string} opts.body     - raw note body (with markdown-like markers)
 * @param {boolean} [opts.speakable=false] - if true, show the 🔊 FAB
 *   (Reader module passes true; Vault and Sign-Up Kit pass false)
 */
export function openReaderOverlay({ title, body, speakable = false }) {
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
    <main class="rd-reader__body" id="sr-body">
      ${(body || '').trim()
        ? renderRichToHtml(body || '')
        : '<div class="rd-reader__empty">This note is empty.</div>'}
    </main>
    ${speakable && speech.isSupported() ? `
      <div class="rd-readaloud" id="sr-readaloud">
        <button class="rd-readaloud__fab" id="sr-speak"
                title="Read aloud (selection or full note)"
                aria-label="Read aloud">🔊</button>
        <div class="rd-readaloud__controls" id="sr-controls" hidden>
          <button class="rd-readaloud__ctl" id="sr-pause"  title="Pause / Resume">⏸</button>
          <button class="rd-readaloud__ctl" id="sr-stop"   title="Stop">⏹</button>
        </div>
      </div>
    ` : ''}
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

  if (speakable && speech.isSupported()) {
    wireReadAloud(overlay, body || '');
  }

  _keyHandler = (e) => { if (e.key === 'Escape') closeReaderOverlay(); };
  document.addEventListener('keydown', _keyHandler);
}

function wireReadAloud(overlay, body) {
  const fab      = overlay.querySelector('#sr-speak');
  const controls = overlay.querySelector('#sr-controls');
  const pauseBtn = overlay.querySelector('#sr-pause');
  const stopBtn  = overlay.querySelector('#sr-stop');
  if (!fab) return;

  // React to speech state — hide controls when idle, show during playback
  const applyState = (state) => {
    if (state === 'idle') {
      controls.hidden = true;
      fab.classList.remove('is-on');
      fab.textContent = '🔊';
    } else if (state === 'paused') {
      controls.hidden = false;
      fab.classList.add('is-on');
      pauseBtn.textContent = '▶';
      pauseBtn.title = 'Resume';
    } else {
      // speaking
      controls.hidden = false;
      fab.classList.add('is-on');
      pauseBtn.textContent = '⏸';
      pauseBtn.title = 'Pause';
    }
  };
  speech.onStateChange(applyState);
  _speechStateOff = () => speech.onStateChange(null);

  fab.onclick = () => {
    try {
      const mode = speech.speakSelectionOr(body);
      if (mode === 'selection') toast('Reading selection');
      else toast('Reading full note');
    } catch (err) {
      toast(err.message || 'Speech failed', 'err');
    }
  };
  pauseBtn.onclick = () => {
    if (speech.getState() === 'paused') speech.resume();
    else speech.pause();
  };
  stopBtn.onclick = () => speech.stop();
}

export function closeReaderOverlay() {
  // Always stop speech when the overlay closes — no orphan playback
  try { speech.stop(); } catch {}
  if (_speechStateOff) { _speechStateOff(); _speechStateOff = null; }

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
