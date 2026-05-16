/* ============================================================
   core/speech.js
   Wraps the Web Speech API (SpeechSynthesis) for read-aloud.

   Features:
   - Auto-detect script per chunk (Devanagari → Hindi voice, Latin → default)
   - Single-instance — starting a new utterance cancels any previous
   - Strips markup (** ## [color] etc.) before speaking
   - User-pickable default voice via Settings (smartapp_reader_voice_v1)
   ============================================================ */

const DEFAULT_VOICE_KEY = 'smartapp_reader_voice_v1';

let _currentUtterances = [];
let _onStateChange = null;
let _state = 'idle';   // 'idle' | 'speaking' | 'paused'

export function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getVoices() {
  if (!isSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function getDefaultVoiceName() {
  try { return localStorage.getItem(DEFAULT_VOICE_KEY) || null; }
  catch { return null; }
}

export function setDefaultVoiceName(name) {
  try {
    if (name) localStorage.setItem(DEFAULT_VOICE_KEY, name);
    else localStorage.removeItem(DEFAULT_VOICE_KEY);
  } catch {}
}

export function onStateChange(cb) {
  _onStateChange = cb;
}

export function getState() { return _state; }

function setState(s) {
  _state = s;
  if (typeof _onStateChange === 'function') {
    try { _onStateChange(s); } catch {}
  }
}

export function stop() {
  if (!isSupported()) return;
  _currentUtterances = [];
  try { window.speechSynthesis.cancel(); } catch {}
  setState('idle');
}

export function pause() {
  if (!isSupported()) return;
  try { window.speechSynthesis.pause(); } catch {}
  setState('paused');
}

export function resume() {
  if (!isSupported()) return;
  try { window.speechSynthesis.resume(); } catch {}
  setState('speaking');
}

/* ---------- Speak ---------- */
/** Strip markup so speech sounds clean. */
export function stripMarkup(raw) {
  if (!raw) return '';
  let t = String(raw);
  // [lime]…[/lime] etc.
  t = t.replace(/\[(lime|orange|red)\]([\s\S]*?)\[\/\1\]/gi, '$2');
  // ## headline → just text, with a sentence ending so TTS pauses
  t = t.replace(/^##\s+(.+)$/gm, '$1. ');
  // **bold** → bold
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  // Collapse multiple newlines into a single pause-suggesting period
  t = t.replace(/\n{2,}/g, '. ');
  t = t.replace(/\n/g, ' ');
  // Tidy double-periods that might result
  t = t.replace(/\.{2,}/g, '.');
  return t.trim();
}

/** Detect script of a chunk. Returns 'hi' for Devanagari, 'en' otherwise. */
export function detectScript(text) {
  if (!text) return 'en';
  // Any character in Devanagari Unicode block?
  return /[\u0900-\u097F]/.test(text) ? 'hi' : 'en';
}

/** Split text into runs of single-script content so we can pick voices. */
function splitByScript(text) {
  if (!text) return [];
  const runs = [];
  let buf = '';
  let curScript = null;
  for (const ch of text) {
    const cs = /[\u0900-\u097F]/.test(ch) ? 'hi' : 'en';
    if (curScript === null) {
      curScript = cs;
      buf = ch;
    } else if (cs === curScript) {
      buf += ch;
    } else {
      // For ASCII whitespace/punctuation, stick with current run
      if (/[\s\p{P}]/u.test(ch)) {
        buf += ch;
      } else {
        runs.push({ script: curScript, text: buf });
        curScript = cs;
        buf = ch;
      }
    }
  }
  if (buf) runs.push({ script: curScript || 'en', text: buf });
  return runs.filter(r => r.text.trim().length > 0);
}

/** Pick a voice for a script. Honors user override first. */
function pickVoice(script) {
  const voices = getVoices();
  if (voices.length === 0) return null;

  const userPick = getDefaultVoiceName();
  // For Latin: use the user's chosen default if any
  if (script === 'en' && userPick) {
    const v = voices.find(x => x.name === userPick);
    if (v) return v;
  }
  // For Hindi: prefer a hi-* voice
  if (script === 'hi') {
    const hi = voices.find(x => /^hi(-|_|$)/i.test(x.lang));
    if (hi) return hi;
    // Fall back to any Devanagari-capable voice (rare)
    const dev = voices.find(x => /Devanagari/i.test(x.name));
    if (dev) return dev;
  }
  // Default: first English voice, then anything
  const en = voices.find(x => /^en(-|_)/i.test(x.lang));
  return en || voices[0];
}

/**
 * Speak the given text. Strips markup and splits by script so each
 * chunk uses an appropriate voice.
 * Returns immediately; observe state via onStateChange().
 */
export function speak(rawText) {
  if (!isSupported()) {
    throw new Error('Speech not supported on this browser');
  }
  stop();   // cancel anything currently playing

  const text = stripMarkup(rawText);
  if (!text) {
    throw new Error('Nothing to read');
  }

  const runs = splitByScript(text);
  if (runs.length === 0) return;

  setState('speaking');
  _currentUtterances = runs.map((run, idx) => {
    const u = new SpeechSynthesisUtterance(run.text);
    u.lang = run.script === 'hi' ? 'hi-IN' : 'en-US';
    const v = pickVoice(run.script);
    if (v) u.voice = v;
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    if (idx === runs.length - 1) {
      u.onend = () => {
        // Only flip to idle if this was the actual last utterance scheduled
        if (_currentUtterances[_currentUtterances.length - 1] === u) {
          setState('idle');
        }
      };
    }
    u.onerror = () => {
      // Silent — Edge/Chrome sometimes fire errors on cancel(); not user-facing
    };
    return u;
  });

  for (const u of _currentUtterances) {
    window.speechSynthesis.speak(u);
  }
}

/** Convenience: read whatever is currently selected on the page,
 *  or fall back to the provided fullText if no selection. */
export function speakSelectionOr(fullText) {
  const sel = (window.getSelection && window.getSelection().toString()) || '';
  const target = sel.trim() ? sel : fullText;
  speak(target);
  return sel.trim() ? 'selection' : 'full';
}
