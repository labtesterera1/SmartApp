/* ============================================================
   modules/capture.js  — ScreenAudioCapture
   Record · Transcript · Download
   No AI required. Works standalone.
   Full-day sessions: Pause/Resume for breaks.
   Sessions saved to localStorage — never auto-deleted.
   ============================================================ */

import { toast } from '../core/ui.js';

/* ── CSS injected once ──────────────────────────────────── */
function injectStyles() {
  if (document.getElementById('cap-styles')) return;
  const el = document.createElement('style');
  el.id = 'cap-styles';
  el.textContent = `
    .cap-wrap { padding: 0 2px; }
    .cap-tabs { display:flex; gap:6px; margin-bottom:14px; border-bottom:1px solid var(--border,#2a2a2a); padding-bottom:10px; }
    .cap-tab {
      padding:6px 16px; font-size:10px; font-weight:700; letter-spacing:.1em;
      text-transform:uppercase; border:1px solid var(--border,#333);
      background:transparent; color:var(--ink-dim,#666); cursor:pointer; transition:all .15s;
    }
    .cap-tab.active { background:var(--lime,#d4ff3a); color:#0a0a0a; border-color:var(--lime,#d4ff3a); }
    .cap-header { display:flex; align-items:center; gap:10px; padding:10px 0 14px; border-bottom:1px solid var(--border,#222); margin-bottom:14px; flex-wrap:wrap; }
    .cap-live  { font-size:10px; font-weight:700; color:#e74c3c; letter-spacing:.14em; animation:cap-pulse 1s ease-in-out infinite; }
    .cap-break-lbl { font-size:10px; font-weight:700; color:var(--warn,#e8b867); letter-spacing:.12em; }
    .cap-idle  { font-size:10px; color:var(--ink-dim,#666); letter-spacing:.12em; }
    .cap-done-lbl { font-size:10px; color:var(--ink-dim,#666); letter-spacing:.12em; }
    .cap-timer { font-size:20px; font-weight:700; color:var(--lime,#d4ff3a); letter-spacing:.06em; font-family:monospace; }
    .cap-src { font-size:9px; padding:3px 8px; border:1px solid var(--border,#333); color:var(--ink-dim,#555); letter-spacing:.08em; }
    .cap-src.on { border-color:var(--lime,#d4ff3a); color:var(--lime,#d4ff3a); }
    @keyframes cap-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .cap-label { font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-dim,#555); margin:12px 0 5px; }
    .cap-input {
      display:block; width:100%; padding:9px 11px; background:var(--bg-tile,#1a1a1a);
      border:1px solid var(--border,#333); color:var(--ink,#e0e0e0); font-size:13px;
      margin-bottom:10px; box-sizing:border-box; font-family:inherit;
    }
    .cap-input:focus { outline:1px solid var(--lime,#d4ff3a); border-color:var(--lime,#d4ff3a); }
    .cap-info { margin-bottom:12px; }
    .cap-info-row {
      display:flex; align-items:flex-start; gap:10px; padding:7px 11px;
      background:var(--bg-tile,#1a1a1a); border:1px solid var(--border,#2a2a2a);
      margin-bottom:4px; font-size:11px; color:var(--ink-dim,#777); line-height:1.5;
    }
    .cap-info-row.off { opacity:.4; }
    .cap-info-row.warn { border-color:var(--warn,#e8b867); color:var(--warn,#e8b867); }
    .cap-tag {
      font-size:8px; font-weight:700; letter-spacing:.12em; color:#0a0a0a;
      background:var(--lime,#d4ff3a); padding:2px 5px; flex-shrink:0; margin-top:1px;
    }
    .cap-tip { font-size:11px; color:var(--ink-dim,#666); border-left:2px solid var(--warn,#e8b867); padding:8px 12px; margin-bottom:12px; line-height:1.5; }
    .cap-main-btn { width:100%; padding:14px; font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; margin-bottom:8px; cursor:pointer; border:none; }
    .cap-btn-start { background:var(--lime,#d4ff3a); color:#0a0a0a; }
    .cap-btn-stop  { background:#c0392b; color:#fff; }
    .cap-btn-resume{ background:var(--lime,#d4ff3a); color:#0a0a0a; }
    .cap-row { display:flex; gap:7px; margin-bottom:8px; flex-wrap:wrap; }
    .cap-btn {
      padding:8px 14px; font-size:10px; font-weight:700; letter-spacing:.08em;
      text-transform:uppercase; border:1px solid var(--border,#333); cursor:pointer;
      background:transparent; color:var(--ink,#ccc); transition:all .12s;
    }
    .cap-btn:hover { border-color:var(--lime,#d4ff3a); color:var(--lime,#d4ff3a); }
    .cap-btn.danger:hover { border-color:#e74c3c; color:#e74c3c; }
    .cap-break-box {
      background:var(--bg-tile,#1a1a1a); border:1px solid var(--warn,#e8b867);
      padding:16px; margin-bottom:10px; text-align:center;
    }
    .cap-transcript {
      background:var(--bg-tile,#111); border:1px solid var(--border,#2a2a2a);
      padding:10px; min-height:120px; max-height:340px; overflow-y:auto;
      margin-bottom:10px; scroll-behavior:smooth;
    }
    .cap-line { display:flex; gap:10px; padding:4px 0; border-bottom:1px solid var(--border,#1f1f1f); font-size:12px; line-height:1.55; }
    .cap-line:last-child { border-bottom:none; }
    .cap-line.interim { opacity:.45; font-style:italic; }
    .cap-ts { font-family:monospace; font-size:9px; color:#5c6e1a; flex-shrink:0; min-width:46px; padding-top:2px; }
    .cap-txt { color:var(--ink,#d8d8d8); }
    .cap-done-bar {
      display:flex; justify-content:space-between; align-items:center;
      padding:10px 14px; background:var(--bg-tile,#1a1a1a);
      border:1px solid #5c6e1a; margin-bottom:12px;
      font-size:11px; flex-wrap:wrap; gap:5px;
    }
    .cap-done-bar span:first-child { color:var(--lime,#d4ff3a); font-weight:700; }
    .cap-section { font-size:9px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-dim,#555); margin:14px 0 7px; display:flex; align-items:center; gap:8px; }
    .cap-section::after { content:''; flex:1; height:1px; background:var(--border,#2a2a2a); }
    .cap-session-card { background:var(--bg-tile,#1a1a1a); border:1px solid var(--border,#2a2a2a); margin-bottom:8px; }
    .cap-session-head { padding:12px 14px 8px; }
    .cap-session-title { font-size:17px; color:var(--ink,#e0e0e0); margin-bottom:3px; font-family:var(--serif,serif); }
    .cap-session-meta  { font-size:10px; color:var(--ink-dim,#666); font-family:monospace; }
    .cap-session-preview { font-size:11px; color:var(--ink-dim,#555); padding:0 14px 10px; line-height:1.5; }
    .cap-session-acts  { display:flex; gap:5px; padding:8px 14px; border-top:1px solid var(--border,#1f1f1f); flex-wrap:wrap; }
    .cap-empty { padding:32px 0; text-align:center; color:var(--ink-dim,#555); font-size:12px; }
    .cap-empty-icon { font-size:28px; margin-bottom:10px; }
    .cap-status-bar { display:flex; align-items:center; padding:6px 10px; background:var(--bg-tile,#111); border:1px solid var(--border,#1f1f1f); margin-bottom:8px; flex-wrap:wrap; }
    .cap-listening { font-size:9px; font-weight:700; letter-spacing:.12em; color:var(--lime,#d4ff3a); animation:cap-pulse 2s ease-in-out infinite; margin-right:8px; }
  `;
  document.head.appendChild(el);
}

/* ── Storage ────────────────────────────────────────────── */
const STORE_KEY = 'smartapp_cap_sessions_v1';
function getSessions() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function saveSession(s) {
  const all = getSessions();
  all.unshift(s);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch(e) { toast('Storage full — session not saved', 'err'); }
}
function deleteSession(id) {
  const all = getSessions().filter(s => s.id !== id);
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}

/* ── Capture state ──────────────────────────────────────── */
let _root = null;
let _tab = 'record';
let _cap = {
  running: false, paused: false, elapsed: 0, timer: null,
  lines: [], chunks: [], micStream: null, sysStream: null,
  audioCtx: null, recognition: null, recorder: null,
  hasSys: false, interim: '', title: '', keepalive: null
};

/* ── Time format ────────────────────────────────────────── */
function fmt(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`;
}
function bestMime() {
  const types = ['audio/webm;codecs=opus','audio/webm','audio/ogg','audio/mp4'];
  for (const t of types) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ── Main render ────────────────────────────────────────── */
function render() {
  if (!_root) return;
  injectStyles();
  const sessions = getSessions();
  let html = `<div class="cap-wrap">`;
  html += `<div class="cap-tabs">
    <button class="cap-tab${_tab === 'record' ? ' active' : ''}" id="cap-t-rec">Record</button>
    <button class="cap-tab${_tab === 'sessions' ? ' active' : ''}" id="cap-t-ses">Sessions${sessions.length ? ` (${sessions.length})` : ''}</button>
  </div>`;
  html += _tab === 'record' ? renderRecord() : renderSessions(sessions);
  html += `</div>`;
  _root.innerHTML = html;
  bind();
}

/* ── Record tab ─────────────────────────────────────────── */
function renderRecord() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  let html = `<div class="cap-header">`;
  if (_cap.running) {
    html += `<span class="cap-live">● LIVE</span>
             <span class="cap-timer" id="cap-timer">${fmt(_cap.elapsed)}</span>
             <span class="cap-src on">Mic ON</span>
             <span class="cap-src ${_cap.hasSys ? 'on' : ''}">Sys ${_cap.hasSys ? 'ON' : 'OFF'}</span>`;
  } else if (_cap.paused) {
    html += `<span class="cap-break-lbl">ON BREAK</span>
             <span class="cap-timer" id="cap-timer">${fmt(_cap.elapsed)}</span>
             <span class="cap-src">Paused</span>`;
  } else if (_cap.lines.length > 0) {
    html += `<span class="cap-done-lbl">STOPPED</span>
             <span class="cap-timer">${fmt(_cap.elapsed)}</span>`;
  } else {
    html += `<span class="cap-idle">○ READY TO CAPTURE</span>`;
  }
  html += `</div>`;

  /* IDLE */
  if (!_cap.running && !_cap.paused && _cap.lines.length === 0) {
    html += `<div class="cap-label">Session title</div>
    <input type="text" id="cap-title" class="cap-input" placeholder="e.g. English Training Day 1" value="${esc(_cap.title)}">
    <div class="cap-info">
      <div class="cap-info-row"><span class="cap-tag">MIC</span>Your microphone — always captured, live transcript</div>
      ${!isMobile
        ? `<div class="cap-info-row"><span class="cap-tag">SYS</span>System audio — screen share + tick "Share system audio" checkbox</div>`
        : `<div class="cap-info-row off"><span class="cap-tag">SYS</span>System audio not available on mobile</div>`}
      ${!SR ? `<div class="cap-info-row warn"><span class="cap-tag">!</span>Live transcript requires Chrome or Edge</div>` : ''}
    </div>
    ${!isMobile ? `<div class="cap-tip"><strong>Chrome:</strong> tick <strong>"Share system audio"</strong> at bottom of share dialog. <strong>Edge:</strong> turn on <strong>"Also share tab audio"</strong> toggle. Then play training audio through <strong>speakers</strong> (not headphones) for best transcript.</div>` : ''}
    <button class="cap-main-btn cap-btn-start" id="cap-start">● Start Capture</button>`;
  }

  /* RUNNING */
  if (_cap.running) {
    html += `<div class="cap-transcript" id="cap-tx">`;
    _cap.lines.forEach(l => { html += `<div class="cap-line"><span class="cap-ts">[${l.time}]</span><span class="cap-txt">${esc(l.text)}</span></div>`; });
    if (_cap.interim) html += `<div class="cap-line interim"><span class="cap-ts">...</span><span class="cap-txt">${esc(_cap.interim)}</span></div>`;
    html += `</div>`;
    html += `<div class="cap-status-bar"><span class="cap-listening">● Listening</span><span id="cap-sr-status" style="font-size:10px;margin-left:8px;color:var(--ink-dim,#555)">Microphone open — speak now to test</span></div>`;
    html += `<div class="cap-row">
    <div class="cap-row">
      <button class="cap-btn" id="cap-break" style="flex:1">⏸ Take a Break</button>
      <button class="cap-btn danger" id="cap-stop" style="flex:1">■ Stop Session</button>
    </div>`;
  }

  /* ON BREAK */
  if (_cap.paused) {
    html += `<div class="cap-break-box">
      <div style="font-weight:700;color:var(--warn,#e8b867);letter-spacing:.1em">SESSION PAUSED — ON BREAK</div>
      <div style="font-size:11px;color:var(--ink-dim,#666);margin-top:4px">${_cap.lines.length} segments captured so far</div>
    </div>`;
    if (_cap.lines.length > 0) {
      html += `<div class="cap-transcript" style="max-height:160px">`;
      _cap.lines.slice(-4).forEach(l => { html += `<div class="cap-line"><span class="cap-ts">[${l.time}]</span><span class="cap-txt">${esc(l.text)}</span></div>`; });
      html += `</div>`;
    }
    html += `<div class="cap-row">
      <button class="cap-main-btn cap-btn-resume" id="cap-resume" style="flex:1;margin-bottom:0">▶ Resume Capture</button>
      <button class="cap-btn danger" id="cap-stop" style="flex:1;padding:14px">■ Stop</button>
    </div>`;
  }

  /* DONE */
  if (!_cap.running && !_cap.paused && _cap.lines.length > 0) {
    const wc = _cap.lines.reduce((n, l) => n + l.text.split(' ').length, 0);
    html += `<div class="cap-done-bar">
      <span>Session complete</span>
      <span>${fmt(_cap.elapsed)} | ${wc.toLocaleString()} words | ${_cap.lines.length} segments</span>
    </div>
    <div class="cap-row">
      <button class="cap-btn" id="cap-new">New Session</button>
      <button class="cap-btn" id="cap-dl-txt">Download TXT</button>
      <button class="cap-btn" id="cap-dl-ppt">Download PPT</button>
    </div>
    <div class="cap-section">Full Transcript</div>
    <div class="cap-transcript">`;
    _cap.lines.forEach(l => { html += `<div class="cap-line"><span class="cap-ts">[${l.time}]</span><span class="cap-txt">${esc(l.text)}</span></div>`; });
    html += `</div>`;
  }
  return html;
}

/* ── Sessions tab ───────────────────────────────────────── */
function renderSessions(sessions) {
  if (!sessions.length) {
    return `<div class="cap-empty">
      <div class="cap-empty-icon">○</div>
      No saved sessions yet<br>
      <span style="font-size:10px;color:var(--ink-dim,#555)">Completed sessions appear here — never auto-deleted</span>
    </div>`;
  }
  let html = `<div class="cap-section">${sessions.length} saved session${sessions.length !== 1 ? 's' : ''}</div>`;
  sessions.forEach(s => {
    const preview = s.lines && s.lines.length ? s.lines[0].text.slice(0, 100) + '...' : '';
    html += `<div class="cap-session-card">
      <div class="cap-session-head">
        <div class="cap-session-title">${esc(s.title)}</div>
        <div class="cap-session-meta">${esc(s.date)} | ${fmt(s.elapsed)} | ${(s.wordCount || 0).toLocaleString()} words</div>
      </div>
      ${preview ? `<div class="cap-session-preview">${esc(preview)}</div>` : ''}
      <div class="cap-session-acts">
        <button class="cap-btn" data-sid="${esc(s.id)}" data-act="view">View</button>
        <button class="cap-btn" data-sid="${esc(s.id)}" data-act="txt">TXT</button>
        <button class="cap-btn" data-sid="${esc(s.id)}" data-act="ppt">PPT</button>
        <button class="cap-btn danger" data-sid="${esc(s.id)}" data-act="del">Delete</button>
      </div>
    </div>`;
  });
  return html;
}

/* ── Bind all events ────────────────────────────────────── */
function bind() {
  const g = id => _root.querySelector('#' + id);
  /* Sub-tab toggle */
  const tRec = g('cap-t-rec'), tSes = g('cap-t-ses');
  if (tRec) tRec.addEventListener('click', () => { _tab = 'record'; render(); });
  if (tSes) tSes.addEventListener('click', () => { _tab = 'sessions'; render(); });
  /* Record tab */
  const start = g('cap-start'), stop = g('cap-stop'), brk = g('cap-break'), res = g('cap-resume');
  const nw = g('cap-new'), dlTxt = g('cap-dl-txt'), dlPpt = g('cap-dl-ppt');
  if (start) start.addEventListener('click', startCapture);
  if (stop)  stop.addEventListener('click', stopCapture);
  if (brk)   brk.addEventListener('click', pauseCapture);
  if (res)   res.addEventListener('click', resumeCapture);
  if (nw)    nw.addEventListener('click', () => { _cap.lines = []; _cap.elapsed = 0; _cap.title = ''; render(); });
  if (dlTxt) dlTxt.addEventListener('click', () => downloadTxt(buildSession()));
  if (dlPpt) dlPpt.addEventListener('click', () => downloadPpt(buildSession()));
  /* Sessions tab */
  _root.querySelectorAll('[data-sid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid, act = btn.dataset.act;
      const s = getSessions().find(x => x.id === sid);
      if (!s) return;
      if (act === 'del') {
        if (!confirm(`Delete "${s.title}"? Cannot be undone.`)) return;
        deleteSession(sid); render();
      } else if (act === 'txt') { downloadTxt(s); }
      else if (act === 'ppt')   { downloadPpt(s); }
      else if (act === 'view')  { _cap.lines = s.lines; _cap.elapsed = s.elapsed; _cap.title = s.title; _tab = 'record'; render(); }
    });
  });
}

/* ── Start ──────────────────────────────────────────────── */
async function startCapture() {
  const titleEl = _root.querySelector('#cap-title');
  _cap.title = titleEl ? titleEl.value.trim() : 'Training Session';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Live transcript needs Chrome or Edge', 'err'); return; }

  try {
    _cap.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  } catch(e) { toast('Microphone denied: ' + e.message, 'err'); return; }

  _cap.hasSys = false; _cap.sysStream = null;
  if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      _cap.sysStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false } });
      _cap.hasSys = _cap.sysStream.getAudioTracks().length > 0;
      if (!_cap.hasSys) toast('No system audio — tick "Share system audio" (Chrome) or "Also share tab audio" (Edge)', 'warn');
    } catch(e) { toast('Screen share skipped — mic only', 'warn'); _cap.sysStream = null; }
  }

  try {
    _cap.audioCtx = new AudioContext();
    const dest = _cap.audioCtx.createMediaStreamDestination();
    _cap.audioCtx.createMediaStreamSource(_cap.micStream).connect(dest);
    if (_cap.hasSys && _cap.sysStream) {
      const sysSource = _cap.audioCtx.createMediaStreamSource(_cap.sysStream);
      sysSource.connect(dest); /* record system audio */
      /* Loopback: play system audio at low volume through speakers so mic picks it up for transcript */
      const loopGain = _cap.audioCtx.createGain();
      loopGain.gain.value = 0.25;
      sysSource.connect(loopGain);
      loopGain.connect(_cap.audioCtx.destination);
    }
    /* Silent keepalive oscillator — prevents browser from suspending capture */
    const osc = _cap.audioCtx.createOscillator();
    const g = _cap.audioCtx.createGain(); g.gain.value = 0.00001;
    osc.connect(g); g.connect(_cap.audioCtx.destination); osc.start();
    _cap.keepalive = osc;
    const mime = bestMime();
    _cap.recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : {});
    _cap.chunks = [];
    _cap.recorder.ondataavailable = e => { if (e.data && e.data.size > 0) _cap.chunks.push(e.data); };
    _cap.recorder.start(500);
  } catch(e) { toast('Audio setup error: ' + e.message, 'err'); return; }

  _cap.lines = []; _cap.interim = ''; _cap.running = true; _cap.paused = false; _cap.elapsed = 0;
  startRecognition();
  _cap.timer = setInterval(() => {
    if (_cap.running && !_cap.paused) {
      _cap.elapsed++;
      const t = _root && _root.querySelector('#cap-timer');
      if (t) t.textContent = fmt(_cap.elapsed);
    }
  }, 1000);
  render();
  toast('Capture started' + (_cap.hasSys ? ' — mic + system audio' : ' — mic only'));
}

function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('SpeechRecognition not supported — use Chrome or Edge', 'err'); return; }
  if (!_cap.running) return;
  if (_cap.recognition) { try { _cap.recognition.stop(); } catch(e) {} }

  _cap.recognition = new SR();
  _cap.recognition.continuous = true;
  _cap.recognition.interimResults = true;
  _cap.recognition.lang = 'en-US';
  _cap.recognition.maxAlternatives = 1;

  /* Confirm audio pipeline is working */
  _cap.recognition.onaudiostart = () => { setSrStatus('audio', '🎙 Audio input active'); };
  _cap.recognition.onsoundstart = () => { setSrStatus('sound', '🔊 Sound detected'); };
  _cap.recognition.onspeechstart= () => { setSrStatus('speech','💬 Speech detected — transcribing...'); };
  _cap.recognition.onspeechend  = () => { setSrStatus('wait',  '● Listening'); };

  _cap.recognition.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        const t = e.results[i][0].transcript.trim();
        if (t) { _cap.lines.push({ time: fmt(_cap.elapsed), text: t }); }
      } else { interim += e.results[i][0].transcript; }
    }
    _cap.interim = interim;
    updateLive();
  };

  _cap.recognition.onerror = ev => {
    const err = ev.error;
    if (err === 'not-allowed' || err === 'service-not-allowed') {
      setSrStatus('err', '✗ Microphone permission denied');
      toast('Microphone denied — check ' + (navigator.userAgent.includes('Edg') ? 'Edge' : 'Chrome') + ' site permissions', 'err');
      stopCapture();
    } else if (err === 'audio-capture') {
      setSrStatus('err', '✗ Microphone not accessible');
      toast('Microphone not accessible — check system default mic', 'err');
    } else if (err === 'network') {
      setSrStatus('warn', '⚠ Network error — retrying');
    } else if (err === 'no-speech') {
      setSrStatus('wait', '● Listening — say something or speak louder');
    } else if (err === 'aborted') {
      setSrStatus('wait', '● Restarting...');
    } else {
      setSrStatus('warn', '⚠ ' + err);
      toast('Recognition: ' + err, 'warn');
    }
  };

  _cap.recognition.onend = () => {
    if (_cap.running && !_cap.paused) {
      setTimeout(() => {
        if (_cap.running && !_cap.paused && _cap.recognition) {
          try { _cap.recognition.start(); }
          catch(e) { toast('Recognition restart failed: ' + e.message, 'warn'); }
        }
      }, 300);
    }
  };

  try {
    _cap.recognition.start();
    setSrStatus('start', '🎙 Microphone open — speak now to test');
  } catch(e) {
    toast('Recognition failed to start: ' + e.message, 'err');
    setSrStatus('err', '✗ Failed to start: ' + e.message);
  }
}

function setSrStatus(type, msg) {
  _cap._srStatus = msg;
  const el = _root && _root.querySelector('#cap-sr-status');
  if (el) {
    el.textContent = msg;
    el.style.color = type === 'err' ? '#e74c3c'
      : type === 'warn' ? 'var(--warn,#e8b867)'
      : type === 'speech' ? 'var(--lime,#d4ff3a)'
      : 'var(--ink-dim,#555)';
  }
}

function updateLive() {
  const tx = _root && _root.querySelector('#cap-tx');
  if (!tx) return;
  let html = '';
  _cap.lines.forEach(l => { html += `<div class="cap-line"><span class="cap-ts">[${l.time}]</span><span class="cap-txt">${esc(l.text)}</span></div>`; });
  if (_cap.interim) html += `<div class="cap-line interim"><span class="cap-ts">...</span><span class="cap-txt">${esc(_cap.interim)}</span></div>`;
  tx.innerHTML = html;
  tx.scrollTop = tx.scrollHeight;
}

function pauseCapture() {
  if (!_cap.running || _cap.paused) return;
  _cap.paused = true; _cap.interim = '';
  if (_cap.recognition) { try { _cap.recognition.stop(); } catch(e) {} }
  if (_cap.recorder && _cap.recorder.state === 'recording') { try { _cap.recorder.pause(); } catch(e) {} }
  toast('Session paused — enjoy your break');
  render();
}

function resumeCapture() {
  if (!_cap.paused) return;
  _cap.paused = false;
  if (_cap.recorder && _cap.recorder.state === 'paused') { try { _cap.recorder.resume(); } catch(e) {} }
  startRecognition();
  toast('Capture resumed');
  render();
}

function stopCapture() {
  _cap.running = false; _cap.paused = false;
  clearInterval(_cap.timer);
  if (_cap.recognition) { try { _cap.recognition.stop(); } catch(e) {} _cap.recognition = null; }
  if (_cap.keepalive)   { try { _cap.keepalive.stop();    } catch(e) {} _cap.keepalive   = null; }
  if (_cap.recorder && _cap.recorder.state !== 'inactive') _cap.recorder.stop();
  if (_cap.micStream) _cap.micStream.getTracks().forEach(t => t.stop());
  if (_cap.sysStream) _cap.sysStream.getTracks().forEach(t => t.stop());
  if (_cap.audioCtx)  { try { _cap.audioCtx.close(); } catch(e) {} _cap.audioCtx = null; }
  _cap.interim = '';
  /* Auto-save to sessions store */
  if (_cap.lines.length > 0) {
    const wc = _cap.lines.reduce((n, l) => n + l.text.split(' ').length, 0);
    saveSession({
      id: uid(),
      title: _cap.title || 'Session ' + new Date().toLocaleDateString('en-IN'),
      date: new Date().toLocaleDateString('en-IN'),
      createdAt: Date.now(),
      elapsed: _cap.elapsed,
      lines: [..._cap.lines],
      wordCount: wc
    });
    toast('Session saved — find it in Sessions tab');
  }
  render();
}

/* ── Build current session object ───────────────────────── */
function buildSession() {
  const wc = _cap.lines.reduce((n, l) => n + l.text.split(' ').length, 0);
  return {
    title: _cap.title || 'Session',
    date: new Date().toLocaleDateString('en-IN'),
    elapsed: _cap.elapsed,
    lines: _cap.lines,
    wordCount: wc
  };
}

/* ── Download TXT ───────────────────────────────────────── */
function downloadTxt(session) {
  if (!session.lines || !session.lines.length) { toast('No transcript', 'warn'); return; }
  const sep = '='.repeat(48);
  const text = `TRANSCRIPT: ${session.title}\nDate: ${session.date}\nDuration: ${fmt(session.elapsed)}\nSegments: ${session.lines.length}\nWords: ${session.wordCount.toLocaleString()}\n\n${sep}\n\n`
    + session.lines.map(l => `[${l.time}] ${l.text}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = session.title.replace(/\s+/g, '-').toLowerCase() + '-transcript.txt';
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('Transcript downloaded');
}

/* ── Download PPT ───────────────────────────────────────── */
function downloadPpt(session) {
  if (!session.lines || !session.lines.length) { toast('No transcript for PPT', 'warn'); return; }
  if (!window.PptxGenJS) { toast('PPT generator loading — try again in a moment', 'warn'); return; }
  toast('Generating PPT...');
  try {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9';
    pres.title = session.title;

    /* Slide 1 — Title */
    const s1 = pres.addSlide();
    s1.background = { color: '1B4F72' };
    s1.addText(session.title, { x: 0.7, y: 1.2, w: 8.6, h: 1.5, fontSize: 38, bold: true, color: 'FFFFFF', fontFace: 'Calibri', valign: 'middle' });
    s1.addText(`${session.date}   |   Duration: ${fmt(session.elapsed)}   |   ${session.lines.length} segments`,
      { x: 0.7, y: 2.95, w: 8.6, h: 0.5, fontSize: 15, color: 'A9CCE3', fontFace: 'Calibri' });
    s1.addText('Captured by SmartApp — ScreenAudioCapture',
      { x: 0.7, y: 4.9, w: 8.6, h: 0.4, fontSize: 11, color: '5D8DB0', fontFace: 'Calibri' });

    /* Slide 2 — Overview */
    const s2 = pres.addSlide();
    s2.background = { color: 'FFFFFF' };
    s2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.1, h: 5.625, fill: { color: '1B4F72' } });
    s2.addText('SESSION OVERVIEW', { x: 0.4, y: 0.25, w: 9.2, h: 0.6, fontSize: 22, bold: true, color: '1B4F72', fontFace: 'Calibri', margin: 0 });
    s2.addText([
      { text: `Date: ${session.date}`,                              options: { bullet: { color: 'E91E8C' }, breakLine: true, paraSpaceAfter: 6 } },
      { text: `Duration: ${fmt(session.elapsed)}`,                  options: { bullet: { color: 'E91E8C' }, breakLine: true, paraSpaceAfter: 6 } },
      { text: `Total Segments: ${session.lines.length}`,            options: { bullet: { color: 'E91E8C' }, breakLine: true, paraSpaceAfter: 6 } },
      { text: `Total Words: ${session.wordCount.toLocaleString()}`,  options: { bullet: { color: 'E91E8C' }, breakLine: true, paraSpaceAfter: 6 } },
      { text: 'Source: SmartApp — ScreenAudioCapture',               options: { bullet: { color: 'E91E8C' }, paraSpaceAfter: 6 } },
    ], { x: 0.5, y: 1.1, w: 9.0, h: 4.2, fontSize: 16, color: '2C3E50', fontFace: 'Calibri', valign: 'top' });

    /* Transcript slides — 6 per slide */
    const PER = 6;
    for (let i = 0; i < session.lines.length; i += PER) {
      const chunk = session.lines.slice(i, i + PER);
      const sN = pres.addSlide();
      sN.background = { color: 'FFFFFF' };
      sN.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.1, h: 5.625, fill: { color: '1B4F72' } });
      const pg = Math.floor(i / PER) + 1;
      const tot = Math.ceil(session.lines.length / PER);
      sN.addText('TRANSCRIPT', { x: 0.4, y: 0.2, w: 7.5, h: 0.55, fontSize: 20, bold: true, color: '1B4F72', fontFace: 'Calibri', margin: 0 });
      sN.addText(`${pg} / ${tot}`, { x: 8.8, y: 0.2, w: 1.0, h: 0.5, fontSize: 12, color: '95A5A6', align: 'right', fontFace: 'Calibri' });
      const items = chunk.map((line, j) => ({
        text: `[${line.time}]  ${line.text}`,
        options: { bullet: { color: 'E91E8C' }, breakLine: j < chunk.length - 1, paraSpaceAfter: 5 }
      }));
      sN.addText(items, { x: 0.4, y: 0.95, w: 9.2, h: 4.35, fontSize: 13, color: '2C3E50', fontFace: 'Calibri', valign: 'top' });
    }

    const fname = session.title.replace(/\s+/g, '-').toLowerCase() + '-session.pptx';
    pres.write({ outputType: 'blob' }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('PPT downloaded');
    });
  } catch(e) { toast('PPT failed: ' + e.message, 'err'); }
}

/* ── Module export ──────────────────────────────────────── */
export default {
  id: 'capture',
  name: 'ScreenAudioCapture',
  tagline: 'RECORD · TRANSCRIPT · DOWNLOAD',
  status: 'ready',

  render(root) {
    _root = root;
    _tab = 'record';
    render();
  },

  cleanup() {
    if (_cap.running || _cap.paused) stopCapture();
  },
};
