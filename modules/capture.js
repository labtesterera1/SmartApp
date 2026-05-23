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
    '.cap-ready-banner.cap-writing{background:#1a1500;border-color:#8a7000;color:#e8b867;animation:cpblink 0.8s ease-in-out infinite}'+
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
    '.cap-inp option{background:#141414;color:#ddd}'+
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
    '.cap-merge-count{font-size:11px;color:#d4ff3a;flex:1}'+
    '.cap-xfer-bar{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#0d0d0d;border:1px solid #1f1f1f;border-radius:4px;margin-bottom:10px}'+
    '.cap-xfer-info{font-size:11px;color:#555}'+
    '.cap-xfer-btns{display:flex;gap:6px}'+
    '.cap-steps{background:#0d0d0d;border:1px solid #1f3a1f;border-radius:6px;padding:12px 14px;margin-bottom:12px}'+
    '.cap-steps-title{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#3a6a3a;margin-bottom:8px}'+
    '.cap-step{display:flex;align-items:flex-start;gap:10px;padding:4px 0;font-size:11px;color:#666;line-height:1.4}'+
    '.cap-step-n{background:#1a3a1a;color:#a8d5a2;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:0px}'+
    '.cap-sess-meta{background:#0d0d0d;border:1px solid #1f1f1f;border-radius:6px;padding:12px 14px;margin-bottom:12px}'+
    '.cap-sess-meta-title{font-size:18px;color:#e0e0e0;font-family:serif;margin-bottom:4px}'+
    '.cap-sess-meta-sub{font-size:10px;color:#555;font-family:monospace}'+
    '.cap-sess-meta-pax{font-size:11px;color:#7fb3d3;margin-top:4px}';
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
let _mixer=null,_pcmChunks=[],_scriptNode=null,_segTimer=null,_segProcessing=false,_captureSR=48000;
let _mode='cloud',_netErr=0,_srMsg='';
let _whisper=null,_whisperLoading=false,_wProgress=0;
let _connLost=false,_connReason='';
let _sizeLevel=0;
let _speakers=[],_currentSpk='Speaker 1';
let _mergeSelected=new Set();
let _captureReady=false;
let _participants='',_organization='',_micDeviceId='',_micDevices=[],_trainingName='';

/* ── Helpers ─────────────────────────────────────────────── */
function fmt(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?h+':'+p2(m)+':'+p2(x):m+':'+p2(x);}
function fmtSec(s){return fmt(Math.round(s));}
function p2(n){return String(n).padStart(2,'0');}
function uid(){return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function bestMime(){const t=['audio/webm;codecs=opus','audio/webm','audio/ogg','audio/mp4'];for(const m of t){if(typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(m))return m;}return'';}
function wc(lines){return lines.reduce((n,l)=>n+l.s.split(' ').length,0);}
async function getMicDevices(){
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d=>d.kind==='audioinput');
  }catch(e){return [];}
}
function speakerName(n){
  /* Use participant name if provided, else generic */
  if(!_participants)return 'Speaker '+n;
  const names=_participants.split(',').map(p=>p.trim()).filter(Boolean);
  return names[n-1]||'Speaker '+n;
}
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

  /* IDLE — Colibri-style session setup form */
  if(!_running&&!_paused&&!_lines.length&&!_chunks.length&&!_connLost){
    h+='<div class="cap-lbl">Training / Course name</div>';
    h+='<input class="cap-inp" id="cap-trn" type="text" placeholder="e.g. CyberArk Privilege Cloud Administration" value="'+esc(_trainingName)+'">';
    h+='<div class="cap-lbl">Session / Meeting name</div>';
    h+='<input class="cap-inp" id="cap-ttl" type="text" placeholder="e.g. Logon and Reconcile Account Configuration" value="'+esc(_title)+'">';
    h+='<div class="cap-lbl">Participants <span style="color:#333;font-size:9px;letter-spacing:0;text-transform:none">(optional)</span></div>';
    h+='<input class="cap-inp" id="cap-pax" type="text" placeholder="e.g. Ishank Tyagi, John Doe" value="'+esc(_participants)+'">';
    h+='<div class="cap-lbl">Organization <span style="color:#333;font-size:9px;letter-spacing:0;text-transform:none">(optional)</span></div>';
    h+='<input class="cap-inp" id="cap-org" type="text" placeholder="e.g. CyberArk" value="'+esc(_organization)+'">';
    h+='<div class="cap-lbl">Microphone</div>';
    h+='<select class="cap-inp" id="cap-mic-sel" style="cursor:pointer">';
    h+='<option value="">Default microphone</option>';
    _micDevices.forEach(function(d){h+='<option value="'+esc(d.deviceId)+'"'+(d.deviceId===_micDeviceId?' selected':'')+'>'+esc(d.label||'Microphone')+'</option>';});
    h+='</select>';
    if(!mobile){
      h+='<div class="cap-steps">';
      h+='<div class="cap-steps-title">How to capture system audio</div>';
      h+='<div class="cap-step"><span class="cap-step-n">1</span><span>Click <strong>Start Capture</strong> below</span></div>';
      h+='<div class="cap-step"><span class="cap-step-n">2</span><span>A screen share window will appear — select your tab or screen</span></div>';
      h+='<div class="cap-step"><span class="cap-step-n">3</span><span><strong>Chrome:</strong> tick <em>"Share system audio"</em> · <strong>Edge:</strong> turn on <em>"Also share tab audio"</em></span></div>';
      h+='<div class="cap-step"><span class="cap-step-n">4</span><span>Click <strong>Share</strong> — capture starts immediately</span></div>';
      h+='</div>';
    }
    if(!SR){h+='<div class="cap-info warn" style="margin-bottom:10px"><span class="cap-tag">!</span>Chrome or Edge required for live transcript</div>';}
    h+='<button class="cap-bigbtn cap-go" id="cap-start">● Start Capture</button>';
    h+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid #1a1a1a">';
    h+='<div class="cap-lbl">Or transcribe a pre-recorded file</div>';
    h+='<button class="cap-btn" id="cap-file" style="width:100%;padding:10px">📂 Upload Audio / Video File</button>';
    h+='<div style="font-size:10px;color:#2a2a2a;margin-top:3px;text-align:center">Processed locally — no upload to any server</div>';
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
      h+='<div class="cap-ready-banner">● CAPTURING — continuous transcription active &nbsp;<span style="font-size:10px;color:#555">'+esc(_srMsg)+'</span></div>';
    }
    h+='<div class="cap-meter"><span class="cap-m-lbl">MIC</span><div class="cap-m-track"><div class="cap-m-bar" id="cap-bar"></div></div><span class="cap-m-val" id="cap-val">0%</span></div>';
    h+='<div class="cap-tx" id="cap-tx">';
    groupLines(_lines).forEach(function(g){h+=speakerCard(g);});
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
    h+='<div class="cap-sess-meta">';
    if(_trainingName)h+='<div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#3a5a7a;margin-bottom:3px">'+esc(_trainingName)+'</div>';
    h+='<div class="cap-sess-meta-title">'+esc(_title||'Session')+'</div>';
    h+='<div class="cap-sess-meta-sub">'+new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})+' · '+fmt(_elapsed)+' · '+wcV.toLocaleString()+' words · '+_lines.length+' segments</div>';
    if(_participants)h+='<div class="cap-sess-meta-pax">👤 '+esc(_participants)+'</div>';
    if(_organization)h+='<div style="font-size:10px;color:#555;margin-top:2px">🏢 '+esc(_organization)+'</div>';
    h+='</div>';
    h+='<div class="cap-row">';
    h+='<button class="cap-btn" id="cap-new">New Session</button>';
    if(_lines.length){h+='<button class="cap-btn" id="cap-txt">Download TXT</button><button class="cap-btn" id="cap-pdf">Download PDF</button><button class="cap-btn" id="cap-ppt">Download PPT</button>';}
    if(_chunks.length){h+='<button class="cap-btn" id="cap-audio">Download Audio</button>';}
    h+='</div>';
    if(_lines.length){
      h+='<div class="cap-sec">Full Transcript</div>';
      h+='<div class="cap-tx">';
      groupLines(_lines).forEach(function(g){h+=speakerCard(g);});
      h+='</div>';
    }
  }
  return h;
}

function wrapWords(text,n){
  /* Wrap text at every n words with <br> for readability */
  var words=text.split(' ');
  var lines=[];
  for(var i=0;i<words.length;i+=n){
    lines.push(words.slice(i,i+n).join(' '));
  }
  return lines.join('<br>');
}

function speakerCard(l){
  const spk=l.spk||'Speaker 1';
  const cls=spk==='Speaker 2'?'cap-spk2-card':'cap-spk1-card';
  const nameCls=spk==='Speaker 2'?'cap-spk2-name':'cap-spk1-name';
  return '<div class="cap-spk-card '+cls+'"><div class="cap-spk-hdr"><span class="'+nameCls+'">'+esc(spk)+'</span><span class="cap-spk-time">['+l.t+']</span></div><div class="cap-spk-text">'+wrapWords(esc(l.s),8)+'</div></div>';
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
  /* ── Export / Import toolbar ── */
  let toolbar='<div class="cap-xfer-bar">';
  toolbar+='<span class="cap-xfer-info">'+sessions.length+' session'+(sessions.length!==1?'s':'')+' saved</span>';
  toolbar+='<div class="cap-xfer-btns">';
  toolbar+='<button class="cap-btn" id="cap-exp-all"'+(sessions.length?'':' disabled style="opacity:.4"')+'>⬇ Export All</button>';
  toolbar+='<button class="cap-btn" id="cap-imp-file">⬆ Import</button>';
  toolbar+='</div></div>';
  if(!sessions.length)return toolbar+'<div class="cap-empty">No sessions saved yet</div>';
  const sel=_mergeSelected;
  let h=toolbar+'<div class="cap-sec">'+sessions.length+' session'+(sessions.length>1?'s':'')+'</div>';
  sessions.forEach(function(s){
    const isSel=sel.has(s.id);
    h+='<div class="cap-scard"><div class="cap-scard-h">';
    h+='<input type="checkbox" class="cap-scard-chk" data-id="'+esc(s.id)+'"'+(isSel?' checked':'')+' />';
    h+='<div class="cap-scard-info">';
    if(s.trainingName)h+='<div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#3a5a7a">'+esc(s.trainingName)+'</div>';
    h+='<div class="cap-scard-t">'+esc(s.title)+'</div>';
    h+='<div class="cap-scard-m">'+esc(s.date||'')+' · '+fmt(s.elapsed)+' · '+(s.wc||0).toLocaleString()+' words</div>';
    if(s.participants)h+='<div style="font-size:10px;color:#3a5a7a;margin-top:1px">👤 '+esc(s.participants)+'</div>';
    h+='</div></div>';
    if(s.lines&&s.lines[0])h+='<div class="cap-scard-p">'+esc(s.lines[0].s.slice(0,80))+'</div>';
    h+='<div class="cap-scard-a">';
    h+='<button class="cap-btn" data-id="'+esc(s.id)+'" data-a="view">View</button>';
    if(s.lines&&s.lines.length){h+='<button class="cap-btn" data-id="'+esc(s.id)+'" data-a="txt">TXT</button><button class="cap-btn" data-id="'+esc(s.id)+'" data-a="pdf">PDF</button><button class="cap-btn" data-id="'+esc(s.id)+'" data-a="ppt">PPT</button>';}
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
  /* Load mic devices for dropdown */
  if(!_micDevices.length){getMicDevices().then(function(devs){if(devs.length){_micDevices=devs;
    const sel=_root&&_root.querySelector('#cap-mic-sel');
    if(sel){sel.innerHTML='<option value="">Default microphone</option>'+devs.map(function(d){return '<option value="'+esc(d.deviceId)+'"'+(d.deviceId===_micDeviceId?' selected':'')+'>'+esc(d.label||'Microphone')+'</option>';}).join('');}}});}
  const paxEl=_root&&_root.querySelector('#cap-pax');
  const orgEl=_root&&_root.querySelector('#cap-org');
  const micSel=_root&&_root.querySelector('#cap-mic-sel');
  const trnEl=_root&&_root.querySelector('#cap-trn');
  if(trnEl)trnEl.oninput=function(){_trainingName=trnEl.value;};
  if(paxEl)paxEl.oninput=function(){_participants=paxEl.value;};
  if(orgEl)orgEl.oninput=function(){_organization=orgEl.value;};
  if(micSel)micSel.onchange=function(){_micDeviceId=micSel.value;};
  if(start)start.onclick=doStart;
  if(stp)stp.onclick=doStop;
  if(brk)brk.onclick=doPause;
  if(res)res.onclick=doResume;
  if(nw)nw.onclick=()=>{_lines=[];_elapsed=0;_title='';_chunks=[];_captureReady=false;_sizeLevel=0;_participants='';_organization='';_trainingName='';_micDevices=[];render();};
  if(txt)txt.onclick=()=>dlTxt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})});
  const pdfBtn=g('cap-pdf');if(pdfBtn)pdfBtn.onclick=()=>dlPdf({title:_title,trainingName:_trainingName,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),participants:_participants,organization:_organization});
  if(ppt)ppt.onclick=()=>dlPpt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})});
  if(aud)aud.onclick=dlAudio;
  if(fileBtn)fileBtn.onclick=doFileUpload;
  if(szDl)szDl.onclick=()=>dlTxt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})});
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
      else if(a==='pdf')dlPdf(s);
      else if(a==='ppt')dlPpt(s);
      else if(a==='view'){_lines=(s.lines||[]).map(function(l){return Object.assign({},l);});_elapsed=s.elapsed;_title=s.title;_chunks=[];_tab='record';render();}
    };
  });
  const mergeBtn=g('cap-merge'),mergeClear=g('cap-merge-clear');
  if(mergeBtn)mergeBtn.onclick=doMerge;
  if(mergeClear)mergeClear.onclick=()=>{_mergeSelected.clear();render();};
  /* Export / Import */
  const expBtn=g('cap-exp-all'),impBtn=g('cap-imp-file');
  if(expBtn)expBtn.onclick=doExportSessions;
  if(impBtn)impBtn.onclick=doImportSessions;
}

/* ── Start ───────────────────────────────────────────────── */
async function doStart(){
  const te=_root&&_root.querySelector('#cap-ttl');
  _title=(te?te.value.trim():'')||'Training Session';
  const trnEl2=_root&&_root.querySelector('#cap-trn');
  if(trnEl2&&trnEl2.value.trim())_trainingName=trnEl2.value.trim();
  const paxEl2=_root&&_root.querySelector('#cap-pax');
  if(paxEl2&&paxEl2.value.trim())_participants=paxEl2.value.trim();
  const orgEl2=_root&&_root.querySelector('#cap-org');
  if(orgEl2&&orgEl2.value.trim())_organization=orgEl2.value.trim();
  _netErr=0;_mode='cloud';_connLost=false;_captureReady=false;
  _lines=[];_elapsed=0;_sizeLevel=0;_speakers=[];_currentSpk='Speaker 1';
  _running=true;_paused=false;
  render(); /* Show startup sequence */

  /* Step 1: Microphone */
  setStep('mic','active','Requesting microphone...');
  try{
    const micConstraint=_micDeviceId?{deviceId:{exact:_micDeviceId},echoCancellation:false,noiseSuppression:false,autoGainControl:false}:{echoCancellation:false,noiseSuppression:false,autoGainControl:false};
    _mic=await navigator.mediaDevices.getUserMedia({audio:micConstraint,video:false});
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
    _mixer=mixer;
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
    /* Start PCM buffer capture IMMEDIATELY — audio is captured from second 0.
       Even while Cloud STT is being tried, the buffer fills. If Cloud STT fails
       and Whisper loads later, ALL audio from the start is available. */
    _captureSR=_ctx.sampleRate||48000;
    _pcmChunks=[];
    _scriptNode=_ctx.createScriptProcessor(4096,1,1);
    _scriptNode.onaudioprocess=function(e){
      if(!_running||_paused)return;
      _pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    _mixer.connect(_scriptNode);
    _scriptNode.connect(_ctx.destination);
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
        dlTxt({title:_title,elapsed:_elapsed,lines:_lines,wc:wc(_lines),date:new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})});
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
        if(t){addToTranscript(t,_currentSpk);}
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
  startContinuousCapture();
}

async function loadWhisper(){
  if(_whisper)return;if(_whisperLoading)return;
  _whisperLoading=true;_wProgress=0;
  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
    const {pipeline,env}=mod;env.allowLocalModels=false;env.useBrowserCache=true;
    setMsg('📥 Downloading offline engine (one-time ~150MB)...');
    _whisper=await pipeline('automatic-speech-recognition','Xenova/whisper-base.en',{
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

/* ── CONTINUOUS CAPTURE — no gaps, no missed words ───────────
   Audio is buffered non-stop via a ScriptProcessor. Continuously —
   the buffer is grabbed (atomically) and processed on a COPY while
   fresh audio immediately keeps filling — the mic is NEVER stopped. */
function startWhisperLoop(){
  startContinuousCapture();
}

function startContinuousCapture(){
  /* ScriptProcessor already runs from doStart — just start processing loop.
     NO timer. Process as fast as Whisper can handle, back-to-back. */
  if(_segTimer)return;
  _segTimer=1; /* flag: loop running */
  _segProcessing=false;
  whisperLoop();
}

async function whisperLoop(){
  /* Tight loop: accumulate ≥5s audio → process → repeat. Zero idle time. */
  const MIN_SEC=5;
  while(_running||_pcmChunks.length>0){
    /* Wait if paused */
    if(_paused){await _sleep(500);continue;}
    /* Count buffered audio */
    let totalSamples=0;
    for(let i=0;i<_pcmChunks.length;i++)totalSamples+=_pcmChunks[i].length;
    const bufferedSec=totalSamples/_captureSR;
    /* Wait until we have MIN_SEC seconds (or session ended with leftover) */
    if(bufferedSec<MIN_SEC&&_running){await _sleep(300);continue;}
    if(totalSamples<_captureSR*1){await _sleep(200);continue;} /* <1s skip */
    /* Process immediately */
    await processSegmentFromBuffer();
    await _sleep(50); /* tiny yield for UI */
  }
  _segTimer=null;
}

function _sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}

async function processSegmentFromBuffer(){
  if(_segProcessing||!_whisper)return;
  if(!_pcmChunks.length)return;
  _segProcessing=true;
  setMsg('✍ Transcribing...');
  if(_root){var rb=_root.querySelector('.cap-ready-banner');if(rb)rb.classList.add('cap-writing');}
  try{
    /* ── Grab buffer atomically — NO GAP, new audio fills fresh array ── */
    var chunks=_pcmChunks;
    _pcmChunks=[];
    var len=0;for(var i=0;i<chunks.length;i++)len+=chunks[i].length;
    if(len<_captureSR*1){_segProcessing=false;return;}
    var pcm=new Float32Array(len);
    var off=0;for(var i=0;i<chunks.length;i++){pcm.set(chunks[i],off);off+=chunks[i].length;}
    /* ── Keep last 1s overlap for boundary words ── */
    var tail=Math.floor(_captureSR*1.0);
    if(pcm.length>tail)_pcmChunks.push(pcm.slice(pcm.length-tail));
    /* ── Resample to 16kHz mono ── */
    var ratio=_captureSR/16000;
    var outLen=Math.floor(pcm.length/ratio);
    var rs=new Float32Array(outLen);
    for(var j=0;j<outLen;j++){
      var idx=j*ratio,i0=Math.floor(idx),i1=Math.min(i0+1,pcm.length-1);
      rs[j]=pcm[i0]*(1-(idx-i0))+pcm[i1]*(idx-i0);
    }
    /* ── Skip silence/noise: use RMS energy (more robust than peak) ── */
    var sum=0;for(var j=0;j<rs.length;j++){sum+=rs[j]*rs[j];}
    var rms=Math.sqrt(sum/rs.length);
    if(rms<0.002){_segProcessing=false;setMsg('○ Listening...');return;}
    /* ── Normalize audio for better recognition ── */
    if(peak>0&&peak<0.5){var gain=0.5/peak;for(var j=0;j<rs.length;j++)rs[j]*=gain;}
    /* ── Speaker detect ── */
    var spk=assignSpeaker(rs);
    /* ── Whisper ── */
    var wav=float32ToWav(rs,16000);
    var url=URL.createObjectURL(wav);
    var result;
    try{
      result=await _whisper(url,{max_new_tokens:128,chunk_length_s:30,stride_length_s:5,language:'en'});
    }finally{URL.revokeObjectURL(url);}
    var raw=(result&&result.text)||'';
    var text=sanitize(raw.replace(/\[BLANK_AUDIO\]/gi,'').replace(/Thanks for watching.*/gi,''));
    /* Skip if result is gibberish (all-caps or too many punctuation/symbols) */
    if(text&&text.length>10){
      var caps=0,punct=0;for(var j=0;j<text.length;j++){
        var c=text[j];
        if(c>='A'&&c<='Z')caps++;
        if('[]{}<>(),.!?*-/'.indexOf(c)>=0)punct++;
      }
      if(caps/text.length>0.5||punct/text.length>0.3){setMsg('○ (gibberish filtered)');_segProcessing=false;return;}
    }
    if(text&&text!=='...'){
      /* ── Skip non-speech: music, sound effects, stage directions ── */
      const nonSpeech=/\[.*\]|\*.*\*|^_|banner|dramatic|music|sound effect|game|instrumental|cue the|song|track|applause|laughter|music box|upbeat/i;
      if(nonSpeech.test(text)){
        setMsg('○ (background audio filtered)');
        _segProcessing=false;return;
      }
      /* Basic punctuation if missing */
      text=text.charAt(0).toUpperCase()+text.slice(1);
      if(!/[.!?;]$/.test(text))text+='.';
      addToTranscript(text,spk);
      setMsg('✓ '+text.slice(0,50));
    }else{setMsg('○ Listening...');}
  }catch(e){setMsg('⚠ '+(e.message||'').slice(0,40));}
  if(_root){var rb2=_root.querySelector('.cap-ready-banner');if(rb2)rb2.classList.remove('cap-writing');}
  _segProcessing=false;
}

function stopContinuousCapture(){
  _segTimer=null;
  if(_scriptNode){try{_scriptNode.disconnect();}catch(e){}_scriptNode.onaudioprocess=null;_scriptNode=null;}
  _pcmChunks=[];_segProcessing=false;
}

/* ── Whisper output sanitizer ────────────────────────────── */
function sanitize(raw){
  if(!raw)return '';
  /* 1. Hard skip if extremely long — hallucination detected */
  if(raw.length>400){
    setMsg('⚠ Hallucination detected — segment skipped');
    return '';
  }
  let t=raw.trim();
  /* Remove character stutters: "EPPPP" → "EP" */
  t=t.replace(/(.)\1{3,}/g,'$1$1');
  /* Remove substring loops: "testestestest" → "test" */
  t=t.replace(/(\w{2,6})\1{3,}/gi,'$1');
  /* Remove word-level repetition: "content content content" → "content" */
  t=t.replace(/\b(\w{3,})(?:\s+\1){2,}\b/gi,'$1');
  /* Remove any single "word" longer than 25 chars — always a hallucination */
  t=t.split(' ').filter(function(w){return w.length<=25;}).join(' ');
  /* Hard skip if result is now mostly garbage (< 3 real words left) */
  if(t.split(' ').filter(function(w){return w.length>1;}).length<2)return '';
  /* 2. Remove music/sound markers */
  t=t.replace(/\(.*?music.*?\)/gi,'').replace(/\[.*?music.*?\]/gi,'')
     .replace(/\(.*?applause.*?\)/gi,'').replace(/\(.*?noise.*?\)/gi,'').trim();
  if(!t)return '';
  /* 3. Dedup repeated phrases (Whisper hallucination pattern)
        "good enough, good enough, good enough..." → "good enough" */
  const parts=t.split(/\s*[,\.!?]\s*/);
  const seen={};const result=[];
  let consecRep=0;
  for(let i=0;i<parts.length;i++){
    const key=(parts[i]||'').trim().toLowerCase();
    if(!key)continue;
    seen[key]=(seen[key]||0)+1;
    if(seen[key]<=2&&result.length<60){result.push(parts[i].trim());consecRep=0;}
    else{consecRep++;if(consecRep===1)result.push('...');if(consecRep>3)break;}
  }
  t=result.join(', ').replace(/,\s*\.\.\.\s*,/g,', ...').trim();
  /* 4. Final hard cap */
  if(t.length>400)t=t.slice(0,400)+'...';
  return t;
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
    try{
      /* max_new_tokens: hard-stops generation at ~80 words — prevents hallucination hang */
      result=await _whisper(url,{max_new_tokens:150,chunk_length_s:30,stride_length_s:3});
    }finally{URL.revokeObjectURL(url);}
    const raw=(result&&result.text)||'';
    const text=sanitize(raw.replace(/\[BLANK_AUDIO\]/gi,'').replace(/Thanks for watching.*/gi,''));
    if(text&&text!=='...'){addToTranscript(text,spk);setMsg('✓ '+text.slice(0,45));}
    else if(!text){setMsg('○ Silence or music — skipped');}
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

function dedupBoundary(prevText,newText){
  /* Remove words at the start of newText that duplicate the end of
     prevText — caused by the 1.5s overlap between segments. */
  if(!prevText||!newText)return newText;
  const prev=prevText.trim().toLowerCase().split(/\s+/);
  const next=newText.trim().split(/\s+/);
  const nextLow=next.map(function(w){return w.toLowerCase().replace(/[^a-z0-9]/g,'');});
  const prevLow=prev.map(function(w){return w.replace(/[^a-z0-9]/g,'');});
  const maxN=Math.min(8,prevLow.length,nextLow.length);
  for(let n=maxN;n>=2;n--){
    const pTail=prevLow.slice(prevLow.length-n).join(' ');
    const nHead=nextLow.slice(0,n).join(' ');
    if(pTail===nHead)return next.slice(n).join(' ');
  }
  return newText;
}

function addToTranscript(text,spk){
  text=(text||'').trim().replace(/^\(.*?\)$|^\[.*?\]$/g,'').trim();
  if(!text||text==='...')return;
  /* Dedup overlap against previous same-speaker segment */
  const last=_lines[_lines.length-1];
  if(last&&last.spk===spk&&(_elapsed-(last.sec||0))<=30){
    text=dedupBoundary(last.s,text);
  }
  if(!text.trim())return;
  _lines.push({t:fmt(_elapsed),s:text,spk:spk,sec:_elapsed});
  liveUpdate();
}

function groupLines(lines){
  /* Group consecutive same-speaker segments within 2-minute gap */
  const groups=[];
  lines.forEach(function(l){
    const last=groups[groups.length-1];
    const gap=last?(l.sec||0)-(last.sec||0):999;
    if(last&&last.spk===l.spk&&gap<=120){
      /* Same speaker, within 2 min — append sentence to existing card */
      last.s=last.s.trimEnd()+' '+l.s;
      last.sec=l.sec; /* keep updating so gap always measured from last chunk */
    }else{
      groups.push({t:l.t,s:l.s,spk:l.spk,sec:l.sec});
    }
  });
  return groups;
}

function liveUpdate(){
  const tx=_root&&_root.querySelector('#cap-tx');if(!tx)return;
  const groups=groupLines(_lines);
  let h='';groups.forEach(function(g){h+=speakerCard(g);});
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
  else if(_mode==='whisper'){if(!_scriptNode)startContinuousCapture();}
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
  stopContinuousCapture();_mixer=null;
  if(_rec&&_rec.state!=='inactive')_rec.stop();
  if(_mic)_mic.getTracks().forEach(function(t){t.stop();});
  if(_sys)_sys.getTracks().forEach(function(t){t.stop();});
  if(_ctx){try{_ctx.close();}catch(e){}_ctx=null;}
  _analyser=null;_mixDest=null;_whisperBusy=false;
  if(_lines.length){
    addSession({id:uid(),title:_title||'Session',trainingName:_trainingName,date:new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),createdAt:Date.now(),elapsed:_elapsed,lines:[..._lines],wc:wc(_lines),participants:_participants,organization:_organization});
    toast('Session saved');
  }
  render();
}

/* ── Session merge ───────────────────────────────────────── */
/* ── Export all sessions ─────────────────────────────────── */
function doExportSessions(){
  const all=getSessions();
  if(!all.length){toast('No sessions to export','warn');return;}
  const data={
    _meta:{app:'SmartApp ScreenAudioCapture',version:'1.0',exportedAt:new Date().toISOString(),count:all.length},
    sessions:all
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='screenaudio-sessions-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  toast('Exported '+all.length+' sessions');
}

/* ── Import sessions from backup ─────────────────────────── */
function doImportSessions(){
  const input=document.createElement('input');
  input.type='file';input.accept='.json,application/json';
  input.onchange=async function(){
    if(!input.files||!input.files[0])return;
    try{
      const text=await input.files[0].text();
      const data=JSON.parse(text);
      if(!data.sessions||!Array.isArray(data.sessions))
        throw new Error('Not a valid ScreenAudioCapture backup');
      const existing=getSessions();
      const existingIds=new Set(existing.map(s=>s.id));
      let added=0;
      const merged=[...existing];
      data.sessions.forEach(function(s){
        if(s.id&&!existingIds.has(s.id)){merged.push(s);added++;}
      });
      merged.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      saveSessions(merged);
      _mergeSelected.clear();
      toast('Imported '+added+' new session'+(added!==1?'s':''));
      render();
    }catch(e){toast('Import failed: '+e.message,'err');}
  };input.click();
}

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
      let result;
      try{
        result=await _whisper(url,{max_new_tokens:128});
      }finally{URL.revokeObjectURL(url);}
      const text=sanitize(((result&&result.text)||'').replace(/\[BLANK_AUDIO\]/gi,'').replace(/Thanks for watching.*/gi,''));
      if(text){addToTranscript(text,spk);const txEl=_root&&_root.querySelector('#cap-tx');if(txEl){let h2='';_lines.forEach(function(l){h2+=speakerCard(l);});txEl.innerHTML=h2;txEl.scrollTop=txEl.scrollHeight;}}
      await new Promise(r=>setTimeout(r,100));
    }
    if(_lines.length){addSession({id:uid(),title:_title,trainingName:_trainingName,date:new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),createdAt:Date.now(),elapsed:_elapsed,lines:[..._lines],wc:wc(_lines)});toast('Done — '+_lines.length+' segments');}
    else toast('No speech detected','warn');
    _running=false;_paused=false;render();
  };input.click();
}

/* ── Downloads ───────────────────────────────────────────── */
function dlTxt(s){
  if(!s.lines||!s.lines.length){toast('No transcript','warn');return;}
  const sep='='.repeat(48);
  const gLines=groupLines(s.lines||[]);
  let body='TRANSCRIPT: '+s.title+'\nDate: '+(s.date||'')+'\nDuration: '+fmt(s.elapsed)+'\nSegments: '+gLines.length+'\nWords: '+(s.wc||0)+'\n\n'+sep+'\n\n';
  let lastSpk='';
  gLines.forEach(function(l){
    if((l.spk||'Speaker 1')!==lastSpk){lastSpk=l.spk||'Speaker 1';body+='\n['+lastSpk+']\n';}
    body+='['+l.t+']\n'+l.s+'\n\n';
  });
  const blob=new Blob([body],{type:'text/plain'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=(s.title||'session').replace(/\s+/g,'-').toLowerCase()+'-transcript.txt';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Transcript downloaded');
}

function dlPdf(s){
  if(!s.lines||!s.lines.length){toast('No transcript','warn');return;}
  const JsPDF=window.jspdf&&window.jspdf.jsPDF?window.jspdf.jsPDF:window.jsPDF;
  if(!JsPDF){toast('PDF generator not loaded','warn');return;}
  toast('Generating PDF...');
  try{
    const doc=new JsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const pW=210,pH=297,mg=15,cW=pW-mg*2;let y=mg;
    const Cdark=[30,30,30],Cmuted=[140,140,140],Cblue=[67,97,238],Cgreen=[46,125,50],Cborder=[220,220,220];
    function chk(n){if(y+n>pH-mg-8){doc.addPage();y=mg;}}

    /* Header */
    if(s.trainingName){doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...Cmuted);doc.text(s.trainingName.toUpperCase(),mg,y);y+=5;}
    doc.setFontSize(17);doc.setFont('helvetica','bold');doc.setTextColor(...Cdark);
    const tl=doc.splitTextToSize(s.title||'Session',cW);doc.text(tl,mg,y);y+=tl.length*7+2;
    doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(...Cmuted);
    doc.text([s.date||'',fmt(s.elapsed||0),(s.wc||0).toLocaleString()+' words',(s.lines||[]).length+' segments'].join('  ·  '),mg,y);y+=5;
    if(s.participants){doc.setTextColor(...Cblue);doc.setFontSize(9);doc.text('Participants: '+s.participants,mg,y);y+=5;}
    if(s.organization){doc.setTextColor(...Cmuted);doc.setFontSize(9);doc.text('Organization: '+s.organization,mg,y);y+=5;}
    y+=2;doc.setDrawColor(...Cborder);doc.setLineWidth(0.3);doc.line(mg,y,pW-mg,y);y+=7;
    doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(...Cmuted);doc.text('TRANSCRIPT',mg,y);y+=7;

    /* Transcript entries */
    (s.lines||[]).forEach(function(line,idx){
      const spk=line.spk||'Speaker 1';
      const paxArr=(s.participants||'').split(',').map(function(p){return p.trim();}).filter(Boolean);
      const isSpk2=spk===paxArr[1]||spk==='Speaker 2';
      const circ=isSpk2?C.green:C.blue;
      const init=spk.split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,2)||'SP';
      const tLines=doc.splitTextToSize(line.s||'',cW-20);
      chk(16+tLines.length*5+6);
      /* Circle */
      doc.setFillColor(circ[0],circ[1],circ[2]);doc.circle(mg+5,y+4,5,'F');
      doc.setFontSize(7);doc.setFont('helvetica','bold');doc.setTextColor(255,255,255);
      doc.text(init,mg+5,y+6,{align:'center'});
      /* Name */
      doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(...Cdark);
      doc.text(spk,mg+13,y+6);
      /* Timestamp */
      doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(...Cmuted);
      doc.text(line.t||'',pW-mg,y+6,{align:'right'});
      /* Text */
      y+=12;doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(60,60,60);
      doc.text(tLines,mg+13,y);y+=tLines.length*5+7;
      if(idx<(s.lines.length-1)){doc.setDrawColor(235,235,235);doc.setLineWidth(0.2);doc.line(mg+13,y-3,pW-mg,y-3);}
    });

    /* Footer */
    const tot=doc.getNumberOfPages();
    for(let i=1;i<=tot;i++){doc.setPage(i);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...Cmuted);doc.text('SmartApp · ScreenAudioCapture',mg,pH-6);doc.text(i+' / '+tot,pW-mg,pH-6,{align:'right'});}

    doc.save((s.title||'session').replace(/[^a-z0-9]/gi,'-').toLowerCase()+'-transcript.pdf');
    toast('PDF downloaded');
  }catch(e){toast('PDF failed: '+e.message,'err');}
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
