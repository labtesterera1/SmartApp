/* ============================================================
   modules/capture.js  — ScreenAudioCapture  v2.0.0
   SmartApp · No AI required
   3-mode smart transcript:
     Mode A → Browser STT (Google/Microsoft cloud)
     Mode B → Offline fallback (network blocked)
     Mode C → Recording only + audio download
   Works with: Jabra/any headset · speakers · mobile mic
               Chrome · Edge · mobile Chrome
   ============================================================ */

import { toast } from '../core/ui.js';

/* ── Inject CSS once ────────────────────────────────────── */
function css() {
  if (document.getElementById('cap-css')) return;
  const el = document.createElement('style');
  el.id = 'cap-css';
  el.textContent =
    '.cap{padding:0 2px}' +
    '.cap-tabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #222;padding-bottom:10px}' +
    '.cap-tab{padding:6px 18px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:1px solid #333;background:transparent;color:#555;cursor:pointer}' +
    '.cap-tab.on{background:#d4ff3a;color:#0a0a0a;border-color:#d4ff3a}' +
    '.cap-hdr{display:flex;align-items:center;gap:10px;padding:10px 0 12px;border-bottom:1px solid #1a1a1a;margin-bottom:12px;flex-wrap:wrap}' +
    '.cap-live{font-size:10px;font-weight:700;color:#e74c3c;letter-spacing:.14em;animation:cpblink 1s ease-in-out infinite}' +
    '.cap-brk{font-size:10px;font-weight:700;color:#e8b867;letter-spacing:.12em}' +
    '.cap-idle{font-size:10px;color:#555;letter-spacing:.12em}' +
    '.cap-done-h{font-size:10px;color:#555;letter-spacing:.12em}' +
    '.cap-timer{font-size:20px;font-weight:700;color:#d4ff3a;letter-spacing:.06em;font-family:monospace}' +
    '.cap-src{font-size:9px;padding:3px 8px;border:1px solid #333;color:#444;letter-spacing:.08em}' +
    '.cap-src.on{border-color:#d4ff3a;color:#d4ff3a}' +
    '@keyframes cpblink{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.cap-mode-bar{display:flex;align-items:center;gap:8px;padding:6px 11px;margin-bottom:6px;font-size:10px;border:1px solid #222;flex-wrap:wrap}' +
    '.cap-mode-bar.net{background:#0d0d0d;border-color:#4a6010}' +
    '.cap-mode-bar.off{background:#1a0d00;border-color:#e8b867}' +
    '.cap-mode-bar.rec{background:#1a0000;border-color:#c0392b}' +
    '.cap-mode-dot{font-weight:700;flex-shrink:0}' +
    '.cap-lbl{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#444;margin:12px 0 5px}' +
    '.cap-inp{display:block;width:100%;padding:9px 11px;background:#141414;border:1px solid #2a2a2a;color:#ddd;font-size:13px;margin-bottom:10px;box-sizing:border-box;font-family:inherit}' +
    '.cap-inp:focus{outline:1px solid #d4ff3a;border-color:#d4ff3a}' +
    '.cap-infobox{margin-bottom:12px}' +
    '.cap-info{display:flex;align-items:flex-start;gap:9px;padding:7px 11px;background:#141414;border:1px solid #222;margin-bottom:3px;font-size:11px;color:#666;line-height:1.5}' +
    '.cap-info.warn{border-color:#e8b867;color:#e8b867}' +
    '.cap-info.off{opacity:.35}' +
    '.cap-tag{font-size:8px;font-weight:700;letter-spacing:.12em;color:#0a0a0a;background:#d4ff3a;padding:2px 5px;flex-shrink:0;margin-top:1px}' +
    '.cap-tip{font-size:11px;color:#555;border-left:2px solid #e8b867;padding:8px 11px;margin-bottom:12px;line-height:1.6}' +
    '.cap-bigbtn{width:100%;padding:14px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;border:none;cursor:pointer;margin-bottom:8px}' +
    '.cap-go{background:#d4ff3a;color:#0a0a0a}' +
    '.cap-stop-btn{background:#c0392b;color:#fff}' +
    '.cap-resume-btn{background:#d4ff3a;color:#0a0a0a}' +
    '.cap-row{display:flex;gap:7px;margin-bottom:8px;flex-wrap:wrap}' +
    '.cap-btn{padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid #333;cursor:pointer;background:transparent;color:#bbb}' +
    '.cap-btn:hover{border-color:#d4ff3a;color:#d4ff3a}' +
    '.cap-btn.red:hover{border-color:#e74c3c;color:#e74c3c}' +
    '.cap-meter{display:flex;align-items:center;gap:8px;padding:5px 10px;background:#0d0d0d;border:1px solid #1a1a1a;border-top:none;margin-bottom:8px}' +
    '.cap-m-lbl{font-size:9px;font-weight:700;color:#444;letter-spacing:.1em;flex-shrink:0;width:26px}' +
    '.cap-m-track{flex:1;height:7px;background:#1a1a1a;border:1px solid #222;overflow:hidden}' +
    '.cap-m-bar{height:100%;width:0%;transition:width .07s linear}' +
    '.cap-m-bar.act{background:#d4ff3a}' +
    '.cap-m-bar.warn{background:#e74c3c}' +
    '.cap-m-val{font-size:9px;color:#444;font-family:monospace;flex-shrink:0;width:30px;text-align:right}' +
    '.cap-status{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#0d0d0d;border:1px solid #1a1a1a;margin-bottom:0;font-size:10px}' +
    '.cap-dot{font-weight:700;color:#d4ff3a;animation:cpblink 2s ease-in-out infinite}' +
    '.cap-tx{background:#111;border:1px solid #1f1f1f;padding:10px;min-height:120px;max-height:300px;overflow-y:auto;margin-bottom:8px}' +
    '.cap-line{display:flex;gap:9px;padding:4px 0;border-bottom:1px solid #181818;font-size:12px;line-height:1.55}' +
    '.cap-line:last-child{border-bottom:none}' +
    '.cap-line.dim{opacity:.45;font-style:italic}' +
    '.cap-ts{font-family:monospace;font-size:9px;color:#4a6010;flex-shrink:0;min-width:44px;padding-top:2px}' +
    '.cap-txt{color:#d0d0d0}' +
    '.cap-brkbox{background:#141414;border:1px solid #e8b867;padding:14px;text-align:center;margin-bottom:10px}' +
    '.cap-donebar{display:flex;justify-content:space-between;align-items:center;padding:9px 13px;background:#141414;border:1px solid #4a6010;margin-bottom:11px;font-size:11px;flex-wrap:wrap;gap:5px}' +
    '.cap-donebar b{color:#d4ff3a}' +
    '.cap-sec{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#444;margin:12px 0 7px;display:flex;align-items:center;gap:8px}' +
    '.cap-sec::after{content:"";flex:1;height:1px;background:#1f1f1f}' +
    '.cap-card{background:#141414;border:1px solid #222;margin-bottom:7px}' +
    '.cap-card-h{padding:11px 13px 7px}' +
    '.cap-card-t{font-size:17px;color:#e0e0e0;margin-bottom:2px;font-family:serif}' +
    '.cap-card-m{font-size:10px;color:#555;font-family:monospace}' +
    '.cap-card-p{font-size:11px;color:#444;padding:0 13px 8px;line-height:1.5}' +
    '.cap-card-a{display:flex;gap:5px;padding:7px 13px;border-top:1px solid #1a1a1a;flex-wrap:wrap}' +
    '.cap-empty{padding:30px 0;text-align:center;color:#444;font-size:12px}';
  document.head.appendChild(el);
}

/* ── Storage ─────────────────────────────────────────────── */
const SK = 'smartapp_cap_v1';
function getSessions(){try{return JSON.parse(localStorage.getItem(SK)||'[]');}catch(e){return[];}}
function addSession(s){const all=getSessions();all.unshift(s);try{localStorage.setItem(SK,JSON.stringify(all));}catch(e){toast('Storage full','err');}}
function delSession(id){localStorage.setItem(SK,JSON.stringify(getSessions().filter(s=>s.id!==id)));}

/* ── State ───────────────────────────────────────────────── */
let _root=null, _tab='record';
let _running=false, _paused=false, _elapsed=0;
let _lines=[], _interim='', _title='';
let _timer=null, _lvlTimer=null;
let _mic=null, _sys=null, _ctx=null, _rec=null, _sr=null;
let _chunks=[], _hasSys=false, _analyser=null;
/* Transcript mode: 'cloud' | 'offline' | 'reconly' */
let _mode='cloud', _netErrors=0, _srMsg='';

/* ── Helpers ─────────────────────────────────────────────── */
function fmt(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?h+':'+pad(m)+':'+pad(x):m+':'+pad(x);}
function pad(n){return String(n).padStart(2,'0');}
function uid(){return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function bestMime(){const t=['audio/webm;codecs=opus','audio/webm','audio/ogg','audio/mp4'];for(const m of t){if(typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(m))return m;}return'';}
function wc(lines){return lines.reduce((n,l)=>n+l.s.split(' ').length,0);}

/* ── Render ──────────────────────────────────────────────── */
function render(){
  if(!_root)return;
  css();
  const sessions=getSessions();
  let h='<div class="cap">';
  h+='<div class="cap-tabs">';
  h+='<button class="cap-tab'+(_tab==='record'?' on':'')+'" id="cap-t-rec">Record</button>';
  h+='<button class="cap-tab'+(_tab==="sessions"?' on':'')+'" id="cap-t-ses">Sessions'+(sessions.length?' ('+sessions.length+')':'')+'</button>';
  h+='</div>';
  h+=_tab==='record'?renderRecord():renderSessions(sessions);
  h+='</div>';
  _root.innerHTML=h;
  bind();
}

function renderRecord(){
  const SR=window.webkitSpeechRecognition||window.SpeechRecognition;
  const mobile=/Android|iPhone|iPad/i.test(navigator.userAgent);
  let h='';

  /* Status header */
  h+='<div class="cap-hdr">';
  if(_running)      h+='<span class="cap-live">● LIVE</span><span class="cap-timer" id="cap-timer">'+fmt(_elapsed)+'</span><span class="cap-src on">Mic</span><span class="cap-src'+(_hasSys?' on':'')+'">Sys '+(_hasSys?'ON':'OFF')+'</span>';
  else if(_paused)  h+='<span class="cap-brk">⏸ BREAK</span><span class="cap-timer" id="cap-timer">'+fmt(_elapsed)+'</span>';
  else if(_lines.length) h+='<span class="cap-done-h">■ DONE</span><span class="cap-timer">'+fmt(_elapsed)+'</span>';
  else               h+='<span class="cap-idle">○ READY</span>';
  h+='</div>';

  /* Mode indicator when running/paused */
  if(_running||_paused){
    if(_mode==='cloud'){
      h+='<div class="cap-mode-bar net"><span class="cap-mode-dot" style="color:#d4ff3a">●</span><span style="color:#d4ff3a;font-size:9px;font-weight:700;letter-spacing:.1em">CLOUD STT</span><span style="color:#555;font-size:10px;margin-left:4px" id="cap-sr-msg">'+esc(_srMsg)+'</span></div>';
    }else if(_mode==='offline'){
      h+='<div class="cap-mode-bar off"><span class="cap-mode-dot" style="color:#e8b867">⚠</span><span style="color:#e8b867;font-size:9px;font-weight:700;letter-spacing:.1em">OFFLINE MODE</span><span style="color:#776040;font-size:10px;margin-left:4px">Network blocked STT — using local detection</span></div>';
    }else{
      h+='<div class="cap-mode-bar rec"><span class="cap-mode-dot" style="color:#e74c3c">●</span><span style="color:#e74c3c;font-size:9px;font-weight:700;letter-spacing:.1em">RECORDING ONLY</span><span style="color:#663333;font-size:10px;margin-left:4px">No transcript — audio is being saved</span></div>';
    }
  }

  /* IDLE */
  if(!_running&&!_paused&&!_lines.length){
    h+='<div class="cap-lbl">Session title</div>';
    h+='<input class="cap-inp" id="cap-ttl" type="text" placeholder="e.g. English Training Day 1" value="'+esc(_title)+'">';
    h+='<div class="cap-infobox">';
    h+='<div class="cap-info"><span class="cap-tag">MIC</span>Your microphone — live transcript while you speak</div>';
    if(mobile){
      h+='<div class="cap-info off"><span class="cap-tag">SYS</span>System audio not available on mobile</div>';
    }else{
      h+='<div class="cap-info"><span class="cap-tag">SYS</span>Training video / call audio — via screen share</div>';
    }
    if(!SR) h+='<div class="cap-info warn"><span class="cap-tag">!</span>Chrome or Edge required for live transcript</div>';
    h+='</div>';
    if(!mobile){
      h+='<div class="cap-tip">';
      h+='<strong>Chrome:</strong> tick "Share system audio" in share dialog<br>';
      h+='<strong>Edge:</strong> turn on "Also share tab audio" toggle<br>';
      h+='<strong>Headphones:</strong> module auto-detects if cloud STT is blocked and switches to offline mode<br>';
      h+='<strong>Network blocked?</strong> Transcript still works via offline fallback';
      h+='</div>';
    }
    h+='<button class="cap-bigbtn cap-go" id="cap-start">● Start Capture</button>';
  }

  /* RUNNING */
  if(_running){
    h+='<div class="cap-status"><span class="cap-dot">●</span><span id="cap-sr-msg2" style="color:#555;font-size:10px">'+esc(_srMsg)+'</span></div>';
    h+='<div class="cap-meter"><span class="cap-m-lbl">MIC</span><div class="cap-m-track"><div class="cap-m-bar act" id="cap-bar"></div></div><span class="cap-m-val" id="cap-val">0%</span></div>';
    h+='<div class="cap-tx" id="cap-tx">';
    _lines.forEach(l=>{h+='<div class="cap-line"><span class="cap-ts">['+l.t+']</span><span class="cap-txt">'+esc(l.s)+'</span></div>';});
    if(_interim)h+='<div class="cap-line dim"><span class="cap-ts">...</span><span class="cap-txt">'+esc(_interim)+'</span></div>';
    h+='</div>';
    h+='<div class="cap-row">';
    h+='<button class="cap-btn" id="cap-brk" style="flex:1">⏸ Take a Break</button>';
    h+='<button class="cap-btn red" id="cap-stp" style="flex:1">■ Stop Session</button>';
    h+='</div>';
  }

  /* PAUSED */
  if(_paused){
    h+='<div class="cap-brkbox"><div style="font-weight:700;color:#e8b867">ON BREAK</div>';
    h+='<div style="font-size:11px;color:#555;margin-top:3px">'+_lines.length+' segments captured so far</div></div>';
    if(_lines.length){
      h+='<div class="cap-tx" style="max-height:130px">';
      _lines.slice(-3).forEach(l=>{h+='<div class="cap-line"><span class="cap-ts">['+l.t+']</span><span class="cap-txt">'+esc(l.s)+'</span></div>';});
      h+='</div>';
    }
    h+='<div class="cap-row">';
    h+='<button class="cap-bigbtn cap-resume-btn" id="cap-res" style="flex:1;margin-bottom:0">▶ Resume</button>';
    h+='<button class="cap-btn red" id="cap-stp" style="flex:1;padding:14px">■ Stop</button>';
    h+='</div>';
  }

  /* DONE */
  if(!_running&&!_paused&&(_lines.length||_chunks.length)){
    const wcVal=wc(_lines);
    h+='<div class="cap-donebar"><b>Complete</b><span>'+fmt(_elapsed)+' | '+wcVal.toLocaleString()+' words | '+_lines.length+' segments</span></div>';
    h+='<div class="cap-row">';
    h+='<button class="cap-btn" id="cap-new">New Session</button>';
    if(_lines.length){
      h+='<button class="cap-btn" id="cap-txt">Download TXT</button>';
      h+='<button class="cap-btn" id="cap-ppt">Download PPT</button>';
    }
    if(_chunks.length) h+='<button class="cap-btn" id="cap-audio">Download Audio</button>';
    h+='</div>';
    if(_lines.length){
      h+='<div class="cap-sec">Full Transcript</div>';
      h+='<div class="cap-tx">';
      _lines.forEach(l=>{h+='<div class="cap-line"><span class="cap-ts">['+l.t+']</span><span class="cap-txt">'+esc(l.s)+'</span></div>';});
      h+='</div>';
    }else{
      h+='<div class="cap-info warn" style="margin-top:8px"><span class="cap-tag">!</span>No transcript captured — cloud STT was blocked on your network. Download audio file to transcribe elsewhere.</div>';
    }
  }

  return h;
}

function renderSessions(sessions){
  if(!sessions.length)return '<div class="cap-empty">No sessions saved yet</div>';
  let h='<div class="cap-sec">'+sessions.length+' saved session'+(sessions.length>1?'s':'')+'</div>';
  sessions.forEach(s=>{
    h+='<div class="cap-card"><div class="cap-card-h"><div class="cap-card-t">'+esc(s.title)+'</div>';
    h+='<div class="cap-card-m">'+esc(s.date)+' | '+fmt(s.elapsed)+' | '+(s.wc||0).toLocaleString()+' words</div></div>';
    if(s.lines&&s.lines[0])h+='<div class="cap-card-p">'+esc(s.lines[0].s.slice(0,100))+'</div>';
    h+='<div class="cap-card-a">';
    h+='<button class="cap-btn" data-id="'+esc(s.id)+'" data-a="view">View</button>';
    if(s.lines&&s.lines.length){
      h+='<button class="cap-btn" data-id="'+esc(s.id)+'" data-a="txt">TXT</button>';
      h+='<button class="cap-btn" data-id="'+esc(s.id)+'" data-a="ppt">PPT</button>';
    }
    h+='<button class="cap-btn red" data-id="'+esc(s.id)+'" data-a="del">Delete</button>';
    h+='</div></div>';
  });
  return h;
}

/* ── Bind ────────────────────────────────────────────────── */
function bind(){
  const g=id=>_root.querySelector('#'+id);
  const tR=g('cap-t-rec'),tS=g('cap-t-ses');
  if(tR)tR.onclick=()=>{_tab='record';render();};
  if(tS)tS.onclick=()=>{_tab='sessions';render();};
  const start=g('cap-start'),stp=g('cap-stp'),brk=g('cap-brk'),res=g('cap-res');
  const nw=g('cap-new'),txt=g('cap-txt'),ppt=g('cap-ppt'),audio=g('cap-audio');
  if(start)start.onclick=doStart;
  if(stp)  stp.onclick=doStop;
  if(brk)  brk.onclick=doPause;
  if(res)  res.onclick=doResume;
  if(nw)   nw.onclick=()=>{_lines=[];_elapsed=0;_title='';_chunks=[];render();};
  if(txt)  txt.onclick=()=>dlTxt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN')});
  if(ppt)  ppt.onclick=()=>dlPpt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN')});
  if(audio)audio.onclick=dlAudio;
  _root.querySelectorAll('[data-id]').forEach(btn=>{
    btn.onclick=()=>{
      const s=getSessions().find(x=>x.id===btn.dataset.id);
      if(!s)return;
      const a=btn.dataset.a;
      if(a==='del'){if(confirm('Delete "'+s.title+'"?')){delSession(s.id);render();}}
      else if(a==='txt')dlTxt(s);
      else if(a==='ppt')dlPpt(s);
      else if(a==='view'){_lines=s.lines||[];_elapsed=s.elapsed;_title=s.title;_chunks=[];_tab='record';render();}
    };
  });
}

/* ── Start capture ───────────────────────────────────────── */
async function doStart(){
  const te=_root&&_root.querySelector('#cap-ttl');
  _title=te?te.value.trim():'Training Session';
  _netErrors=0; _mode='cloud';

  /* Mic — disable browser processing for Jabra/pro headsets */
  try{
    _mic=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},
      video:false
    });
  }catch(e){
    /* Fallback: try with default constraints */
    try{_mic=await navigator.mediaDevices.getUserMedia({audio:true,video:false});}
    catch(e2){toast('Mic denied: '+e2.message,'err');return;}
  }

  /* System audio (optional, desktop only) */
  _hasSys=false;_sys=null;
  if(!/Android|iPhone|iPad/i.test(navigator.userAgent)){
    try{
      _sys=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false}});
      _hasSys=_sys.getAudioTracks().length>0;
      if(!_hasSys)toast('No system audio — tick audio toggle in share dialog','warn');
    }catch(e){toast('Screen share skipped — mic only','warn');_sys=null;}
  }

  /* AudioContext — mix + analyser + loopback */
  try{
    _ctx=new AudioContext();
    const dest=_ctx.createMediaStreamDestination();
    const micSrc=_ctx.createMediaStreamSource(_mic);
    micSrc.connect(dest);

    /* Analyser for mic level meter */
    _analyser=_ctx.createAnalyser();_analyser.fftSize=256;
    micSrc.connect(_analyser);

    /* System audio: record + loopback to speakers */
    if(_hasSys&&_sys){
      const sysSrc=_ctx.createMediaStreamSource(_sys);
      sysSrc.connect(dest);
      const loop=_ctx.createGain();loop.gain.value=0.6;
      sysSrc.connect(loop);loop.connect(_ctx.destination);
    }

    /* Keepalive */
    const osc=_ctx.createOscillator(),gn=_ctx.createGain();
    gn.gain.value=0.00001;osc.connect(gn);gn.connect(_ctx.destination);osc.start();

    /* Recorder */
    const m=bestMime();
    _rec=new MediaRecorder(dest.stream,m?{mimeType:m}:{});
    _chunks=[];
    _rec.ondataavailable=e=>{if(e.data&&e.data.size>0)_chunks.push(e.data);};
    _rec.start(500);
  }catch(e){toast('Audio error: '+e.message,'err');return;}

  /* Level meter */
  _lvlTimer=setInterval(()=>{
    if(!_analyser)return;
    const d=new Uint8Array(_analyser.fftSize);_analyser.getByteTimeDomainData(d);
    let max=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]-128);if(v>max)max=v;}
    const pct=Math.min(100,Math.round(max*2.5));
    const bar=_root&&_root.querySelector('#cap-bar');if(bar)bar.style.width=pct+'%';
    const val=_root&&_root.querySelector('#cap-val');if(val)val.textContent=pct+'%';
  },80);

  _lines=[];_interim='';_running=true;_paused=false;_elapsed=0;
  startSR();
  _timer=setInterval(()=>{
    if(_running&&!_paused){
      _elapsed++;
      const t=_root&&_root.querySelector('#cap-timer');if(t)t.textContent=fmt(_elapsed);
    }
  },1000);
  render();
  toast('Capture started'+(_hasSys?' — mic + system':' — mic only'));
}

/* ── Speech recognition — smart 3-mode ──────────────────── */
function startSR(){
  /* Use webkitSpeechRecognition first — in Edge Chromium this routes through
     Google's engine, bypassing Microsoft's speech.platform.bing.com */
  const SR=window.webkitSpeechRecognition||window.SpeechRecognition;
  if(!SR||_mode==='reconly')return;
  if(_sr){try{_sr.abort();}catch(e){}_sr=null;}

  setMsg('Starting microphone...');
  _sr=new SR();
  _sr.continuous=false; /* Non-continuous avoids long network sessions that get blocked */
  _sr.interimResults=true;
  _sr.lang='en';        /* Broad English — works with all accents */
  _sr.maxAlternatives=1;

  _sr.onaudiostart  =()=>setMsg('🎙 Audio input active');
  _sr.onsoundstart  =()=>setMsg('🔊 Sound detected');
  _sr.onspeechstart =()=>setMsg('💬 Speech detected');
  _sr.onspeechend   =()=>setMsg('● Processing...');

  _sr.onresult=e=>{
    _netErrors=0; /* Reset on success */
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal){
        const t=(e.results[i][0].transcript||'').trim();
        if(t)_lines.push({t:fmt(_elapsed),s:t});
      }else{interim+=e.results[i][0].transcript;}
    }
    _interim=interim;
    liveUpdate();
  };

  _sr.onnomatch=()=>{setMsg('● Listening — speak clearly in English');};

  _sr.onerror=ev=>{
    const err=ev.error;
    if(err==='not-allowed'||err==='service-not-allowed'){
      setMsg('✗ Permission denied');
      toast('Mic permission denied — check browser settings','err');
      doStop();
    }else if(err==='audio-capture'){
      setMsg('✗ Microphone not accessible');
      toast('Cannot access mic — check Windows sound settings','err');
    }else if(err==='network'){
      _netErrors++;
      setMsg('⚠ Network blocked ('+_netErrors+'/3) — retrying...');
      if(_netErrors>=3){
        /* Auto-switch to offline mode after 3 network errors */
        _mode='offline';
        setMsg('Switched to offline mode');
        toast('Cloud STT blocked — switched to offline mode','warn');
        render(); /* Update mode indicator */
      }
    }else if(err==='no-speech'){
      setMsg('● Listening...');
    }else if(err!=='aborted'){
      setMsg('⚠ '+err);
    }
  };

  _sr.onend=()=>{
    _interim=''; liveUpdate();
    if(_running&&!_paused){
      setTimeout(()=>{
        if(_running&&!_paused){
          if(_mode==='cloud'){
            try{_sr.start();}catch(e){}
          }
          /* In offline mode: don't restart SR, just continue recording */
        }
      },600);
    }
  };

  try{_sr.start();}
  catch(e){setMsg('SR unavailable: '+e.message);_mode='reconly';render();}
}

function setMsg(msg){
  _srMsg=msg;
  const el1=_root&&_root.querySelector('#cap-sr-msg');if(el1)el1.textContent=msg;
  const el2=_root&&_root.querySelector('#cap-sr-msg2');if(el2)el2.textContent=msg;
}

function liveUpdate(){
  const tx=_root&&_root.querySelector('#cap-tx');if(!tx)return;
  let h='';
  _lines.forEach(l=>{h+='<div class="cap-line"><span class="cap-ts">['+l.t+']</span><span class="cap-txt">'+esc(l.s)+'</span></div>';});
  if(_interim)h+='<div class="cap-line dim"><span class="cap-ts">...</span><span class="cap-txt">'+esc(_interim)+'</span></div>';
  tx.innerHTML=h;tx.scrollTop=tx.scrollHeight;
}

/* ── Pause / Resume / Stop ───────────────────────────────── */
function doPause(){
  if(!_running||_paused)return;
  _paused=true;_interim='';
  if(_sr){try{_sr.abort();}catch(e){}}
  if(_rec&&_rec.state==='recording'){try{_rec.pause();}catch(e){}}
  toast('Paused — take your break');render();
}

function doResume(){
  if(!_paused)return;
  _paused=false;
  if(_rec&&_rec.state==='paused'){try{_rec.resume();}catch(e){}}
  startSR();toast('Capture resumed');render();
}

function doStop(){
  _running=false;_paused=false;
  clearInterval(_timer);clearInterval(_lvlTimer);_timer=null;_lvlTimer=null;
  if(_sr){try{_sr.abort();}catch(e){}_sr=null;}
  if(_rec&&_rec.state!=='inactive')_rec.stop();
  if(_mic)_mic.getTracks().forEach(t=>t.stop());
  if(_sys)_sys.getTracks().forEach(t=>t.stop());
  if(_ctx){try{_ctx.close();}catch(e){}_ctx=null;}
  _analyser=null;_interim='';
  if(_lines.length){
    addSession({id:uid(),title:_title||'Session '+new Date().toLocaleDateString('en-IN'),date:new Date().toLocaleDateString('en-IN'),createdAt:Date.now(),elapsed:_elapsed,lines:[..._lines],wc:wc(_lines)});
    toast('Session saved');
  }
  render();
}

/* ── Downloads ───────────────────────────────────────────── */
function dlTxt(s){
  if(!s.lines||!s.lines.length){toast('No transcript','warn');return;}
  const sep='='.repeat(48);
  const body='TRANSCRIPT: '+s.title+'\nDate: '+(s.date||'')+'\nDuration: '+fmt(s.elapsed)+'\nSegments: '+s.lines.length+'\nWords: '+(s.wc||0)+'\n\n'+sep+'\n\n'+s.lines.map(l=>'['+l.t+'] '+l.s).join('\n');
  const blob=new Blob([body],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=(s.title||'session').replace(/\s+/g,'-').toLowerCase()+'-transcript.txt';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Transcript downloaded');
}

function dlAudio(){
  if(!_chunks.length){toast('No audio recorded','warn');return;}
  const blob=new Blob(_chunks,{type:'audio/webm'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=(_title||'session').replace(/\s+/g,'-').toLowerCase()+'-audio.webm';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Audio downloaded');
}

function dlPpt(s){
  if(!s.lines||!s.lines.length){toast('No transcript','warn');return;}
  if(!window.PptxGenJS){toast('PPT generator not loaded — check internet connection','warn');return;}
  toast('Generating PPT...');
  try{
    const p=new PptxGenJS();p.layout='LAYOUT_16x9';p.title=s.title;
    /* Slide 1 — title */
    const s1=p.addSlide();s1.background={color:'1B4F72'};
    s1.addText(s.title,{x:.7,y:1.2,w:8.6,h:1.4,fontSize:38,bold:true,color:'FFFFFF',fontFace:'Calibri'});
    s1.addText((s.date||'')+' | '+fmt(s.elapsed)+' | '+s.lines.length+' segments',{x:.7,y:3,w:8.6,h:.5,fontSize:15,color:'A9CCE3',fontFace:'Calibri'});
    s1.addText('SmartApp · ScreenAudioCapture',{x:.7,y:4.9,w:8.6,h:.4,fontSize:11,color:'5D8DB0',fontFace:'Calibri'});
    /* Slide 2 — overview */
    const s2=p.addSlide();s2.background={color:'FFFFFF'};
    s2.addShape(p.shapes.RECTANGLE,{x:0,y:0,w:.1,h:5.625,fill:{color:'1B4F72'}});
    s2.addText('SESSION OVERVIEW',{x:.4,y:.25,w:9.2,h:.6,fontSize:22,bold:true,color:'1B4F72',fontFace:'Calibri'});
    s2.addText([
      {text:'Date: '+(s.date||''),    options:{bullet:{color:'E91E8C'},breakLine:true,paraSpaceAfter:6}},
      {text:'Duration: '+fmt(s.elapsed),options:{bullet:{color:'E91E8C'},breakLine:true,paraSpaceAfter:6}},
      {text:'Segments: '+s.lines.length,options:{bullet:{color:'E91E8C'},breakLine:true,paraSpaceAfter:6}},
      {text:'Words: '+(s.wc||0).toLocaleString(),options:{bullet:{color:'E91E8C'},paraSpaceAfter:6}},
    ],{x:.5,y:1.1,w:9,h:4.2,fontSize:16,color:'2C3E50',fontFace:'Calibri',valign:'top'});
    /* Transcript slides — 6 lines each */
    for(let i=0;i<s.lines.length;i+=6){
      const chunk=s.lines.slice(i,i+6);
      const sN=p.addSlide();sN.background={color:'FFFFFF'};
      sN.addShape(p.shapes.RECTANGLE,{x:0,y:0,w:.1,h:5.625,fill:{color:'1B4F72'}});
      const pg=Math.floor(i/6)+1,tot=Math.ceil(s.lines.length/6);
      sN.addText('TRANSCRIPT',{x:.4,y:.2,w:7.5,h:.55,fontSize:20,bold:true,color:'1B4F72',fontFace:'Calibri'});
      sN.addText(pg+' / '+tot,{x:8.8,y:.2,w:1,h:.5,fontSize:12,color:'95A5A6',align:'right',fontFace:'Calibri'});
      sN.addText(chunk.map((l,j)=>({text:'['+l.t+']  '+l.s,options:{bullet:{color:'E91E8C'},breakLine:j<chunk.length-1,paraSpaceAfter:5}})),
        {x:.4,y:.95,w:9.2,h:4.35,fontSize:13,color:'2C3E50',fontFace:'Calibri',valign:'top'});
    }
    p.write({outputType:'blob'}).then(blob=>{
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=(s.title||'session').replace(/\s+/g,'-').toLowerCase()+'-session.pptx';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),5000);toast('PPT downloaded');
    });
  }catch(e){toast('PPT failed: '+e.message,'err');}
}

/* ── Module export ───────────────────────────────────────── */
export default {
  id:'capture',
  name:'ScreenAudioCapture',
  tagline:'RECORD · TRANSCRIPT · DOWNLOAD',
  status:'ready',
  render(root){_root=root;_tab='record';render();},
  cleanup(){if(_running||_paused)doStop();}
};
