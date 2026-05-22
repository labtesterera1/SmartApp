/* ============================================================
   ScreenAudioCapture v4.0 — SmartApp
   Speaker cards · Speaker detection · Startup sequence
   10-second segments · Connection break · Size warnings
   Session merge · File upload transcription
   ============================================================ */
import { toast } from '../core/ui.js';

/* ── CSS ─────────────────────────────────────────────────── */
function injectCSS(){
  if(document.getElementById('cap-css'))return;
  const s=document.createElement('style');s.id='cap-css';
  s.textContent=
    '.cap{padding:0 2px}'+
    '.cap-tabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #222;padding-bottom:10px}'+
    '.cap-tab{padding:6px 18px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:1px solid #333;background:transparent;color:#555;cursor:pointer}'+
    '.cap-tab.on{background:#d4ff3a;color:#0a0a0a;border-color:#d4ff3a}'+
    /* header */
    '.cap-hdr{display:flex;align-items:center;gap:10px;padding:10px 0 12px;border-bottom:1px solid #1a1a1a;margin-bottom:12px;flex-wrap:wrap}'+
    '.cap-live{font-size:10px;font-weight:700;color:#e74c3c;letter-spacing:.14em;animation:cpblink 1s ease-in-out infinite}'+
    '.cap-brk{font-size:10px;font-weight:700;color:#e8b867;letter-spacing:.12em}'+
    '.cap-idle{font-size:10px;color:#555;letter-spacing:.12em}'+
    '.cap-done-h{font-size:10px;color:#555;letter-spacing:.12em}'+
    '.cap-timer{font-size:20px;font-weight:700;color:#d4ff3a;letter-spacing:.06em;font-family:monospace}'+
    '.cap-src{font-size:9px;padding:3px 8px;border:1px solid #333;color:#444;letter-spacing:.08em}'+
    '.cap-src.on{border-color:#d4ff3a;color:#d4ff3a}'+
    '.cap-spk-badge{font-size:9px;padding:2px 8px;border-radius:20px;font-weight:700;letter-spacing:.06em}'+
    '.cap-spk1-badge{background:#1a3a5c;color:#7fb3d3;border:1px solid #2a5a8c}'+
    '.cap-spk2-badge{background:#1a3a1a;color:#a8d5a2;border:1px solid #2a5a2a}'+
    '@keyframes cpblink{0%,100%{opacity:1}50%{opacity:.35}}'+
    /* startup sequence */
    '.cap-startup{background:#0d0d0d;border:1px solid #2a3a2a;padding:14px;margin-bottom:12px}'+
    '.cap-startup-step{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px;color:#555}'+
    '.cap-startup-step.done{color:#d4ff3a}'+
    '.cap-startup-step.active{color:#fff;animation:cpblink 1s ease-in-out infinite}'+
    '.cap-startup-step.waiting{color:#333}'+
    '.cap-startup-icon{font-size:12px;flex-shrink:0;width:16px}'+
    '.cap-ready-banner{background:#0d1a0d;border:1px solid #3a6a1a;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:11px;color:#6aba2a}'+
    /* mode bar */
    '.cap-mbar{display:flex;align-items:center;gap:8px;padding:7px 11px;margin-bottom:8px;font-size:10px;border:1px solid #2a2a2a;flex-wrap:wrap}'+
    '.cap-mbar.cloud{background:#0d110d;border-color:#3a5a1a}'+
    '.cap-mbar.whisper{background:#0d0d11;border-color:#3a3a8a}'+
    '.cap-mbar.reconly{background:#110d0d;border-color:#5a1a1a}'+
    '.cap-mbar-dot{font-weight:700;flex-shrink:0;font-size:12px}'+
    '.cap-mbar-title{font-weight:700;font-size:9px;letter-spacing:.12em;flex-shrink:0}'+
    '.cap-mbar-sub{font-size:10px;color:#555;flex:1}'+
    '.cap-prog-track{flex:1;height:5px;background:#1a1a1a;border:1px solid #2a2a2a;overflow:hidden}'+
    '.cap-prog-bar{height:100%;background:#6060d4;transition:width .3s}'+
    /* speaker cards */
    '.cap-spk-card{border-radius:8px;padding:11px 14px;margin-bottom:8px;border:1px solid}'+
    '.cap-spk1-card{background:#0d1a2a;border-color:#1a3a5a}'+
    '.cap-spk2-card{background:#0d1a0d;border-color:#1a3a1a}'+
    '.cap-spk-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}'+
    '.cap-spk1-name{font-size:12px;font-weight:700;color:#7fb3d3;letter-spacing:.06em}'+
    '.cap-spk2-name{font-size:12px;font-weight:700;color:#a8d5a2;letter-spacing:.06em}'+
    '.cap-spk-time{font-size:10px;color:#555;font-family:monospace}'+
    '.cap-spk-text{font-size:13px;color:#d0d0d0;line-height:1.55}'+
    /* interim */
    '.cap-interim{background:#111;border:1px dashed #2a2a2a;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#555;font-style:italic}'+
    /* forms */
    '.cap-lbl{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#444;margin:12px 0 5px}'+
    '.cap-inp{display:block;width:100%;padding:9px 11px;background:#141414;border:1px solid #2a2a2a;color:#ddd;font-size:13px;margin-bottom:10px;box-sizing:border-box;font-family:inherit}'+
    '.cap-inp:focus{outline:1px solid #d4ff3a;border-color:#d4ff3a}'+
    '.cap-infobox{margin-bottom:12px}'+
    '.cap-info{display:flex;align-items:flex-start;gap:9px;padding:7px 11px;background:#141414;border:1px solid #222;margin-bottom:3px;font-size:11px;color:#666;line-height:1.5}'+
    '.cap-info.warn{border-color:#e8b867;color:#e8b867}'+
    '.cap-info.off{opacity:.35}'+
    '.cap-tag{font-size:8px;font-weight:700;letter-spacing:.12em;color:#0a0a0a;background:#d4ff3a;padding:2px 5px;flex-shrink:0;margin-top:1px}'+
    '.cap-tip{font-size:11px;color:#555;border-left:2px solid #e8b867;padding:8px 11px;margin-bottom:12px;line-height:1.6}'+
    /* connection alert */
    '.cap-conn-alert{background:#1a0000;border:1px solid #8a0000;padding:12px 14px;margin-bottom:12px;border-radius:4px}'+
    '.cap-conn-alert-title{font-size:12px;font-weight:700;color:#e74c3c;margin-bottom:5px}'+
    '.cap-conn-alert-sub{font-size:11px;color:#aa5555;margin-bottom:10px}'+
    /* size warning */
    '.cap-size-warn{padding:8px 12px;margin-bottom:8px;font-size:11px;border-radius:4px;display:flex;align-items:center;gap:8px}'+
    '.cap-size-warn.y{background:#1a1500;border:1px solid #6a5500;color:#e8b867}'+
    '.cap-size-warn.o{background:#1a0c00;border:1px solid #8a4400;color:#e87830}'+
    '.cap-size-warn.r{background:#1a0000;border:1px solid #8a0000;color:#e74c3c;font-weight:700}'+
    /* tx area */
    '.cap-tx{max-height:340px;overflow-y:auto;margin-bottom:8px;padding-right:2px}'+
    /* buttons */
    '.cap-bigbtn{width:100%;padding:14px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;border:none;cursor:pointer;margin-bottom:8px;border-radius:4px}'+
    '.cap-go{background:#d4ff3a;color:#0a0a0a}'+
    '.cap-stopbtn{background:#c0392b;color:#fff}'+
    '.cap-resumebtn{background:#d4ff3a;color:#0a0a0a}'+
    '.cap-row{display:flex;gap:7px;margin-bottom:8px;flex-wrap:wrap}'+
    '.cap-btn{padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid #333;cursor:pointer;background:transparent;color:#bbb;border-radius:3px}'+
    '.cap-btn:hover{border-color:#d4ff3a;color:#d4ff3a}'+
    '.cap-btn.red:hover{border-color:#e74c3c;color:#e74c3c}'+
    '.cap-btn.selected{border-color:#d4ff3a;color:#d4ff3a;background:#1a2a00}'+
    /* mic meter */
    '.cap-meter{display:flex;align-items:center;gap:8px;padding:5px 10px;background:#0d0d0d;border:1px solid #1a1a1a;border-top:none;margin-bottom:8px}'+
    '.cap-m-lbl{font-size:9px;font-weight:700;color:#444;letter-spacing:.1em;flex-shrink:0;width:26px}'+
    '.cap-m-track{flex:1;height:7px;background:#1a1a1a;border:1px solid #222;overflow:hidden;border-radius:4px}'+
    '.cap-m-bar{height:100%;width:0%;background:#d4ff3a;transition:width .07s linear;border-radius:4px}'+
    '.cap-m-val{font-size:9px;color:#444;font-family:monospace;flex-shrink:0;width:30px;text-align:right}'+
    /* done bar */
    '.cap-donebar{display:flex;justify-content:space-between;align-items:center;padding:9px 13px;background:#141414;border:1px solid #4a6010;margin-bottom:11px;font-size:11px;flex-wrap:wrap;gap:5px;border-radius:4px}'+
    '.cap-donebar b{color:#d4ff3a}'+
    /* section */
    '.cap-sec{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#444;margin:12px 0 7px;display:flex;align-items:center;gap:8px}'+
    '.cap-sec::after{content:"";flex:1;height:1px;background:#1f1f1f}'+
    /* session cards */
    '.cap-scard{background:#141414;border:1px solid #222;margin-bottom:7px;border-radius:4px}'+
    '.cap-scard-h{padding:11px 13px 7px;display:flex;align-items:flex-start;gap:8px}'+
    '.cap-scard-chk{flex-shrink:0;margin-top:2px;accent-color:#d4ff3a;width:15px;height:15px;cursor:pointer}'+
    '.cap-scard-info{flex:1}'+
    '.cap-scard-t{font-size:17px;color:#e0e0e0;margin-bottom:2px;font-family:serif}'+
    '.cap-scard-m{font-size:10px;color:#555;font-family:monospace}'+
    '.cap-scard-p{font-size:11px;color:#444;padding:0 13px 8px 36px;line-height:1.5}'+
    '.cap-scard-a{display:flex;gap:5px;padding:7px 13px;border-top:1px solid #1a1a1a;flex-wrap:wrap}'+
    '.cap-empty{padding:30px 0;text-align:center;color:#444;font-size:12px}'+
    '.cap-merge-bar{position:sticky;bottom:0;background:#0d0d0d;border-top:1px solid #333;padding:10px;display:flex;gap:8px;align-items:center}'+
    '.cap-merge-count{font-size:11px;color:#d4ff3a;flex:1}';
  document.head.appendChild(s);
}

/* ── Storage ─────────────────────────────────────────────── */
const SK='smartapp_cap_v1';
function getSessions(){try{return JSON.parse(localStorage.getItem(SK)||'[]');}catch(e){return[];}}
function addSession(s){const all=getSessions();all.unshift(s);try{localStorage.setItem(SK,JSON.stringify(all));}catch(e){toast('Storage full','err');}}
function delSession(id){localStorage.setItem(SK,JSON.stringify(getSessions().filter(s=>s.id!==id)));}
function saveSessions(arr){try{localStorage.setItem(SK,JSON.stringify(arr));}catch(e){toast('Storage full','err');}}

/* ── State ───────────────────────────────────────────────── */
let _root=null,_tab='record';
let _running=false,_paused=false,_elapsed=0;
let _lines=[],_title='',_startupSteps=[];
let _timer=null,_lvlTimer=null,_offlineTimer=null;
let _mic=null,_sys=null,_ctx=null,_rec=null,_sr=null;
let _chunks=[],_hasSys=false,_analyser=null;
let _mixDest=null,_whisperRec=null,_whisperBusy=false;
let _mode='cloud',_netErr=0,_srMsg='';
let _whisper=null,_whisperLoading=false,_wProgress=0;
let _connLost=false,_connReason='';
let _sizeLevel=0;
let _speakers=[],_currentSpk='Speaker 1';
let _mergeSelected=new Set();
let _captureReady=false;

/* ── Helpers ─────────────────────────────────────────────── */
function fmt(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?h+':'+p2(m)+':'+p2(x):m+':'+p2(x);}
function fmtSec(s){return fmt(Math.round(s));}
function p2(n){return String(n).padStart(2,'0');}
function uid(){return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function bestMime(){const t=['audio/webm;codecs=opus','audio/webm','audio/ogg','audio/mp4'];for(const m of t){if(typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(m))return m;}return'';}
function wc(lines){return lines.reduce((n,l)=>n+l.s.split(' ').length,0);}
function setMsg(m){_srMsg=m;const e=_root&&_root.querySelector('#cap-msg');if(e)e.textContent=m;}

/* ── Speaker detection ───────────────────────────────────── */
function getVoiceProfile(f32){
  let sumSq=0,cross=0;
  for(let i=0;i<f32.length;i++)sumSq+=f32[i]*f32[i];
  for(let i=1;i<f32.length;i++)if((f32[i]>=0)!==(f32[i-1]>=0))cross++;
  return {rms:Math.sqrt(sumSq/Math.max(f32.length,1)),zcr:cross/Math.max(f32.length,1)};
}
function assignSpeaker(f32){
  const p=getVoiceProfile(f32);
  if(!_speakers.length){_speakers=[{id:'Speaker 1',p,n:1}];_currentSpk='Speaker 1';return 'Speaker 1';}
  let best=_speakers[0],bestD=9999;
  for(const sp of _speakers){
    const rD=Math.abs(p.rms-sp.p.rms)/Math.max(p.rms,sp.p.rms,0.001);
    const zD=Math.abs(p.zcr-sp.p.zcr)/Math.max(p.zcr,sp.p.zcr,0.001);
    const d=(rD+zD)/2;if(d<bestD){bestD=d;best=sp;}
  }
  if(bestD<0.35){
    best.p.rms=(best.p.rms*best.n+p.rms)/(best.n+1);
    best.p.zcr=(best.p.zcr*best.n+p.zcr)/(best.n+1);
    best.n++;_currentSpk=best.id;return best.id;
  }
  if(_speakers.length<2){
    const s2={id:'Speaker 2',p,n:1};_speakers.push(s2);_currentSpk='Speaker 2';return 'Speaker 2';
  }
  _currentSpk=best.id;return best.id;
}

/* ── Startup steps ───────────────────────────────────────── */
function setStep(id,state,msg){
  const el=_root&&_root.querySelector('#step-'+id);
  if(!el)return;
  el.className='cap-startup-step '+state;
  el.innerHTML=(state==='done'?'<span class="cap-startup-icon">✓</span>':state==='active'?'<span class="cap-startup-icon">◌</span>':state==='error'?'<span class="cap-startup-icon">✗</span>':'<span class="cap-startup-icon">·</span>')+esc(msg);
}

/* ── Render ──────────────────────────────────────────────── */
function render(){
  if(!_root)return;
  injectCSS();
  const sessions=getSessions();
  let h='<div class="cap">';
  h+='<div class="cap-tabs">';
  h+='<button class="cap-tab'+(_tab==='record'?' on':'')+'" id="cap-t-rec">Record</button>';
  h+='<button class="cap-tab'+(_tab==='sessions'?' on':'')+'" id="cap-t-ses">Sessions'+(sessions.length?' ('+sessions.length+')':'')+'</button>';
  h+='</div>';
  h+=(_tab==='record'?renderRecord():renderSessions(sessions));
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
  if(_connLost){h+='<span style="color:#e74c3c;font-weight:700;font-size:10px;letter-spacing:.1em">⚠ CONNECTION LOST</span>';}
  else if(_running){h+='<span class="cap-live">● LIVE</span><span class="cap-timer" id="cap-timer">'+fmt(_elapsed)+'</span><span class="cap-src on">Mic</span><span class="cap-src'+(_hasSys?' on':'')+'">Sys '+(_hasSys?'ON':'OFF')+'</span><span class="cap-spk-badge '+(_currentSpk==='Speaker 2'?'cap-spk2-badge':'cap-spk1-badge')+'">'+esc(_currentSpk)+'</span>';}
  else if(_paused){h+='<span class="cap-brk">⏸ BREAK</span><span class="cap-timer" id="cap-timer">'+fmt(_elapsed)+'</span>';}
  else if(_lines.length||_chunks.length){h+='<span class="cap-done-h">■ DONE</span><span class="cap-timer">'+fmt(_elapsed)+'</span>';}
  else{h+='<span class="cap-idle">○ READY</span>';}
  h+='</div>';

  /* Connection lost */
  if(_connLost){
    h+='<div class="cap-conn-alert">';
    h+='<div class="cap-conn-alert-title">⚠ Connection Lost — '+esc(_connReason)+'</div>';
    h+='<div class="cap-conn-alert-sub">Session paused at '+fmt(_elapsed)+'. '+_lines.length+' segments captured and saved.</div>';
    h+='<div class="cap-row"><button class="cap-bigbtn cap-resumebtn" id="cap-resume-conn" style="margin-bottom:0">▶ Resume Session</button><button class="cap-btn red" id="cap-new-conn">New Session</button></div>';
    h+='</div>';
    return h;
  }

  /* Size warnings */
  if(_running&&_sizeLevel>=1){
    const msgs=['','⏱ 1 hour captured — download transcript as backup','⚠ 1.5 hours! Large session — download now for safety','🔴 2 hour limit — auto-downloading transcript'];
    const cls=['','y','o','r'];
    h+='<div class="cap-size-warn '+cls[_sizeLevel]+'"><span>'+msgs[_sizeLevel]+'</span><button class="cap-btn" id="cap-sz-dl" style="flex-shrink:0">Download Now</button></div>';
  }

  /* Mode bar */
  if(_running||_paused){h+=renderModeBar();}

  /* IDLE — startup sequence */
  if(!_running&&!_paused&&!_lines.length&&!_chunks.length&&!_connLost){
    h+='<div class="cap-lbl">Session title</div>';
    h+='<input class="cap-inp" id="cap-ttl" type="text" placeholder="e.g. English Training Day 1" value="'+esc(_title)+'">';
    h+='<div class="cap-infobox">';
    h+='<div class="cap-info"><span class="cap-tag">MIC</span>Your voice — real-time transcript</div>';
    if(mobile){h+='<div class="cap-info off"><span class="cap-tag">SYS</span>System audio not available on mobile</div>';}
    else{h+='<div class="cap-info"><span class="cap-tag">SYS</span>Training video / call audio via screen share</div>';}
    if(!SR){h+='<div class="cap-info warn"><span class="cap-tag">!</span>Chrome or Edge required for transcript</div>';}
    h+='</div>';
    if(!mobile){
      h+='<div class="cap-tip"><strong>Chrome:</strong> "Share system audio" · <strong>Edge:</strong> "Also share tab audio"<br>Network blocked? Whisper offline engine activates automatically.</div>';
    }
    h+='<button class="cap-bigbtn cap-go" id="cap-start">● Start Capture</button>';
    h+='<div style="margin-top:12px;padding-top:12px;border-top:1px solid #222">';
    h+='<div class="cap-lbl">Or transcribe an existing audio file</div>';
    h+='<button class="cap-btn" id="cap-file" style="width:100%;padding:11px">📂 Upload Audio File (.mp3 .wav .mp4 .webm .ogg)</button>';
    h+='<div style="font-size:10px;color:#333;margin-top:3px;text-align:center">Processed locally with Whisper · no upload to any server</div>';
    h+='</div>';
  }

  /* RUNNING — startup sequence then transcript */
  if(_running){
    if(!_captureReady){
      h+='<div class="cap-startup">';
      h+='<div class="cap-startup-step waiting" id="step-mic"><span class="cap-startup-icon">·</span>Requesting microphone...</div>';
      h+='<div class="cap-startup-step waiting" id="step-sys"><span class="cap-startup-icon">·</span>Setting up system audio...</div>';
      h+='<div class="cap-startup-step waiting" id="step-pipe"><span class="cap-startup-icon">·</span>Audio pipeline ready...</div>';
      h+='<div class="cap-startup-step waiting" id="step-engine"><span class="cap-startup-icon">·</span>Transcript engine ready...</div>';
      h+='</div>';
    }else{
      h+='<div class="cap-ready-banner">● CAPTURING — transcript appears every ~10 seconds &nbsp;<span style="font-size:10px;color:#555">'+esc(_srMsg)+'</span></div>';
    }
    h+='<div class="cap-meter"><span class="cap-m-lbl">MIC</span><div class="cap-m-track"><div class="cap-m-bar" id="cap-bar"></div></div><span class="cap-m-val" id="cap-val">0%</span></div>';
    h+='<div class="cap-tx" id="cap-tx">';
    _lines.forEach(function(l){h+=speakerCard(l);});
    h+='</div>';
    h+='<div class="cap-row"><button class="cap-btn" id="cap-brk" style="flex:1">⏸ Take a Break</button><button class="cap-btn red" id="cap-stp" style="flex:1">■ Stop Session</button></div>';
  }

  /* PAUSED */
  if(_paused){
    h+='<div style="background:#141414;border:1px solid #e8b867;padding:14px;text-align:center;margin-bottom:10px;border-radius:4px">';
    h+='<div style="font-weight:700;color:#e8b867">ON BREAK</div>';
    h+='<div style="font-size:11px;color:#555;margin-top:3px">'+_lines.length+' segments · '+fmt(_elapsed)+'</div></div>';
    if(_lines.length){
      h+='<div class="cap-tx" style="max-height:160px">';
      _lines.slice(-2).forEach(function(l){h+=speakerCard(l);});
      h+='</div>';
    }
    h+='<div class="cap-row"><button class="cap-bigbtn cap-resumebtn" id="cap-res" style="flex:1;margin-bottom:0">▶ Resume Capture</button><button class="cap-btn red" id="cap-stp" style="flex:1;padding:14px">■ Stop</button></div>';
  }

  /* DONE */
  if(!_running&&!_paused&&(_lines.length||_chunks.length)){
    const wcV=wc(_lines);
    h+='<div class="cap-donebar"><b>Session complete</b><span>'+fmt(_elapsed)+' · '+wcV.toLocaleString()+' words · '+_lines.length+' segments</span></div>';
    h+='<div class="cap-row">';
    h+='<button class="cap-btn" id="cap-new">New Session</button>';
    if(_lines.length){h+='<button class="cap-btn" id="cap-txt">Download TXT</button><button class="cap-btn" id="cap-ppt">Download PPT</button>';}
    if(_chunks.length){h+='<button class="cap-btn" id="cap-audio">Download Audio</button>';}
    h+='</div>';
    if(_lines.length){
      h+='<div class="cap-sec">Full Transcript</div>';
      h+='<div class="cap-tx">';
      _lines.forEach(function(l){h+=speakerCard(l);});
      h+='</div>';
    }
  }
  return h;
}

function speakerCard(l){
  const spk=l.spk||'Speaker 1';
  const cls=spk==='Speaker 2'?'cap-spk2-card':'cap-spk1-card';
  const nameCls=spk==='Speaker 2'?'cap-spk2-name':'cap-spk1-name';
  return '<div class="cap-spk-card '+cls+'"><div class="cap-spk-hdr"><span class="'+nameCls+'">'+esc(spk)+'</span><span class="cap-spk-time">['+l.t+']</span></div><div class="cap-spk-text">'+esc(l.s)+'</div></div>';
}

function renderModeBar(){
  let bar='';
  if(_mode==='cloud'){
    bar='<div class="cap-mbar cloud"><span class="cap-mbar-dot" style="color:#d4ff3a">●</span><span class="cap-mbar-title" style="color:#d4ff3a">CLOUD STT</span><span class="cap-mbar-sub" id="cap-msg">'+esc(_srMsg)+'</span></div>';
  }else if(_mode==='whisper'){
    bar='<div class="cap-mbar whisper"><span class="cap-mbar-dot" style="color:#9090ff">◆</span><span class="cap-mbar-title" style="color:#9090ff">WHISPER LOCAL</span>';
    if(_whisperLoading){bar+='<span class="cap-mbar-sub">Loading: '+_wProgress+'%</span><div class="cap-prog-track"><div class="cap-prog-bar" id="cap-file-prog" style="width:'+_wProgress+'%"></div></div>';}
    else{bar+='<span class="cap-mbar-sub" id="cap-msg">'+esc(_srMsg)+'</span><div class="cap-prog-track"><div class="cap-prog-bar" id="cap-file-prog" style="width:0%"></div></div>';}
    bar+='</div>';
  }else{
    bar='<div class="cap-mbar reconly"><span class="cap-mbar-dot" style="color:#e74c3c">●</span><span class="cap-mbar-title" style="color:#e74c3c">RECORDING ONLY</span><span class="cap-mbar-sub">No transcript — audio saved for download</span></div>';
  }
  return bar;
}

function renderSessions(sessions){
  if(!sessions.length)return '<div class="cap-empty">No sessions saved yet</div>';
  const sel=_mergeSelected;
  let h='<div class="cap-sec">'+sessions.length+' session'+(sessions.length>1?'s':'')+'</div>';
  sessions.forEach(function(s){
    const isSel=sel.has(s.id);
    h+='<div class="cap-scard"><div class="cap-scard-h">';
    h+='<input type="checkbox" class="cap-scard-chk" data-id="'+esc(s.id)+'"'+(isSel?' checked':'')+' />';
    h+='<div class="cap-scard-info"><div class="cap-scard-t">'+esc(s.title)+'</div>';
    h+='<div class="cap-scard-m">'+esc(s.date||'')+' · '+fmt(s.elapsed)+' · '+(s.wc||0).toLocaleString()+' words</div></div></div>';
    if(s.lines&&s.lines[0])h+='<div class="cap-scard-p">'+esc(s.lines[0].s.slice(0,80))+'</div>';
    h+='<div class="cap-scard-a">';
    h+='<button class="cap-btn" data-id="'+esc(s.id)+'" data-a="view">View</button>';
    if(s.lines&&s.lines.length){h+='<button class="cap-btn" data-id="'+esc(s.id)+'" data-a="txt">TXT</button><button class="cap-btn" data-id="'+esc(s.id)+'" data-a="ppt">PPT</button>';}
    h+='<button class="cap-btn red" data-id="'+esc(s.id)+'" data-a="del">Delete</button>';
    h+='</div></div>';
  });
  if(sel.size>=2){
    h+='<div class="cap-merge-bar"><span class="cap-merge-count">'+sel.size+' sessions selected</span><button class="cap-btn" id="cap-merge">Merge Selected</button><button class="cap-btn" id="cap-merge-clear">Clear</button></div>';
  }
  return h;
}

/* ── Bind ────────────────────────────────────────────────── */
function bind(){
  const g=id=>_root.querySelector('#'+id);
  const tR=g('cap-t-rec'),tS=g('cap-t-ses');
  if(tR)tR.onclick=()=>{_tab='record';render();};
  if(tS)tS.onclick=()=>{_tab='sessions';render();};
  /* Record tab */
  const start=g('cap-start'),stp=g('cap-stp'),brk=g('cap-brk'),res=g('cap-res');
  const nw=g('cap-new'),txt=g('cap-txt'),ppt=g('cap-ppt'),aud=g('cap-audio'),fileBtn=g('cap-file');
  const szDl=g('cap-sz-dl'),resConn=g('cap-resume-conn'),newConn=g('cap-new-conn');
  if(start)start.onclick=doStart;
  if(stp)stp.onclick=doStop;
  if(brk)brk.onclick=doPause;
  if(res)res.onclick=doResume;
  if(nw)nw.onclick=()=>{_lines=[];_elapsed=0;_title='';_chunks=[];_captureReady=false;_sizeLevel=0;render();};
  if(txt)txt.onclick=()=>dlTxt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN')});
  if(ppt)ppt.onclick=()=>dlPpt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN')});
  if(aud)aud.onclick=dlAudio;
  if(fileBtn)fileBtn.onclick=doFileUpload;
  if(szDl)szDl.onclick=()=>dlTxt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN')});
  if(resConn)resConn.onclick=doResumeConn;
  if(newConn)newConn.onclick=()=>{doStop();};
  /* Sessions tab */
  _root.querySelectorAll('.cap-scard-chk').forEach(function(cb){
    cb.onchange=()=>{
      if(cb.checked)_mergeSelected.add(cb.dataset.id);
      else _mergeSelected.delete(cb.dataset.id);
      render();
    };
  });
  _root.querySelectorAll('[data-id][data-a]').forEach(function(btn){
    btn.onclick=()=>{
      const s=getSessions().find(x=>x.id===btn.dataset.id);if(!s)return;
      const a=btn.dataset.a;
      if(a==='del'){if(confirm('Delete "'+s.title+'"?')){delSession(s.id);_mergeSelected.delete(s.id);render();}}
      else if(a==='txt')dlTxt(s);
      else if(a==='ppt')dlPpt(s);
      else if(a==='view'){_lines=s.lines||[];_elapsed=s.elapsed;_title=s.title;_chunks=[];_tab='record';render();}
    };
  });
  const mergeBtn=g('cap-merge'),mergeClear=g('cap-merge-clear');
  if(mergeBtn)mergeBtn.onclick=doMerge;
  if(mergeClear)mergeClear.onclick=()=>{_mergeSelected.clear();render();};
}

/* ── Start ───────────────────────────────────────────────── */
async function doStart(){
  const te=_root&&_root.querySelector('#cap-ttl');
  _title=te?te.value.trim():'Training Session';
  _netErr=0;_mode='cloud';_connLost=false;_captureReady=false;
  _lines=[];_elapsed=0;_sizeLevel=0;_speakers=[];_currentSpk='Speaker 1';
  _running=true;_paused=false;
  render(); /* Show startup sequence */

  /* Step 1: Microphone */
  setStep('mic','active','Requesting microphone...');
  try{
    _mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    setStep('mic','done','Microphone granted ✓');
  }catch(e){
    try{_mic=await navigator.mediaDevices.getUserMedia({audio:true,video:false});}
    catch(e2){setStep('mic','error','Microphone denied — '+e2.message);_running=false;render();return;}
    setStep('mic','done','Microphone granted ✓');
  }
  /* Watch for mic disconnect */
  _mic.getAudioTracks().forEach(function(t){t.onended=function(){handleConnLoss('Microphone disconnected');};});

  /* Step 2: System audio */
  setStep('sys','active','Requesting system audio...');
  _hasSys=false;_sys=null;
  if(!/Android|iPhone|iPad/i.test(navigator.userAgent)){
    try{
      _sys=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false}});
      _hasSys=_sys.getAudioTracks().length>0;
      if(_hasSys){
        setStep('sys','done','System audio ready ✓');
        _sys.getAudioTracks().forEach(function(t){t.onended=function(){handleConnLoss('System audio disconnected');};});
      }else{setStep('sys','done','Mic only (no system audio tick)');}
    }catch(e){setStep('sys','done','Screen share skipped — mic only');_sys=null;}
  }else{setStep('sys','done','Mobile — mic only');}

  /* Step 3: Audio pipeline */
  setStep('pipe','active','Setting up audio pipeline...');
  try{
    _ctx=new AudioContext();
    const dest=_ctx.createMediaStreamDestination();
    const micSrc=_ctx.createMediaStreamSource(_mic);
    micSrc.connect(dest);
    _analyser=_ctx.createAnalyser();_analyser.fftSize=256;
    micSrc.connect(_analyser);
    const mixer=_ctx.createGain();mixer.gain.value=1;
    micSrc.connect(mixer);
    if(_hasSys&&_sys){
      const audioOnly=new MediaStream(_sys.getAudioTracks());
      const sysSrc=_ctx.createMediaStreamSource(audioOnly);
      sysSrc.connect(dest);
      const sysBoost=_ctx.createGain();sysBoost.gain.value=3.0;
      sysSrc.connect(sysBoost);sysBoost.connect(mixer);
      const lp=_ctx.createGain();lp.gain.value=0.3;
      sysSrc.connect(lp);lp.connect(_ctx.destination);
    }
    _mixDest=_ctx.createMediaStreamDestination();
    mixer.connect(_mixDest);
    const osc=_ctx.createOscillator(),gn=_ctx.createGain();
    gn.gain.value=0.00001;osc.connect(gn);gn.connect(_ctx.destination);osc.start();
    const m=bestMime();
    _rec=new MediaRecorder(dest.stream,m?{mimeType:m}:{});
    _chunks=[];
    _rec.ondataavailable=function(e){if(e.data&&e.data.size>0)_chunks.push(e.data);};
    _rec.start(500);
    setStep('pipe','done','Audio pipeline ready ✓');
  }catch(e){setStep('pipe','error','Pipeline error: '+e.message);doStop();return;}

  /* Level meter */
  _lvlTimer=setInterval(function(){
    if(!_analyser)return;
    const d=new Uint8Array(_analyser.fftSize);_analyser.getByteTimeDomainData(d);
    let max=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]-128);if(v>max)max=v;}
    const pct=Math.min(100,Math.round(max*2.5));
    const bar=_root&&_root.querySelector('#cap-bar');if(bar)bar.style.width=pct+'%';
    const val=_root&&_root.querySelector('#cap-val');if(val)val.textContent=pct+'%';
  },80);

  /* Step 4: Transcript engine */
  setStep('engine','active','Starting transcript engine...');
  startCloudSR();
  setStep('engine','done','Transcript engine ready ✓');

  /* Timer with size warnings */
  _timer=setInterval(function(){
    if(_running&&!_paused){
      _elapsed++;
      const t=_root&&_root.querySelector('#cap-timer');if(t)t.textContent=fmt(_elapsed);
      if(_elapsed===3600&&_sizeLevel<1){_sizeLevel=1;render();}
      else if(_elapsed===5400&&_sizeLevel<2){_sizeLevel=2;render();}
      else if(_elapsed===7200&&_sizeLevel<3){
        _sizeLevel=3;
        dlTxt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN')});
        render();
      }
    }
  },1000);

  /* Show capture ready after 2 seconds */
  setTimeout(function(){
    _captureReady=true;
    const sb=_root&&_root.querySelector('.cap-startup');
    if(sb){sb.style.display='none';}
    const rb=_root&&_root.querySelector('.cap-ready-banner');
    if(rb){rb.style.display='flex';}
    else{render();}
  },2500);

  toast('Capture started'+(_hasSys?' — mic + system':' — mic only'));
}

/* ── Cloud STT ───────────────────────────────────────────── */
function startCloudSR(){
  const SR=window.webkitSpeechRecognition||window.SpeechRecognition;
  if(!SR||_mode!=='cloud')return;
  if(_sr){try{_sr.abort();}catch(e){}_sr=null;}
  _sr=new SR();_sr.continuous=false;_sr.interimResults=true;_sr.lang='en';_sr.maxAlternatives=1;
  _sr.onaudiostart=()=>setMsg('🎙 Mic active');
  _sr.onsoundstart=()=>setMsg('🔊 Sound detected');
  _sr.onspeechstart=()=>setMsg('💬 Speech detected');
  _sr.onresult=function(e){
    _netErr=0;let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal){
        const t=(e.results[i][0].transcript||'').trim();
        if(t){_lines.push({t:fmt(_elapsed),s:t,spk:_currentSpk});liveUpdate();}
      }else interim+=e.results[i][0].transcript;
    }
    if(interim){
      const im=_root&&_root.querySelector('.cap-interim');
      if(im)im.textContent=interim;
      else{const tx=_root&&_root.querySelector('#cap-tx');if(tx&&!tx.querySelector('.cap-interim')){const d=document.createElement('div');d.className='cap-interim';d.textContent=interim;tx.appendChild(d);tx.scrollTop=tx.scrollHeight;}}
    }
  };
  _sr.onerror=function(ev){
    if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){toast('Mic denied','err');doStop();return;}
    else if(ev.error==='audio-capture'){toast('Mic not accessible','err');}
    else if(ev.error==='network'){
      _netErr++;setMsg('Network blocked ('+_netErr+'/3)...');
      if(_netErr>=3){if(_sr){try{_sr.abort();}catch(e){}_sr=null;}switchToWhisper();}
    }else if(ev.error==='no-speech'){setMsg('● Listening...');}
  };
  _sr.onend=function(){
    const im=_root&&_root.querySelector('.cap-interim');if(im)im.textContent='';
    if(_running&&!_paused&&_mode==='cloud')setTimeout(function(){if(_running&&!_paused&&_mode==='cloud'){try{_sr.start();}catch(e){}}},600);
  };
  try{_sr.start();setMsg('🎙 Listening — speak now');}
  catch(e){setMsg('Cloud STT unavailable — switching to offline...');switchToWhisper();}
}

/* ── Whisper mode ────────────────────────────────────────── */
async function switchToWhisper(){
  _mode='whisper';_srMsg='Loading offline engine...';render();
  await loadWhisper();
  startWhisperLoop();
}

async function loadWhisper(){
  if(_whisper)return;if(_whisperLoading)return;
  _whisperLoading=true;_wProgress=0;
  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
    const {pipeline,env}=mod;env.allowLocalModels=false;env.useBrowserCache=true;
    setMsg('📥 Downloading offline engine (one-time ~75MB)...');
    _whisper=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny.en',{
      progress_callback:function(data){
        if(data.status==='progress'&&data.progress!=null){
          _wProgress=Math.round(data.progress);
          const pb=_root&&_root.querySelector('#cap-file-prog');if(pb)pb.style.width=_wProgress+'%';
          const msg=_root&&_root.querySelector('#cap-msg');if(msg)msg.textContent='📥 Loading: '+_wProgress+'%';
        }
      }
    });
    _whisperLoading=false;_wProgress=100;setMsg('✓ Offline engine ready');
    render();toast('Offline engine ready');
  }catch(e){_whisperLoading=false;_mode='reconly';setMsg('Offline failed');render();}
}

function startWhisperLoop(){
  if(_whisperRec||_whisperBusy)return;
  captureSegment();
}

function captureSegment(){
  if(!_running||_paused||!_mixDest||!_whisper){return;}
  _whisperBusy=true;
  const chunks=[];const m=bestMime();
  _whisperRec=new MediaRecorder(_mixDest.stream,m?{mimeType:m}:{});
  _whisperRec.ondataavailable=function(e){if(e.data&&e.data.size>0)chunks.push(e.data);};
  _whisperRec.onstop=async function(){
    _whisperBusy=false;
    if(!chunks.length){if(_running&&!_paused)setTimeout(captureSegment,300);return;}
    await processBlob(new Blob(chunks,{type:m||'audio/webm'}));
    if(_running&&!_paused)setTimeout(captureSegment,300);
  };
  _whisperRec.start();
  setTimeout(function(){if(_whisperRec&&_whisperRec.state==='recording'){try{_whisperRec.stop();}catch(e){}}},10000);
  setMsg('🎙 Recording 10s segment...');
}

async function processBlob(blob){
  if(!_whisper)return;
  try{
    setMsg('🔄 Transcribing...');
    const arrayBuf=await blob.arrayBuffer();
    const tmpCtx=new AudioContext();
    let decoded;
    try{decoded=await tmpCtx.decodeAudioData(arrayBuf);}
    catch(e){try{tmpCtx.close();}catch(e2){}setMsg('⚠ Decode error — retrying');return;}
    const targetLen=Math.ceil(decoded.duration*16000);
    if(targetLen<1600){try{tmpCtx.close();}catch(e){}return;}
    const offCtx=new OfflineAudioContext(1,targetLen,16000);
    const src=offCtx.createBufferSource();src.buffer=decoded;src.connect(offCtx.destination);src.start(0);
    const rendered=await offCtx.startRendering();
    const f32=rendered.getChannelData(0);
    try{tmpCtx.close();}catch(e){}
    let peak=0;for(let i=0;i<f32.length;i++){const v=Math.abs(f32[i]);if(v>peak)peak=v;}
    if(peak<0.005){setMsg('○ No speech in segment (peak:'+peak.toFixed(3)+')');return;}
    const spk=assignSpeaker(f32);
    const wav=float32ToWav(f32,16000);
    const url=URL.createObjectURL(wav);
    let result;
    try{result=await _whisper(url);}finally{URL.revokeObjectURL(url);}
    const raw=(result&&result.text)||'';
    const text=raw.trim().replace(/\[BLANK_AUDIO\]/gi,'').replace(/^\[.*\]$/,'').replace(/Thanks for watching.*/gi,'').trim();
    if(text){_lines.push({t:fmt(_elapsed),s:text,spk:spk});liveUpdate();}
    setMsg('✓ '+text.slice(0,40));
  }catch(e){setMsg('⚠ '+e.message.slice(0,40));}
}

function float32ToWav(samples,sr){
  const buf=new ArrayBuffer(44+samples.length*2);const v=new DataView(buf);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF');v.setUint32(4,36+samples.length*2,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,samples.length*2,true);
  let off=44;for(let i=0;i<samples.length;i++){const x=Math.max(-1,Math.min(1,samples[i]));v.setInt16(off,x<0?x*0x8000:x*0x7FFF,true);off+=2;}
  return new Blob([buf],{type:'audio/wav'});
}

function liveUpdate(){
  const tx=_root&&_root.querySelector('#cap-tx');if(!tx)return;
  let h='';_lines.forEach(function(l){h+=speakerCard(l);});
  tx.innerHTML=h;tx.scrollTop=tx.scrollHeight;
}

/* ── Pause / Resume / Stop ───────────────────────────────── */
function doPause(){
  if(!_running||_paused)return;_paused=true;
  if(_sr){try{_sr.abort();}catch(e){}}
  if(_rec&&_rec.state==='recording'){try{_rec.pause();}catch(e){}}
  if(_whisperRec&&_whisperRec.state==='recording'){try{_whisperRec.stop();}catch(e){}}
  toast('Session paused — take your break');render();
}

function doResume(){
  if(!_paused)return;_paused=false;
  if(_rec&&_rec.state==='paused'){try{_rec.resume();}catch(e){}}
  if(_mode==='cloud')startCloudSR();
  else if(_mode==='whisper')startWhisperLoop();
  toast('Capture resumed');render();
}

/* ── Connection break ────────────────────────────────────── */
function handleConnLoss(reason){
  if(!_running)return;
  _running=false;_paused=false;_connLost=true;_connReason=reason;
  clearInterval(_timer);clearInterval(_lvlTimer);
  if(_sr){try{_sr.abort();}catch(e){}}
  if(_whisperRec&&_whisperRec.state==='recording'){try{_whisperRec.stop();}catch(e){}}
  toast('⚠ Connection lost: '+reason,'warn');render();
}

async function doResumeConn(){
  _connLost=false;_running=true;_paused=false;
  /* Re-acquire mic */
  try{
    _mic=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    _mic.getAudioTracks().forEach(function(t){t.onended=function(){handleConnLoss('Microphone disconnected');};});
  }catch(e){toast('Cannot re-acquire mic: '+e.message,'err');_running=false;render();return;}
  /* Restart timer */
  _timer=setInterval(function(){
    if(_running&&!_paused){
      _elapsed++;
      const t=_root&&_root.querySelector('#cap-timer');if(t)t.textContent=fmt(_elapsed);
    }
  },1000);
  if(_mode==='cloud')startCloudSR();
  else if(_mode==='whisper')startWhisperLoop();
  toast('Session resumed');render();
}

function doStop(){
  _running=false;_paused=false;_connLost=false;
  clearInterval(_timer);clearInterval(_lvlTimer);clearInterval(_offlineTimer);
  _timer=null;_lvlTimer=null;_offlineTimer=null;
  if(_sr){try{_sr.abort();}catch(e){}_sr=null;}
  if(_whisperRec&&_whisperRec.state==='recording'){try{_whisperRec.stop();}catch(e){}}_whisperRec=null;
  if(_rec&&_rec.state!=='inactive')_rec.stop();
  if(_mic)_mic.getTracks().forEach(function(t){t.stop();});
  if(_sys)_sys.getTracks().forEach(function(t){t.stop();});
  if(_ctx){try{_ctx.close();}catch(e){}_ctx=null;}
  _analyser=null;_mixDest=null;_whisperBusy=false;
  if(_lines.length){
    addSession({id:uid(),title:_title||'Session',date:new Date().toLocaleDateString('en-IN'),createdAt:Date.now(),elapsed:_elapsed,lines:[..._lines],wc:wc(_lines)});
    toast('Session saved');
  }
  render();
}

/* ── Session merge ───────────────────────────────────────── */
function doMerge(){
  const sel=Array.from(_mergeSelected);
  if(sel.length<2){toast('Select at least 2 sessions','warn');return;}
  const all=getSessions();
  const chosen=sel.map(id=>all.find(s=>s.id===id)).filter(Boolean);
  chosen.sort((a,b)=>a.createdAt-b.createdAt);
  const mergedLines=[];let totalElapsed=0;
  chosen.forEach(function(s){
    mergedLines.push(...(s.lines||[]));
    totalElapsed+=s.elapsed||0;
  });
  const merged={
    id:uid(),
    title:chosen.map(s=>s.title).join(' + '),
    date:chosen[0].date,
    createdAt:chosen[0].createdAt,
    elapsed:totalElapsed,
    lines:mergedLines,
    wc:wc(mergedLines)
  };
  const remaining=all.filter(s=>!sel.includes(s.id));
  remaining.unshift(merged);
  saveSessions(remaining);
  _mergeSelected.clear();
  toast('Merged into: '+merged.title);render();
}

/* ── File upload transcription ───────────────────────────── */
async function doFileUpload(){
  const input=document.createElement('input');
  input.type='file';input.accept='audio/*,video/*,.mp3,.wav,.mp4,.webm,.ogg,.m4a';
  input.onchange=async function(){
    if(!input.files||!input.files[0])return;
    const file=input.files[0];
    _title=file.name.replace(/\.[^.]+$/,'');_lines=[];_elapsed=0;_mode='whisper';_speakers=[];render();
    if(!_whisper){toast('Loading offline engine...');await loadWhisper();if(!_whisper){toast('Failed','err');render();return;}}
    setMsg('Decoding "'+file.name+'"...');
    let float32,sRate;
    try{
      const buf=await file.arrayBuffer();
      const ctx2=new AudioContext();
      const dec=await ctx2.decodeAudioData(buf);
      float32=dec.getChannelData(0);sRate=dec.sampleRate;
      try{ctx2.close();}catch(e){}
    }catch(e){toast('Cannot decode: '+e.message,'err');_mode='cloud';render();return;}
    _elapsed=Math.round(float32.length/sRate);
    const chunkSamples=10*sRate;const total=Math.ceil(float32.length/chunkSamples);
    toast('Processing '+total+' segments...');
    for(let i=0;i<total;i++){
      const pct=Math.round(((i+1)/total)*100);setMsg('Segment '+(i+1)+'/'+total+' ('+pct+'%)');
      const pb=_root&&_root.querySelector('#cap-file-prog');if(pb)pb.style.width=pct+'%';
      const start=i*chunkSamples;
      const chunk=float32.slice(start,Math.min(start+chunkSamples,float32.length));
      let peak=0;for(let j=0;j<chunk.length;j++){const v=Math.abs(chunk[j]);if(v>peak)peak=v;}
      if(peak<0.005){await new Promise(r=>setTimeout(r,30));continue;}
      const ratio=sRate/16000;const outLen=Math.round(chunk.length/ratio);
      const rs=new Float32Array(outLen);
      for(let j=0;j<outLen;j++){const s=Math.floor(j*ratio),e=Math.min(Math.floor((j+1)*ratio),chunk.length);let sum=0,cnt=0;for(let k=s;k<e;k++){sum+=chunk[k];cnt++;}rs[j]=cnt>0?sum/cnt:0;}
      const spk=assignSpeaker(rs);
      const wav=float32ToWav(rs,16000);const url=URL.createObjectURL(wav);
      let result;try{result=await _whisper(url);}finally{URL.revokeObjectURL(url);}
      const text=((result&&result.text)||'').trim().replace(/\[BLANK_AUDIO\]/gi,'').replace(/^\[.*\]$/,'').replace(/Thanks for watching.*/gi,'').trim();
      if(text){_lines.push({t:fmtSec(i*10),s:text,spk:spk});const txEl=_root&&_root.querySelector('#cap-tx');if(txEl){let h2='';_lines.forEach(function(l){h2+=speakerCard(l);});txEl.innerHTML=h2;txEl.scrollTop=txEl.scrollHeight;}}
      await new Promise(r=>setTimeout(r,100));
    }
    if(_lines.length){addSession({id:uid(),title:_title,date:new Date().toLocaleDateString('en-IN'),createdAt:Date.now(),elapsed:_elapsed,lines:[..._lines],wc:wc(_lines)});toast('Done — '+_lines.length+' segments');}
    else toast('No speech detected','warn');
    _running=false;_paused=false;render();
  };input.click();
}

/* ── Downloads ───────────────────────────────────────────── */
function dlTxt(s){
  if(!s.lines||!s.lines.length){toast('No transcript','warn');return;}
  const sep='='.repeat(48);
  let body='TRANSCRIPT: '+s.title+'\nDate: '+(s.date||'')+'\nDuration: '+fmt(s.elapsed)+'\nWords: '+(s.wc||0)+'\n\n'+sep+'\n\n';
  let lastSpk='';
  s.lines.forEach(function(l){
    if((l.spk||'Speaker 1')!==lastSpk){lastSpk=l.spk||'Speaker 1';body+='\n['+lastSpk+']\n';}
    body+='['+l.t+'] '+l.s+'\n';
  });
  const blob=new Blob([body],{type:'text/plain'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=(s.title||'session').replace(/\s+/g,'-').toLowerCase()+'-transcript.txt';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Transcript downloaded');
}

function dlAudio(){
  if(!_chunks.length){toast('No audio recorded','warn');return;}
  const blob=new Blob(_chunks,{type:'audio/webm'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=(_title||'session').replace(/\s+/g,'-').toLowerCase()+'-audio.webm';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Audio downloaded');
}

function dlPpt(s){
  if(!s.lines||!s.lines.length){toast('No transcript','warn');return;}
  if(!window.PptxGenJS){toast('PPT generator not loaded — check internet','warn');return;}
  toast('Generating PPT...');
  try{
    const p=new PptxGenJS();p.layout='LAYOUT_16x9';p.title=s.title;
    const s1=p.addSlide();s1.background={color:'1B4F72'};
    s1.addText(s.title,{x:.7,y:1.2,w:8.6,h:1.4,fontSize:38,bold:true,color:'FFFFFF',fontFace:'Calibri'});
    s1.addText((s.date||'')+' | '+fmt(s.elapsed)+' | '+(s.wc||0)+' words',{x:.7,y:3,w:8.6,h:.5,fontSize:15,color:'A9CCE3',fontFace:'Calibri'});
    s1.addText('SmartApp · ScreenAudioCapture',{x:.7,y:4.9,w:8.6,h:.4,fontSize:11,color:'5D8DB0',fontFace:'Calibri'});
    /* Overview */
    const s2=p.addSlide();s2.background={color:'FFFFFF'};
    s2.addShape(p.shapes.RECTANGLE,{x:0,y:0,w:.1,h:5.625,fill:{color:'1B4F72'}});
    s2.addText('SESSION OVERVIEW',{x:.4,y:.25,w:9.2,h:.6,fontSize:22,bold:true,color:'1B4F72',fontFace:'Calibri'});
    s2.addText([
      {text:'Date: '+(s.date||''),options:{bullet:{color:'E91E8C'},breakLine:true,paraSpaceAfter:6}},
      {text:'Duration: '+fmt(s.elapsed),options:{bullet:{color:'E91E8C'},breakLine:true,paraSpaceAfter:6}},
      {text:'Segments: '+s.lines.length,options:{bullet:{color:'E91E8C'},breakLine:true,paraSpaceAfter:6}},
      {text:'Words: '+(s.wc||0).toLocaleString(),options:{bullet:{color:'E91E8C'},paraSpaceAfter:6}},
    ],{x:.5,y:1.1,w:9,h:4.2,fontSize:16,color:'2C3E50',fontFace:'Calibri',valign:'top'});
    /* Transcript slides */
    for(let i=0;i<s.lines.length;i+=6){
      const chunk=s.lines.slice(i,i+6);
      const sN=p.addSlide();sN.background={color:'FFFFFF'};
      sN.addShape(p.shapes.RECTANGLE,{x:0,y:0,w:.1,h:5.625,fill:{color:'1B4F72'}});
      sN.addText('TRANSCRIPT',{x:.4,y:.2,w:7.5,h:.55,fontSize:20,bold:true,color:'1B4F72',fontFace:'Calibri'});
      sN.addText((Math.floor(i/6)+1)+' / '+Math.ceil(s.lines.length/6),{x:8.8,y:.2,w:1,h:.5,fontSize:12,color:'95A5A6',align:'right',fontFace:'Calibri'});
      sN.addText(chunk.map(function(l,j){return {text:'['+l.t+'] '+(l.spk?l.spk+': ':'')+l.s,options:{bullet:{color:'E91E8C'},breakLine:j<chunk.length-1,paraSpaceAfter:5}};}),
        {x:.4,y:.95,w:9.2,h:4.35,fontSize:13,color:'2C3E50',fontFace:'Calibri',valign:'top'});
    }
    p.write({outputType:'blob'}).then(function(blob){
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
      a.download=(s.title||'session').replace(/\s+/g,'-').toLowerCase()+'-session.pptx';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),5000);toast('PPT downloaded');
    });
  }catch(e){toast('PPT failed: '+e.message,'err');}
}

/* ── Export ──────────────────────────────────────────────── */
export default {
  id:'capture',name:'ScreenAudioCapture',tagline:'RECORD · TRANSCRIPT · DOWNLOAD',status:'ready',
  render(root){_root=root;_tab='record';render();},
  cleanup(){if(_running||_paused)doStop();}
};
