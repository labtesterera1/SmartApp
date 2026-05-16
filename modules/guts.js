/* ============================================================
   modules/guts.js  —  Get Up To Speed  v0.2
   Story-based English · Upload · Parse · EN ↔ Hindi · Notes
   ============================================================ */

import { db }    from '../core/storage.js';
import { toast } from '../core/ui.js';

const STORE_L = 'guts_lessons';
const STORE_W = 'guts_wordbank';
const STORE_N = 'guts_notes';
const STORE_K = 'guts_knowledge';

let _root=null,_view='home',_lessonId=null,_noteId=null;
let _lessons=[],_wordbank=[],_notes=[],_knowledge=new Map();
let _styleEl=null,_saveTimer=null,_drillMode=false;
let _speaking=false,_paused=false,_speechRate=1.0;
let _speechSents=[],_speechIdx=0,_speechCb=null;

export default {
  id:'guts', name:'Get Up To Speed',
  tagline:'stories · patterns · EN ↔ Hindi',
  status:'ready',
  async render(root){ _root=root; injectStyles(); await refreshAll(); route(); },
  cleanup(){ stopSpeech(); if(_styleEl){_styleEl.remove();_styleEl=null;} clearTimeout(_saveTimer); _root=null; _view='home'; _lessonId=null; _noteId=null; _lessons=[]; _wordbank=[]; _notes=[]; _knowledge=new Map(); },
};

async function refreshAll(){
  _lessons=(await db.getAll(STORE_L)).sort((a,b)=>b.createdAt-a.createdAt);
  _wordbank=await db.getAll(STORE_W);
  _notes=(await db.getAll(STORE_N)).sort((a,b)=>a.pageNum-b.pageNum);
  const kArr=await db.getAll(STORE_K);
  _knowledge=new Map(kArr.map(k=>[k.word,k]));
}
async function saveLesson(l){await db.put(STORE_L,l);await refreshAll();}
async function deleteLesson(id){await db.delete(STORE_L,id);await refreshAll();}
async function saveWord(e){await db.put(STORE_W,e);await refreshAll();}
async function deleteWord(id){await db.delete(STORE_W,id);await refreshAll();}
async function saveNote(n){await db.put(STORE_N,n);await refreshAll();}
async function deleteNote(id){await db.delete(STORE_N,id);await refreshAll();}

async function updateKnowledge(words,sourceId){
  for(const word of words){
    const key=word.toLowerCase(),now=Date.now(),id='know_'+key;
    const prev=_knowledge.get(key)||{id,word:key,count:0,sourceIds:[],firstSeen:now,lastSeen:now};
    const entry={...prev,count:prev.count+1,lastSeen:now,sourceIds:[...new Set([...(prev.sourceIds||[]),sourceId])]};
    _knowledge.set(key,entry);
    await db.put(STORE_K,entry);
  }
}

function route(){if(!_root)return;stopSpeech();switch(_view){case'upload':renderUpload();break;case'library':renderLibrary();break;case'lesson':renderLesson();break;case'wordbank':renderWordBank();break;case'notes':renderNotes();break;case'transfer':renderTransfer();break;default:renderHome();}}
function nav(v,id=null){_view=v;if(v==='lesson')_lessonId=id;if(v==='notes')_noteId=id;route();}
window.gutsNav=(v)=>nav(v);
window.gutsOpenLesson=(id)=>{_lessonId=id;};
window.gutsTab=(tab,btn)=>{_root.querySelectorAll('.guts-tab').forEach(b=>b.classList.remove('is-active'));btn.classList.add('is-active');_root.querySelector('#panel-paste').hidden=tab!=='paste';_root.querySelector('#panel-file').hidden=tab!=='file';};

function navBar(active){
  return `<div class="guts-nav">${[{id:'home',l:'Home'},{id:'upload',l:'Upload'},{id:'library',l:'Library'},{id:'wordbank',l:'Words'},{id:'notes',l:'Notes'},{id:'transfer',l:'↕'}].map(it=>`<button class="guts-nav__btn ${active===it.id?'is-active':''}" onclick="gutsNav('${it.id}')">${it.l}</button>`).join('')}</div>`;
}

/* ── HOME ─────────────────────────────────────────── */
function renderHome(){
  const total=_lessons.length,unread=_lessons.filter(l=>l.status==='unread').length,done=_lessons.filter(l=>l.status==='done').length;
  const latest=_lessons.find(l=>l.status!=='done')||_lessons[0];
  const sevenD=7*24*60*60*1000,reviewWords=_wordbank.filter(w=>(Date.now()-(w.lastReviewed||w.savedAt))>sevenD);
  _root.innerHTML=`${navBar('home')}
<div class="guts-stats">
  <div class="guts-stat"><span class="guts-stat__n">${total}</span><span class="guts-stat__l">LESSONS</span></div>
  <div class="guts-stat"><span class="guts-stat__n">${unread}</span><span class="guts-stat__l">UNREAD</span></div>
  <div class="guts-stat"><span class="guts-stat__n">${done}</span><span class="guts-stat__l">DONE</span></div>
  <div class="guts-stat"><span class="guts-stat__n">${_wordbank.length}</span><span class="guts-stat__l">WORDS</span></div>
</div>
${reviewWords.length?`<div class="guts-review-banner" onclick="gutsNav('wordbank')"><span>🔁</span><span><strong>${reviewWords.length} word${reviewWords.length>1?'s':''}</strong> ready for review — not seen in 7+ days</span><span style="margin-left:auto;color:var(--lime)">→</span></div>`:''}
${latest?`
<div class="guts-section-label">Continue reading</div>
<div class="guts-lesson-card guts-lesson-card--featured" onclick="gutsNav('lesson');gutsOpenLesson('${latest.id}')">
  <div class="guts-lesson-card__status ${statusClass(latest.status)}">${statusLabel(latest.status)}</div>
  <div class="guts-lesson-card__title">${esc(latest.title)}</div>
  <div class="guts-lesson-card__meta">${latest.chunks.length} chunks · ${latest.allVocab.length} vocab · ${fmtDate(latest.createdAt)}</div>
  <div class="guts-lesson-card__arrow">→</div>
</div>`:`<div class="placeholder" style="margin-top:24px"><div class="placeholder__icon">📖</div><div>No lessons yet — upload some material</div></div>`}
<div class="guts-section-label" style="margin-top:20px">Quick actions</div>
<div class="guts-actions">
  <button class="guts-action-btn" onclick="gutsNav('upload')"><span class="guts-action-btn__icon">⬆</span><span>Upload</span></button>
  <button class="guts-action-btn" onclick="gutsNav('library')"><span class="guts-action-btn__icon">📚</span><span>Library</span></button>
  <button class="guts-action-btn" onclick="gutsNav('wordbank')"><span class="guts-action-btn__icon">💡</span><span>Word Bank</span></button>
  <button class="guts-action-btn" onclick="gutsNav('notes')"><span class="guts-action-btn__icon">📝</span><span>Notes</span></button>
</div>`;
}

/* ── UPLOAD ───────────────────────────────────────── */
function renderUpload(){
  _root.innerHTML=`${navBar('upload')}
<div class="guts-section-label">Add new material</div>
<input type="text" id="guts-title" class="guts-input" placeholder="Lesson title (optional)" maxlength="80" style="margin-bottom:10px">
<div class="guts-tabs">
  <button class="guts-tab is-active" onclick="gutsTab('paste',this)">✏ Paste text</button>
  <button class="guts-tab" onclick="gutsTab('file',this)">📁 Upload file</button>
</div>
<div id="panel-paste">
  <label class="guts-label">Paste any English content<span class="guts-label__hint"> article · transcript · story · notes</span></label>
  <textarea id="guts-paste" class="guts-textarea" rows="11" placeholder="Paste your text here…&#10;&#10;• Articles &amp; blog posts&#10;• YouTube / meeting transcripts&#10;• Stories and lesson text&#10;• Any English material"></textarea>
  <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
    <button class="vault-tool-btn" id="guts-proc-paste">⚡ Process &amp; Save</button>
    <span class="guts-char-count" id="guts-cc">0 chars</span>
  </div>
</div>
<div id="panel-file" hidden>
  <label class="guts-label">Pick any file<span class="guts-label__hint"> PDF · DOCX · PPTX · TXT · VTT · SRT · and more</span></label>
  <label class="guts-dropzone">
    <span style="font-size:32px">📄</span>
    <span class="guts-dropzone__text">Tap to pick a file</span>
    <span class="guts-dropzone__hint">No format restrictions</span>
    <input type="file" id="guts-file-input" hidden>
  </label>
  <div id="guts-file-preview" hidden></div>
  <div style="margin-top:8px"><button class="vault-tool-btn" id="guts-proc-file" disabled>⚡ Process &amp; Save</button></div>
</div>
<div id="guts-proc-status" hidden style="margin-top:8px;font-size:11px;color:var(--lime);display:flex;align-items:center;gap:6px">
  <span style="width:7px;height:7px;border-radius:50%;background:var(--lime);display:inline-block;animation:pulse 1.2s infinite"></span>
  <span id="guts-proc-msg">Processing…</span>
</div>`;
  bindUpload();
}

function bindUpload(){
  const ta=_root.querySelector('#guts-paste'),cc=_root.querySelector('#guts-cc');
  ta.addEventListener('input',()=>{cc.textContent=ta.value.length.toLocaleString()+' chars';});
  _root.querySelector('#guts-proc-paste').addEventListener('click',async()=>{
    const text=ta.value.trim(),title=_root.querySelector('#guts-title').value.trim();
    if(text.length<30){toast('Paste at least 30 characters','warn');return;}
    await runProcessor(text,title,'paste');
  });
  let _fileText='';
  const fileInput=_root.querySelector('#guts-file-input'),procBtn=_root.querySelector('#guts-proc-file'),preview=_root.querySelector('#guts-file-preview');
  fileInput.addEventListener('change',async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setStatus(true,'Reading file…');
    try{
      _fileText=await readFile(file);
      preview.hidden=false;
      preview.innerHTML=`<div class="guts-file-preview"><div class="guts-file-preview__name">${esc(file.name)}</div><div class="guts-file-preview__meta">${_fileText.length.toLocaleString()} chars extracted</div><pre class="guts-file-preview__peek">${esc(_fileText.slice(0,300))}${_fileText.length>300?'…':''}</pre></div>`;
      procBtn.disabled=false;
    }catch(err){toast('Could not read file: '+err.message,'err');}
    finally{setStatus(false);}
  });
  procBtn.addEventListener('click',async()=>{
    if(!_fileText)return;
    const title=_root.querySelector('#guts-title').value.trim();
    await runProcessor(_fileText,title,'file');
  });
}

function setStatus(on,msg='Processing…'){const el=_root&&_root.querySelector('#guts-proc-status'),mg=_root&&_root.querySelector('#guts-proc-msg');if(el)el.hidden=!on;if(mg&&msg)mg.textContent=msg;}
const tick=()=>new Promise(r=>setTimeout(r,20));

async function runProcessor(text,title,source){
  setStatus(true,'Analysing…');
  try{
    await tick();
    const lesson=processText(text,title,source);
    setStatus(true,'Updating knowledge base…');
    await tick();
    await updateKnowledge(lesson.allVocab,lesson.id);
    await saveLesson(lesson);
    toast(`✓ Saved — ${lesson.chunks.length} chunks · ${lesson.allVocab.length} vocab · ${lesson.allPatterns.length} patterns`);
    nav('lesson',lesson.id);
  }catch(err){toast('Failed: '+err.message,'err');setStatus(false);}
}

async function readFile(file){
  const n=file.name.toLowerCase();
  if(n.endsWith('.pdf'))return readPdf(file);
  if(n.endsWith('.docx'))return readDocx(file);
  if(n.endsWith('.pptx'))return readPptx(file);
  if(n.endsWith('.vtt'))return readVtt(await file.text());
  if(n.endsWith('.srt'))return readSrt(await file.text());
  try{return await file.text();}
  catch{throw new Error(`Cannot read ${file.name} as text — try pasting the content instead`);}
}
async function readPdf(file){
  const lib=window.pdfjsLib;
  if(!lib)throw new Error('PDF.js not loaded — check internet connection and reload');
  lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf=await file.arrayBuffer(),pdf=await lib.getDocument({data:buf}).promise;
  let text='';
  for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();text+=content.items.map(it=>it.str).join(' ')+'\n\n';}
  return text.trim();
}
async function readDocx(file){
  const Z=window.JSZip;if(!Z)throw new Error('JSZip not available');
  const zip=await Z.loadAsync(file),xml=await zip.file('word/document.xml').async('text');
  return xml.replace(/<w:br[^>]*>/gi,'\n').replace(/<\/w:p>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n').trim();
}
async function readPptx(file){
  const Z=window.JSZip;if(!Z)throw new Error('JSZip not available');
  const zip=await Z.loadAsync(file),slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  let text='';
  for(const s of slides){const xml=await zip.files[s].async('text');const t=xml.replace(/<a:t>/g,' ').replace(/<\/a:t>/g,'').replace(/<a:p[^>]*>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();if(t)text+=t+'\n\n';}
  return text.trim();
}
function readVtt(raw){return raw.split('\n').filter(l=>!l.match(/^WEBVTT|^\d+$|-->/)).join(' ').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();}
function readSrt(raw){return raw.replace(/^\d+\s*$/gm,'').replace(/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/g,'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();}

/* ── LIBRARY ──────────────────────────────────────── */
function renderLibrary(){
  const total=_lessons.length;
  _root.innerHTML=`${navBar('library')}<div class="guts-section-label">${total} LESSON${total!==1?'S':''}</div>${total===0?`<div class="placeholder"><div class="placeholder__icon">📚</div><div>No lessons yet</div></div>`:`<div id="guts-list"></div>`}`;
  if(total>0){const list=_root.querySelector('#guts-list');_lessons.forEach(l=>{const d=document.createElement('div');d.className='guts-lesson-card';d.innerHTML=`<div class="guts-lesson-card__status ${statusClass(l.status)}">${statusLabel(l.status)}</div><div class="guts-lesson-card__title">${esc(l.title)}</div><div class="guts-lesson-card__meta">${l.chunks.length} chunks · ${l.allVocab.length} vocab · ${fmtDate(l.createdAt)}</div><div class="guts-lesson-card__arrow">→</div>`;d.addEventListener('click',()=>nav('lesson',l.id));list.appendChild(d);});}
}

/* ── LESSON READER ────────────────────────────────── */
function renderLesson(){
  const lesson=_lessons.find(l=>l.id===_lessonId);
  if(!lesson){nav('library');return;}
  const wbSet=new Set(_wordbank.map(w=>w.word));
  _root.innerHTML=`${navBar('library')}
<div class="guts-reader">
  <div class="guts-reader__header">
    <div class="guts-reader__title">${esc(lesson.title)}</div>
    <div class="guts-reader__meta">${lesson.chunks.length} chunks · ${lesson.allVocab.length} vocab · ${fmtDate(lesson.createdAt)}</div>
    <div class="guts-reader__controls">
      <button class="vault-tool-btn ${lesson.status==='done'?'is-active':''}" id="guts-mark">${lesson.status==='done'?'✓ Done':'○ Mark done'}</button>
      <button class="vault-tool-btn vault-tool-btn--danger" id="guts-del">✕ Delete</button>
    </div>
  </div>
  <div class="guts-ra-bar">
    <button class="guts-ra-btn" id="ra-play">▶</button>
    <button class="guts-ra-btn" id="ra-pause" disabled>⏸</button>
    <button class="guts-ra-btn" id="ra-stop" disabled>⏹</button>
    <div class="guts-ra-speeds">${[0.75,1,1.25,1.5].map(s=>`<button class="guts-ra-speed ${_speechRate===s?'is-active':''}" data-rate="${s}">${s}×</button>`).join('')}</div>
  </div>
  <div class="guts-section-label">Story</div>
  <div class="guts-chunks" id="guts-chunks">${lesson.chunks.map((c,i)=>`<div class="guts-chunk" id="chunk-${i}"><div class="guts-chunk__num">§${i+1}</div><div class="guts-chunk__text">${renderWords(c.text,wbSet)}</div>${c.phrases.length?`<div class="guts-chunk__tags">${c.phrases.map(p=>`<span class="guts-badge guts-badge--phrase">${esc(p)}</span>`).join('')}</div>`:''}</div>`).join('')}</div>
  ${lesson.allVocab.length?`<div class="guts-section-label">Key vocabulary</div><div class="guts-vocab-grid">${lesson.allVocab.map(w=>{const h=HINDI_DICT[w]||'',kn=_knowledge.get(w),sv=wbSet.has(w);return `<button class="guts-vocab-chip ${sv?'is-saved':''}" data-word="${esc(w)}">${esc(w)}${h?`<span class="guts-vocab-chip__hi">${esc(h.split('(')[0].trim())}</span>`:''}${kn&&kn.count>1?`<span class="guts-vocab-chip__freq">${kn.count}×</span>`:''}</button>`;}).join('')}</div>`:''}
  ${lesson.allPatterns.length?`<div class="guts-section-label">Long patterns <button class="guts-mini-btn" id="drill-btn">◈ Drill mode</button></div><div class="guts-patterns" id="guts-patterns">${lesson.allPatterns.map((p,i)=>`<div class="guts-pattern" id="pat-${i}"><span class="guts-pattern__ico">◈</span><span class="guts-pattern__text">${esc(p)}</span><button class="guts-pattern__listen" data-text="${esc(p)}">▶</button></div>`).join('')}</div>`:''}
  ${lesson.allPhrases.length?`<div class="guts-section-label">Key phrases</div><div class="guts-phrase-list">${lesson.allPhrases.map(p=>`<div class="guts-phrase-row"><span class="guts-badge guts-badge--phrase">${esc(p)}</span></div>`).join('')}</div>`:''}
  ${lesson.questions&&lesson.questions.length?`<div class="guts-section-label">Comprehension check</div><div id="guts-quiz"></div>`:''}
</div>
<div class="guts-popup" id="guts-popup" hidden>
  <div class="guts-popup__word" id="pp-word"></div>
  <div class="guts-popup__freq" id="pp-freq"></div>
  <div class="guts-popup__hindi" id="pp-hindi"></div>
  <div class="guts-popup__ex" id="pp-ex"></div>
  <div class="guts-popup__actions">
    <button class="vault-tool-btn" id="pp-save">+ Word bank</button>
    <button class="vault-tool-btn" id="pp-listen">▶ Listen</button>
    <button class="vault-tool-btn" id="pp-close">✕</button>
  </div>
</div>`;
  bindReader(lesson,wbSet);
  if(lesson.questions&&lesson.questions.length)renderQuiz(lesson.questions);
}

function renderWords(text,wbSet){
  return text.replace(/\b([a-zA-Z]+)\b/g,(match)=>{
    const key=match.toLowerCase(),h=HINDI_DICT[key],sv=wbSet.has(key),kn=_knowledge.get(key);
    const cls=`guts-word${h?' guts-word--known':''}${sv?' guts-word--saved':''}${kn&&kn.count>2?' guts-word--freq':''}`;
    return `<span class="${cls}" data-word="${key}">${esc(match)}</span>`;
  });
}

function bindReader(lesson,wbSet){
  _root.querySelector('#guts-del').addEventListener('click',async()=>{if(!confirm(`Delete "${lesson.title}"?`))return;await deleteLesson(lesson.id);toast('Lesson deleted — vocabulary stays in knowledge base');nav('library');});
  _root.querySelector('#guts-mark').addEventListener('click',async()=>{lesson.status=lesson.status==='done'?'reading':'done';await saveLesson(lesson);renderLesson();});
  _root.querySelector('#guts-chunks').addEventListener('click',e=>{const s=e.target.closest('.guts-word');if(s)showWordPopup(s.dataset.word,lesson,wbSet);else closePopup();});
  _root.querySelectorAll('.guts-vocab-chip').forEach(c=>c.addEventListener('click',()=>showWordPopup(c.dataset.word,lesson,wbSet)));
  _root.querySelector('#pp-close').addEventListener('click',closePopup);
  _root.querySelector('#pp-listen').addEventListener('click',()=>{const w=_root.querySelector('#pp-word').dataset.word;if(w)speakText(w,_speechRate);});
  _root.querySelector('#pp-save').addEventListener('click',()=>{
    const w=_root.querySelector('#pp-word').dataset.word,btn=_root.querySelector('#pp-save');
    if(!w||wbSet.has(w))return;
    saveWord({id:'wb_'+Date.now(),word:w,hindi:HINDI_DICT[w]||'',example:findExample(lesson,w),savedAt:Date.now(),lastReviewed:Date.now(),lessonId:lesson.id}).then(()=>{wbSet.add(w);btn.textContent='✓ Saved';closePopup();toast('✓ Saved to word bank');});
  });
  _root.querySelectorAll('.guts-pattern__listen').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();speakText(btn.dataset.text,_speechRate);}));
  const drillBtn=_root.querySelector('#drill-btn');
  if(drillBtn)drillBtn.addEventListener('click',toggleDrillMode);
  const sents=lesson.chunks.flatMap(c=>tokenizeSentences(c.text));
  bindReadAloud(sents);
}

function showWordPopup(word,lesson,wbSet){
  const popup=_root.querySelector('#guts-popup');if(!popup)return;
  const hindi=HINDI_DICT[word]||'',kn=_knowledge.get(word),saved=wbSet.has(word);
  popup.querySelector('#pp-word').textContent=word;popup.querySelector('#pp-word').dataset.word=word;
  popup.querySelector('#pp-hindi').textContent=hindi||'— not in dictionary yet';
  popup.querySelector('#pp-hindi').style.color=hindi?'var(--lime)':'var(--ink-faint)';
  popup.querySelector('#pp-freq').textContent=kn?`Seen ${kn.count}× across ${kn.sourceIds.length} source${kn.sourceIds.length>1?'s':''}`:'First time seeing this word';
  popup.querySelector('#pp-freq').style.color=kn&&kn.count>2?'var(--ok)':'var(--ink-dim)';
  const ex=findExample(lesson,word);
  popup.querySelector('#pp-ex').textContent=ex?`"${ex}"`:'' ;
  popup.querySelector('#pp-save').textContent=saved?'✓ In word bank':'+ Word bank';
  popup.querySelector('#pp-save').disabled=saved;
  popup.hidden=false;
}
function closePopup(){const p=_root&&_root.querySelector('#guts-popup');if(p)p.hidden=true;}
function findExample(lesson,word){const re=new RegExp(`\\b${word}\\b`,'i');for(const c of lesson.chunks){const m=c.sentences.find(s=>re.test(s));if(m)return m.slice(0,120)+(m.length>120?'…':'');}return '';}

function toggleDrillMode(){
  _drillMode=!_drillMode;
  const btn=_root.querySelector('#drill-btn');
  _root.querySelectorAll('.guts-pattern').forEach(p=>{
    const text=p.querySelector('.guts-pattern__text');
    if(_drillMode){text.dataset.orig=text.textContent;text.innerHTML=`<span class="guts-drill-hidden">Tap to reveal</span>`;text.addEventListener('click',function f(){text.textContent=text.dataset.orig;text.removeEventListener('click',f);},{once:true});}
    else{if(text.dataset.orig)text.textContent=text.dataset.orig;}
  });
  if(btn)btn.textContent=_drillMode?'✕ Exit drill':'◈ Drill mode';
}

function generateQuestions(lesson){
  const qs=[],vocab=lesson.allVocab.filter(w=>w.length>4);
  for(const chunk of lesson.chunks){
    for(const sent of chunk.sentences){
      const word=vocab.find(w=>sent.toLowerCase().includes(w));
      if(word&&(sent.match(/\b\w+\b/g)||[]).length>=6){
        const blanked=sent.replace(new RegExp(`\\b${word}\\b`,'gi'),'_____');
        const wrong=vocab.filter(w=>w!==word).slice(0,3);
        if(wrong.length<1)continue;
        const opts=shuffle([word,...wrong]).slice(0,4);
        qs.push({type:'fill',sentence:blanked,answer:word,options:opts});
        if(qs.length>=3)return qs;
      }
    }
  }
  return qs;
}

function renderQuiz(questions){
  const el=_root.querySelector('#guts-quiz');if(!el)return;
  el.innerHTML=questions.map((q,i)=>`<div class="guts-quiz-q"><div class="guts-quiz-q__sent">${esc(q.sentence)}</div><div class="guts-quiz-q__opts">${q.options.map(o=>`<button class="guts-quiz-opt" data-q="${i}" data-opt="${esc(o)}" data-ans="${esc(q.answer)}">${esc(o)}</button>`).join('')}</div><div class="guts-quiz-q__result" id="qr-${i}"></div></div>`).join('');
  el.querySelectorAll('.guts-quiz-opt').forEach(btn=>btn.addEventListener('click',()=>{
    const qi=btn.dataset.q,correct=btn.dataset.opt===btn.dataset.ans,res=_root.querySelector(`#qr-${qi}`);
    _root.querySelectorAll(`.guts-quiz-opt[data-q="${qi}"]`).forEach(b=>{b.disabled=true;if(b.dataset.opt===btn.dataset.ans)b.classList.add('is-correct');else if(b===btn)b.classList.add('is-wrong');});
    if(res){res.textContent=correct?'✓ Correct!':`Answer: ${btn.dataset.ans}`;res.style.color=correct?'var(--ok)':'var(--warn)';}
  }));
}
function shuffle(arr){return[...arr].sort(()=>Math.random()-.5);}

/* ── WORD BANK ────────────────────────────────────── */
function renderWordBank(){
  const now=Date.now(),sevenD=7*24*60*60*1000,sorted=[..._wordbank].sort((a,b)=>b.savedAt-a.savedAt),total=sorted.length;
  _root.innerHTML=`${navBar('wordbank')}<div class="guts-section-label">${total} SAVED WORD${total!==1?'S':''}</div>${total===0?`<div class="placeholder"><div class="placeholder__icon">💡</div><div>No words saved yet</div><div style="margin-top:6px;font-size:10px;color:var(--ink-dim)">Tap any word while reading a lesson</div></div>`:`<div class="guts-wb-grid" id="guts-wb-grid"></div>`}`;
  if(total>0){
    const grid=_root.querySelector('#guts-wb-grid');
    sorted.forEach(entry=>{
      const needsReview=(now-(entry.lastReviewed||entry.savedAt))>sevenD;
      const card=document.createElement('div');card.className=`guts-wb-card${needsReview?' guts-wb-card--review':''}`;
      card.innerHTML=`${needsReview?`<div class="guts-wb-card__review-badge">🔁 Review</div>`:''}<div class="guts-wb-card__word">${esc(entry.word)}</div>${entry.hindi?`<div class="guts-wb-card__hindi">${esc(entry.hindi)}</div>`:''} ${entry.example?`<div class="guts-wb-card__example">"${esc(entry.example)}"</div>`:''}<div class="guts-wb-card__footer"><span class="guts-wb-card__date">Saved ${fmtDate(entry.savedAt)}</span><div style="display:flex;gap:6px"><button class="guts-wb-card__listen" data-word="${esc(entry.word)}">▶</button><button class="guts-wb-card__del" data-id="${esc(entry.id)}">✕</button></div></div>`;
      card.querySelector('.guts-wb-card__del').addEventListener('click',async e=>{e.stopPropagation();await deleteWord(entry.id);toast('Word removed');renderWordBank();});
      card.querySelector('.guts-wb-card__listen').addEventListener('click',e=>{e.stopPropagation();speakText(`${entry.word}. ${entry.hindi||''} ${entry.example||''}`,_speechRate);entry.lastReviewed=Date.now();db.put(STORE_W,entry);});
      grid.appendChild(card);
    });
  }
}

/* ── NOTES ────────────────────────────────────────── */
function renderNotes(){
  const pages=_notes,active=_noteId?pages.find(n=>n.id===_noteId):pages[0];
  _root.innerHTML=`${navBar('notes')}
<div class="guts-pages-nav">${pages.map((p,i)=>`<button class="guts-page-btn ${active&&p.id===active.id?'is-active':''}" data-id="${esc(p.id)}">Page ${i+1}</button>`).join('')}<button class="guts-page-btn guts-page-btn--add" id="add-page">+</button></div>
${active?`<div class="guts-note-editor">
  <input type="text" class="guts-note-title" id="note-title" value="${esc(active.title)}" placeholder="Page title…" maxlength="60">
  <div class="guts-rte-toolbar">
    <button class="guts-rte-btn" data-cmd="bold" title="Bold"><strong>B</strong></button>
    <button class="guts-rte-btn" data-cmd="heading" title="Heading">H</button>
    <button class="guts-rte-btn" data-cmd="highlight" title="Highlight">◐</button>
    <button class="guts-rte-btn" data-cmd="preview" title="Preview" id="preview-btn">👁</button>
    <button class="guts-rte-btn" data-cmd="fontsize" title="Font size">aA</button>
    <label class="guts-rte-btn" title="Attach image" style="cursor:pointer">📎<input type="file" id="attach-input" accept="image/*" hidden></label>
    <div style="flex:1"></div>
    <button class="guts-rte-btn guts-rte-btn--ra" id="note-ra-play">▶ Read</button>
    <button class="guts-rte-btn guts-rte-btn--danger" id="del-page">✕</button>
  </div>
  <div class="guts-rte" id="guts-rte" contenteditable="true" data-placeholder="Start writing your story or notes here…">${active.content||''}</div>
  <div class="guts-note-footer">
    <span id="note-status" style="font-size:9px;color:var(--ink-faint)">Auto-saved</span>
    <span style="font-size:9px;color:var(--ink-faint)">Updated ${fmtDate(active.updatedAt||active.createdAt)}</span>
  </div>
</div>
`:`<div class="placeholder" style="margin-top:20px"><div class="placeholder__icon">📝</div><div>No pages yet — tap + to create one</div></div>`}`;
  bindNotes(active,pages);
}

function bindNotes(active,pages){
  _root.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>{_noteId=btn.dataset.id;renderNotes();}));
  _root.querySelector('#add-page').addEventListener('click',async()=>{
    const note={id:'note_'+Date.now(),pageNum:pages.length+1,title:`Page ${pages.length+1}`,content:'',createdAt:Date.now(),updatedAt:Date.now()};
    await saveNote(note);_noteId=note.id;renderNotes();
  });
  if(!active)return;
  const rte=_root.querySelector('#guts-rte'),titleEl=_root.querySelector('#note-title'),status=_root.querySelector('#note-status');
  const autoSave=async()=>{
    active.content=rte.innerHTML;active.title=titleEl.value||`Page ${pages.indexOf(active)+1}`;active.updatedAt=Date.now();
    await saveNote(active);if(status)status.textContent='Saved ✓';setTimeout(()=>{if(status)status.textContent='Auto-saved';},1500);
    const words=[...new Set((rte.innerText.match(/\b[a-zA-Z]{7,}\b/g)||[]).filter(w=>!COMMON_WORDS.has(w.toLowerCase())).map(w=>w.toLowerCase()))];
    if(words.length>0)await updateKnowledge(words,active.id);
  };
  rte.addEventListener('input',()=>{if(status)status.textContent='Unsaved…';clearTimeout(_saveTimer);_saveTimer=setTimeout(autoSave,1500);});
  titleEl.addEventListener('blur',autoSave);
  let _fontSize=1,_previewMode=false;
  const fontSizes=['12px','14px','18px'];
  _root.querySelectorAll('.guts-rte-btn[data-cmd]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const cmd=btn.dataset.cmd;rte.focus();
      if(cmd==='bold')document.execCommand('bold',false,null);
      else if(cmd==='heading')document.execCommand('formatBlock',false,'h3');
      else if(cmd==='highlight')document.execCommand('hiliteColor',false,'rgba(212,255,58,0.25)');
      else if(cmd==='preview'){_previewMode=!_previewMode;rte.contentEditable=_previewMode?'false':'true';rte.style.background=_previewMode?'var(--bg-soft)':'';btn.classList.toggle('is-active',_previewMode);}
      else if(cmd==='fontsize'){_fontSize=(_fontSize+1)%3;rte.style.fontSize=fontSizes[_fontSize];}
    });
  });
  _root.querySelector('#attach-input').addEventListener('change',async(e)=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();reader.onload=()=>{rte.focus();document.execCommand('insertHTML',false,`<img src="${reader.result}" style="max-width:100%;border-radius:4px;margin:6px 0">`)};
    reader.readAsDataURL(file);e.target.value='';
  });
  _root.querySelector('#del-page').addEventListener('click',async()=>{if(!confirm(`Delete "${active.title}"?`))return;await deleteNote(active.id);_noteId=null;toast('Page deleted');renderNotes();});
  _root.querySelector('#note-ra-play').addEventListener('click',()=>{const text=rte.innerText||'';if(!text.trim()){toast('Nothing to read','warn');return;}speakText(text,_speechRate);});
}

/* ── EXPORT / IMPORT ──────────────────────────────── */
function renderTransfer(){
  _root.innerHTML=`${navBar('transfer')}
<div class="guts-section-label">Export your data</div>
<div class="set-card">
  <div class="set-row"><span class="set-row__k">LESSONS</span><span class="set-row__v" style="color:var(--lime)">${_lessons.length}</span></div>
  <div class="set-row"><span class="set-row__k">WORD BANK</span><span class="set-row__v" style="color:var(--lime)">${_wordbank.length} words</span></div>
  <div class="set-row"><span class="set-row__k">NOTES</span><span class="set-row__v" style="color:var(--lime)">${_notes.length} pages</span></div>
  <div class="set-row"><span class="set-row__k">KNOWLEDGE</span><span class="set-row__v" style="color:var(--lime)">${_knowledge.size} words learned</span></div>
</div>
<button class="vault-tool-btn" id="guts-export" style="width:100%;margin-top:10px">⬇ Export all data</button>
<div class="guts-section-label" style="margin-top:22px">Import from backup</div>
<div class="set-card"><div class="set-row"><span class="set-row__k">NOTE</span><span class="set-row__v" style="font-size:10px;color:var(--ink-dim)">Merges with existing. Duplicates overwritten.</span></div></div>
<label class="vault-tool-btn" style="width:100%;margin-top:10px;display:flex;align-items:center;justify-content:center;cursor:pointer">⬆ Import backup file<input type="file" id="guts-import-file" accept=".json" hidden></label>
<div id="guts-import-result" style="margin-top:10px;font-size:11px;color:var(--ink-dim)"></div>`;
  _root.querySelector('#guts-export').addEventListener('click',exportData);
  _root.querySelector('#guts-import-file').addEventListener('change',async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    try{const result=await importData(file);const r=_root.querySelector('#guts-import-result');if(r){r.textContent=result;r.style.color='var(--ok)';}}
    catch(err){toast('Import failed: '+err.message,'err');}
  });
}

async function exportData(){
  if(!_lessons.length&&!_wordbank.length&&!_notes.length){toast('Nothing to export yet','warn');return;}
  const data={app:'SmartApp — Get Up To Speed',version:'0.2',exportedAt:new Date().toISOString(),lessons:_lessons,wordbank:_wordbank,notes:_notes,knowledge:[..._knowledge.values()]};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`guts-backup-${new Date().toISOString().slice(0,10)}.json`});
  a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('✓ Export downloaded');
}

async function importData(file){
  const data=JSON.parse(await file.text());
  if(!Array.isArray(data.lessons))throw new Error('Invalid GUTS backup file');
  for(const l of(data.lessons||[]))await db.put(STORE_L,l);
  for(const w of(data.wordbank||[]))await db.put(STORE_W,w);
  for(const n of(data.notes||[]))await db.put(STORE_N,n);
  for(const k of(data.knowledge||[]))await db.put(STORE_K,k);
  await refreshAll();toast('✓ Import complete');
  return `✓ Imported ${data.lessons.length} lessons · ${data.wordbank.length} words · ${(data.notes||[]).length} notes`;
}

/* ── READ ALOUD ENGINE ────────────────────────────── */
function speakText(text,rate=1.0,onSentence=null){
  if(!('speechSynthesis' in window)){toast('Speech not supported on this browser','warn');return;}
  stopSpeech();
  const sents=tokenizeSentences(stripHTML(text));
  if(!sents.length)return;
  _speechSents=sents;_speechIdx=0;_speaking=true;_paused=false;_speechRate=rate;_speechCb=onSentence;
  speakNext();
}
function speakNext(){
  if(!_speaking||_speechIdx>=_speechSents.length){_speaking=false;if(_speechCb)_speechCb(-1);updateRABtns();return;}
  const text=_speechSents[_speechIdx];
  if(_speechCb)_speechCb(_speechIdx);
  const u=new SpeechSynthesisUtterance(text);u.rate=_speechRate;u.lang='en-US';
  u.onend=()=>{_speechIdx++;speakNext();};u.onerror=()=>{_speechIdx++;speakNext();};
  window.speechSynthesis.speak(u);updateRABtns();
}
function stopSpeech(){_speaking=false;_paused=false;if('speechSynthesis' in window)window.speechSynthesis.cancel();if(_speechCb){_speechCb(-1);_speechCb=null;}updateRABtns();}
function updateRABtns(){
  if(!_root)return;
  const play=_root.querySelector('#ra-play'),pause=_root.querySelector('#ra-pause'),stop=_root.querySelector('#ra-stop');
  if(!play)return;
  play.disabled=_speaking&&!_paused;pause.disabled=!_speaking||_paused;stop.disabled=!_speaking;
  play.textContent=_paused?'▶ Resume':'▶';
}
function bindReadAloud(sentences){
  const play=_root.querySelector('#ra-play'),pause=_root.querySelector('#ra-pause'),stop=_root.querySelector('#ra-stop');
  if(!play)return;
  play.addEventListener('click',()=>{
    if(_paused){_paused=false;window.speechSynthesis.resume();updateRABtns();return;}
    const allText=sentences.join(' ');
    speakText(allText,_speechRate,(idx)=>{
      _root.querySelectorAll('.guts-chunk__text').forEach(el=>el.classList.remove('guts-chunk--speaking'));
      if(idx>=0){const ci=Math.floor(idx/3),c=_root.querySelector(`#chunk-${ci}`);if(c)c.querySelector('.guts-chunk__text')?.classList.add('guts-chunk--speaking');}
    });
  });
  pause.addEventListener('click',()=>{if(_paused){_paused=false;window.speechSynthesis.resume();}else{_paused=true;window.speechSynthesis.pause();}updateRABtns();});
  stop.addEventListener('click',()=>{stopSpeech();_root.querySelectorAll('.guts-chunk__text').forEach(el=>el.classList.remove('guts-chunk--speaking'));});
  _root.querySelectorAll('.guts-ra-speed').forEach(btn=>btn.addEventListener('click',()=>{
    _speechRate=parseFloat(btn.dataset.rate);_root.querySelectorAll('.guts-ra-speed').forEach(b=>b.classList.remove('is-active'));btn.classList.add('is-active');
    if(_speaking){stopSpeech();setTimeout(()=>speakText(sentences.join(' '),_speechRate),100);}
  }));
  updateRABtns();
}
function stripHTML(html){const d=document.createElement('div');d.innerHTML=html;return d.innerText||d.textContent||'';}

/* ── TEXT PROCESSOR ───────────────────────────────── */
function processText(raw,title,source){
  const clean=cleanText(raw),chunks=chunkText(clean),analyzed=chunks.map(analyzeChunk);
  const lesson=buildLesson(analyzed,title||autoTitle(clean),source,raw.length);
  lesson.questions=generateQuestions(lesson);return lesson;
}
function cleanText(raw){return raw.replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/g,'').replace(/^[A-Z][A-Za-z\s]{0,25}:\s*/gm,'').replace(/<[^>]+>/g,' ').replace(/[ \t]+/g,' ').replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
function chunkText(text){
  let paras=text.split(/\n\n+/).map(p=>p.replace(/\n/g,' ').trim()).filter(p=>p.length>30);
  if(paras.length>=2)return paras;
  const sents=tokenizeSentences(text),out=[];
  for(let i=0;i<sents.length;i+=3){const c=sents.slice(i,i+3).join(' ').trim();if(c.length>20)out.push(c);}
  return out.length?out:[text];
}
function tokenizeSentences(text){return text.replace(/([.!?])\s+(?=[A-Z"'])/g,'$1|||').split('|||').map(s=>s.trim()).filter(s=>s.length>8);}
function analyzeChunk(text){
  const sents=tokenizeSentences(text),words=text.match(/\b[a-zA-Z]+\b/g)||[];
  const patterns=sents.filter(s=>(s.match(/\b\w+\b/g)||[]).length>=12);
  const vocab=[...new Set(words.filter(w=>w.length>=7&&!COMMON_WORDS.has(w.toLowerCase())).map(w=>w.toLowerCase()))].slice(0,10);
  const lower=text.toLowerCase(),phrases=COMMON_PHRASES.filter(p=>lower.includes(p));
  return{text,sentences:sents,patterns,vocab,phrases};
}
function buildLesson(chunks,title,source,sourceLength){
  const id='guts_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),now=Date.now();
  return{id,title,source,sourceLength,createdAt:now,status:'unread',chunks,allVocab:[...new Set(chunks.flatMap(c=>c.vocab))],allPhrases:[...new Set(chunks.flatMap(c=>c.phrases))],allPatterns:chunks.flatMap(c=>c.patterns),questions:[]};
}
function autoTitle(text){const f=tokenizeSentences(text)[0]||text;return f.slice(0,60).trim()+(f.length>60?'…':'');}

/* ── HINDI DICTIONARY 500+ ────────────────────────── */
const HINDI_DICT={
  fluency:'प्रवाह',fluent:'धाराप्रवाह',vocabulary:'शब्द भंडार',grammar:'व्याकरण',pronunciation:'उच्चारण',communicate:'संवाद करना',conversation:'बातचीत',expression:'अभिव्यक्ति',language:'भाषा',understand:'समझना',practice:'अभ्यास',improve:'सुधारना',learning:'सीखना',knowledge:'ज्ञान',lesson:'पाठ',sentence:'वाक्य',meaning:'अर्थ',translate:'अनुवाद करना',listen:'सुनना',speaking:'बोलना',writing:'लिखना',reading:'पढ़ना',comprehend:'समझना',articulate:'स्पष्ट बोलना',eloquent:'वाक्पटु',bilingual:'द्विभाषी',interpret:'व्याख्या करना',narrate:'वर्णन करना',describe:'वर्णन करना',explain:'समझाना',define:'परिभाषित करना',clarify:'स्पष्ट करना',emphasize:'जोर देना',summarize:'सारांश देना',elaborate:'विस्तार करना',illustrate:'चित्रित करना',simplify:'सरल करना',paraphrase:'दूसरे शब्दों में',transcript:'लिखित प्रति',
  confidence:'आत्मविश्वास',motivation:'प्रेरणा',resilience:'लचीलापन',perspective:'दृष्टिकोण',imagination:'कल्पना',creativity:'रचनात्मकता',awareness:'जागरूकता',mindset:'मानसिकता',potential:'क्षमता',discipline:'अनुशासन',patience:'धैर्य',commitment:'प्रतिबद्धता',consistent:'लगातार',progress:'प्रगति',achievement:'उपलब्धि',success:'सफलता',failure:'विफलता',challenge:'चुनौती',opportunity:'अवसर',experience:'अनुभव',wisdom:'बुद्धिमानी',intelligence:'बुद्धि',intuition:'अंतर्ज्ञान',perception:'अनुभूति',curiosity:'जिज्ञासा',determination:'दृढ़ संकल्प',perseverance:'दृढ़ता',ambition:'महत्वाकांक्षा',aspiration:'आकांक्षा',inspiration:'प्रेरणा',transformation:'परिवर्तन',evolution:'विकास',adaptation:'अनुकूलन',innovation:'नवाचार',breakthrough:'सफलता',overcome:'पार करना',accomplish:'प्राप्त करना',strive:'प्रयास करना',pursue:'अनुसरण करना',dedicate:'समर्पित करना',focus:'ध्यान केंद्रित',concentrate:'केंद्रित करना',reflect:'विचार करना',contemplate:'चिंतन करना',analyze:'विश्लेषण करना',evaluate:'मूल्यांकन करना',prioritize:'प्राथमिकता देना',organize:'व्यवस्थित करना',
  philosophy:'दर्शनशास्त्र',psychology:'मनोविज्ञान',spirituality:'आध्यात्मिकता',principle:'सिद्धांत',strategy:'रणनीति',process:'प्रक्रिया',effective:'प्रभावी',efficient:'कुशल',essential:'आवश्यक',important:'महत्वपूर्ण',valuable:'मूल्यवान',meaningful:'सार्थक',significant:'महत्वपूर्ण',fundamental:'मूलभूत',determine:'निर्धारित करना',establish:'स्थापित करना',demonstrate:'प्रदर्शित करना',recognize:'पहचानना',appreciate:'सराहना करना',theory:'सिद्धांत',concept:'अवधारणा',hypothesis:'परिकल्पना',argument:'तर्क',evidence:'प्रमाण',analysis:'विश्लेषण',interpretation:'व्याख्या',conclusion:'निष्कर्ष',assumption:'धारणा',implication:'निहितार्थ',consequence:'परिणाम',pattern:'पैटर्न',structure:'संरचना',framework:'ढांचा',mechanism:'तंत्र',phenomenon:'घटना',paradigm:'प्रतिमान',complexity:'जटिलता',ambiguity:'अस्पष्टता',paradox:'विरोधाभास',diversity:'विविधता',inclusion:'समावेश',sustainability:'स्थिरता',integrity:'ईमानदारी',
  happiness:'खुशी',sadness:'दुख',excitement:'उत्साह',enthusiasm:'उत्साह',passion:'जुनून',compassion:'करुणा',empathy:'सहानुभूति',sympathy:'सहानुभूति',gratitude:'कृतज्ञता',forgiveness:'क्षमा',hope:'आशा',loneliness:'अकेलापन',contentment:'संतोष',frustration:'निराशा',disappointment:'निराशा',satisfaction:'संतुष्टि',pride:'गर्व',shame:'शर्म',guilt:'दोष',jealousy:'ईर्ष्या',admiration:'प्रशंसा',respect:'सम्मान',trust:'विश्वास',doubt:'संदेह',confusion:'भ्रम',surprise:'आश्चर्य',wonder:'आश्चर्य',nostalgia:'पुरानी यादें',melancholy:'उदासी',serenity:'शांति',tranquility:'शांति',overwhelmed:'अभिभूत',motivated:'प्रेरित',curious:'जिज्ञासु',nervous:'घबराया',grateful:'कृतज्ञ',anxious:'चिंतित',joyful:'आनंदित',peaceful:'शांतिपूर्ण',restless:'बेचैन',fearful:'भयभीत',
  achieve:'प्राप्त करना',believe:'विश्वास करना',consider:'विचार करना',develop:'विकसित करना',encourage:'प्रोत्साहित करना',facilitate:'सुगम करना',generate:'उत्पन्न करना',implement:'लागू करना',investigate:'जांच करना',justify:'उचित ठहराना',maintain:'बनाए रखना',negotiate:'बातचीत करना',observe:'देखना',participate:'भाग लेना',respond:'जवाब देना',support:'समर्थन करना',utilize:'उपयोग करना',validate:'मान्य करना',acquire:'प्राप्त करना',collaborate:'सहयोग करना',contribute:'योगदान देना',coordinate:'समन्वय करना',create:'बनाना',debate:'बहस करना',examine:'जांच करना',explore:'खोज करना',identify:'पहचानना',integrate:'एकीकृत करना',manage:'प्रबंधन करना',monitor:'निगरानी करना',motivate:'प्रेरित करना',perform:'प्रदर्शन करना',promote:'बढ़ावा देना',publish:'प्रकाशित करना',suggest:'सुझाना',supervise:'निगरानी करना',teach:'सिखाना',transform:'बदलना',verify:'सत्यापित करना',visualize:'कल्पना करना',
  accurate:'सटीक',authentic:'प्रामाणिक',brilliant:'शानदार',capable:'सक्षम',decisive:'निर्णायक',dedicated:'समर्पित',flexible:'लचीला',focused:'केंद्रित',generous:'उदार',genuine:'वास्तविक',graceful:'कृपाशील',humble:'विनम्र',innovative:'अभिनव',insightful:'अंतर्दृष्टिपूर्ण',intentional:'जानबूझकर',logical:'तार्किक',methodical:'व्यवस्थित',objective:'वस्तुनिष्ठ',optimistic:'आशावादी',organized:'व्यवस्थित',persistent:'दृढ़',practical:'व्यावहारिक',proactive:'सक्रिय',productive:'उत्पादक',professional:'पेशेवर',reliable:'विश्वसनीय',resourceful:'साधन-संपन्न',responsible:'जिम्मेदार',sensitive:'संवेदनशील',sincere:'ईमानदार',skilled:'कुशल',strategic:'रणनीतिक',structured:'संरचित',systematic:'व्यवस्थित',thoughtful:'विचारशील',thorough:'संपूर्ण',versatile:'बहुमुखी',vibrant:'जीवंत',visionary:'दूरदर्शी',adaptive:'अनुकूलनीय',analytical:'विश्लेषणात्मक',collaborative:'सहयोगी',comprehensive:'व्यापक',constructive:'रचनात्मक',dynamic:'गतिशील',ethical:'नैतिक',
  moment:'पल',duration:'अवधि',century:'सदी',sequence:'क्रम',frequency:'आवृत्ति',interval:'अंतराल',distance:'दूरी',location:'स्थान',position:'स्थिति',direction:'दिशा',boundary:'सीमा',horizon:'क्षितिज',landscape:'परिदृश्य',territory:'क्षेत्र',surrounding:'आसपास',atmosphere:'वातावरण',circumstance:'परिस्थिति',situation:'स्थिति',background:'पृष्ठभूमि',foundation:'नींव',origin:'उत्पत्ति',destination:'मंजिल',transition:'परिवर्तन',momentum:'गति',trajectory:'प्रक्षेपवक्र',
  ecosystem:'पारिस्थितिकी',biodiversity:'जैव विविधता',conservation:'संरक्षण',climate:'जलवायु',geography:'भूगोल',wilderness:'जंगल',vegetation:'वनस्पति',mountain:'पर्वत',river:'नदी',ocean:'महासागर',forest:'वन',season:'मौसम',rainfall:'वर्षा',temperature:'तापमान',organic:'जैविक',renewable:'नवीकरणीय',ecological:'पारिस्थितिक',biological:'जैविक',
  profession:'पेशा',career:'करियर',industry:'उद्योग',organization:'संगठन',management:'प्रबंधन',leadership:'नेतृत्व',productivity:'उत्पादकता',efficiency:'दक्षता',revenue:'राजस्व',investment:'निवेश',entrepreneurship:'उद्यमिता',infrastructure:'बुनियादी ढांचा',technology:'प्रौद्योगिकी',marketing:'विपणन',partnership:'साझेदारी',stakeholder:'हितधारक',deadline:'समय सीमा',milestone:'मील का पत्थर',feedback:'प्रतिक्रिया',performance:'प्रदर्शन',accountability:'जवाबदेही',transparency:'पारदर्शिता',governance:'शासन',compliance:'अनुपालन',implementation:'कार्यान्वयन',recommendation:'सिफारिश',
  wellness:'स्वास्थ्य',nutrition:'पोषण',meditation:'ध्यान',mindfulness:'सजगता',therapy:'चिकित्सा',diagnosis:'निदान',treatment:'उपचार',prevention:'रोकथाम',recovery:'स्वास्थ्य लाभ',immunity:'प्रतिरक्षा',metabolism:'चयापचय',consciousness:'चेतना',relaxation:'विश्राम',vitality:'जीवन शक्ति',stamina:'सहनशक्ति',endurance:'धीरज',strength:'शक्ति',balance:'संतुलन',coordination:'समन्वय',breathing:'श्वास',rehabilitation:'पुनर्वास',healing:'उपचार',longevity:'दीर्घायु',lifestyle:'जीवन शैली',
  relationship:'संबंध',friendship:'मित्रता',community:'समुदाय',society:'समाज',culture:'संस्कृति',tradition:'परंपरा',heritage:'विरासत',equality:'समानता',justice:'न्याय',democracy:'लोकतंत्र',freedom:'स्वतंत्रता',responsibility:'जिम्मेदारी',mentorship:'मार्गदर्शन',cooperation:'सहयोग',tolerance:'सहिष्णुता',celebration:'उत्सव',recognition:'पहचान',encouragement:'प्रोत्साहन',guidance:'मार्गदर्शन',empowering:'सशक्त बनाना',
};

const COMMON_WORDS=new Set(['the','be','to','of','and','a','in','that','have','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when','make','can','like','time','no','just','him','know','take','people','into','year','your','good','some','could','them','see','other','than','then','now','look','only','come','its','over','think','also','back','after','use','two','how','our','work','first','well','way','even','new','want','because','any','these','give','day','most','need','large','often','hand','high','place','hold','turn','help','start','never','next','hard','open','seem','always','both','show','feel','long','those','old','face','tell','keep','every','find','much','still','though','should','where','does','around','three','small','set','put','end','another','right','big','too','many','before','must','through','under','little','being','while','become','already','against','without','same','different','including','however','between','might','going','great','here','were','been','used','said','each','more','very','made','such','once','away','down']);
const COMMON_PHRASES=['get up to speed','bear in mind','keep in mind','on the other hand','in other words','as a result','for example','for instance','in addition','at the same time','in fact','as well as','more than ever','look forward to','take for granted','point of view','make a difference','come up with','put up with','go ahead','at least','in order to','as long as','even though','in spite of','due to','according to','in terms of','take part in','make sure','find out','figure out','right away','after all','all of a sudden','once in a while','sooner or later','on the whole','as far as','in general','all the time','at first','to begin with','by the way','on top of that','as a matter of fact','in the long run','at the end of the day','when it comes to','in my opinion','based on','in contrast','get rid of','keep in touch','run out of','look up to','carry on','catch up','give up','hold on','move on','set aside','stand out','take over','turn out','work out'];

function statusClass(s){return s==='done'?'guts-status--done':s==='reading'?'guts-status--reading':'guts-status--unread';}
function statusLabel(s){return s==='done'?'✓ Done':s==='reading'?'▶ Reading':'○ Unread';}
function fmtDate(ts){return new Date(ts).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'2-digit'});}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ── STYLES ───────────────────────────────────────── */
function injectStyles(){
  if(document.getElementById('guts-styles'))return;
  _styleEl=document.createElement('style');_styleEl.id='guts-styles';
  _styleEl.textContent=`.guts-nav{display:flex;gap:4px;padding-bottom:14px;overflow-x:auto;-webkit-overflow-scrolling:touch}.guts-nav__btn{flex-shrink:0;padding:5px 10px;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-dim);border:1px solid var(--line);border-radius:var(--radius);background:transparent;cursor:pointer;transition:all .12s}.guts-nav__btn.is-active{color:var(--lime);border-color:var(--lime-dim);background:rgba(212,255,58,.06)}.guts-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:16px}.guts-stat{background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);padding:9px 6px;text-align:center}.guts-stat__n{display:block;font-family:var(--serif);font-size:26px;line-height:1;color:var(--lime)}.guts-stat__l{display:block;font-size:8px;letter-spacing:.12em;color:var(--ink-faint);margin-top:3px}.guts-review-banner{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(212,255,58,.06);border:1px solid var(--lime-dim);border-radius:var(--radius);margin-bottom:14px;cursor:pointer;font-size:11px;color:var(--ink-dim)}.guts-section-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-faint);margin:4px 0 10px;display:flex;align-items:center;gap:8px}.guts-section-label::after{content:'';flex:1;height:1px;background:var(--line-soft)}.guts-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.guts-action-btn{display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 8px;background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim);cursor:pointer;transition:all .12s}.guts-action-btn:hover{border-color:var(--lime-dim);color:var(--lime)}.guts-action-btn__icon{font-size:20px}.guts-lesson-card{position:relative;background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;cursor:pointer;transition:border-color .15s;margin-bottom:8px}.guts-lesson-card:hover{border-color:var(--lime-dim)}.guts-lesson-card--featured{border-color:var(--lime-dim)}.guts-lesson-card__status{font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}.guts-status--unread{color:var(--ink-faint)}.guts-status--reading{color:var(--warn)}.guts-status--done{color:var(--ok)}.guts-lesson-card__title{font-family:var(--serif);font-size:19px;line-height:1.2;color:var(--ink);margin-bottom:5px}.guts-lesson-card__meta{font-size:9px;color:var(--ink-faint)}.guts-lesson-card__arrow{position:absolute;right:14px;top:50%;transform:translateY(-50%);color:var(--ink-dim)}.guts-input{width:100%;padding:8px 10px;background:var(--bg-soft);border:1px solid var(--line);border-radius:var(--radius);color:var(--ink);font-family:var(--mono);font-size:12px}.guts-input:focus{outline:1px solid var(--lime-dim);border-color:var(--lime-dim)}.guts-label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:5px}.guts-label__hint{margin-left:6px;color:var(--ink-faint);font-size:9px;text-transform:none;letter-spacing:0}.guts-tabs{display:flex;gap:6px;margin-bottom:10px}.guts-tab{flex:1;padding:7px;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);border-radius:var(--radius);background:transparent;color:var(--ink-dim);cursor:pointer;transition:all .12s}.guts-tab.is-active{border-color:var(--lime-dim);color:var(--lime);background:rgba(212,255,58,.06)}.guts-textarea{width:100%;padding:10px;background:var(--bg-soft);border:1px solid var(--line);border-radius:var(--radius);color:var(--ink);font-family:var(--mono);font-size:12px;line-height:1.55;resize:vertical;min-height:160px}.guts-textarea:focus{outline:1px solid var(--lime-dim);border-color:var(--lime-dim)}.guts-char-count{font-size:9px;color:var(--ink-faint)}.guts-dropzone{display:flex;flex-direction:column;align-items:center;gap:5px;padding:24px 14px;border:1px dashed var(--line);border-radius:var(--radius);cursor:pointer;text-align:center;transition:border-color .15s;margin-bottom:8px}.guts-dropzone:hover{border-color:var(--lime-dim)}.guts-dropzone__text{font-size:12px;color:var(--ink-dim)}.guts-dropzone__hint{font-size:10px;color:var(--ink-faint)}.guts-file-preview{background:var(--bg-soft);border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;margin-bottom:8px}.guts-file-preview__name{font-size:12px;color:var(--lime);margin-bottom:3px}.guts-file-preview__meta{font-size:10px;color:var(--ink-faint);margin-bottom:5px}.guts-file-preview__peek{font-size:10px;color:var(--ink-dim);white-space:pre-wrap;word-break:break-word;max-height:80px;overflow:hidden}.guts-reader__header{background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;margin-bottom:10px}.guts-reader__title{font-family:var(--serif);font-size:22px;line-height:1.2;margin-bottom:4px}.guts-reader__meta{font-size:10px;color:var(--ink-faint);margin-bottom:10px}.guts-reader__controls{display:flex;gap:6px;flex-wrap:wrap}.guts-ra-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:10px;flex-wrap:wrap}.guts-ra-btn{padding:4px 10px;font-family:var(--mono);font-size:11px;font-weight:700;background:transparent;border:1px solid var(--line);border-radius:var(--radius);color:var(--ink-dim);cursor:pointer;transition:all .12s}.guts-ra-btn:not(:disabled):hover{border-color:var(--lime-dim);color:var(--lime)}.guts-ra-btn:disabled{opacity:.35;cursor:not-allowed}.guts-ra-speeds{display:flex;gap:4px;margin-left:4px}.guts-ra-speed{padding:3px 7px;font-family:var(--mono);font-size:9px;border:1px solid var(--line);border-radius:3px;background:transparent;color:var(--ink-faint);cursor:pointer}.guts-ra-speed.is-active{border-color:var(--lime-dim);color:var(--lime);background:rgba(212,255,58,.06)}.guts-chunks{display:flex;flex-direction:column;gap:9px;margin-bottom:10px}.guts-chunk{background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);padding:13px 14px}.guts-chunk__num{font-size:8px;color:var(--ink-faint);letter-spacing:.14em;margin-bottom:7px}.guts-chunk__text{font-size:13px;line-height:1.75;color:var(--ink)}.guts-chunk--speaking{background:rgba(212,255,58,.08)!important;border-color:var(--lime-dim)!important}.guts-chunk__tags{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px}.guts-word{cursor:pointer}.guts-word--known{color:var(--lime);text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px}.guts-word--saved{color:var(--ok)}.guts-word--freq{font-weight:600}.guts-badge{display:inline-block;padding:2px 7px;border-radius:3px;font-size:9px;letter-spacing:.06em}.guts-badge--phrase{background:rgba(212,255,58,.08);border:1px solid var(--lime-dim);color:var(--lime)}.guts-vocab-grid{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}.guts-vocab-chip{padding:4px 9px;background:var(--bg-tile);border:1px solid var(--line);border-radius:16px;font-family:var(--mono);font-size:10px;color:var(--ink-dim);cursor:pointer;transition:all .12s;display:flex;flex-direction:column;align-items:center;gap:1px}.guts-vocab-chip:hover{border-color:var(--lime-dim);color:var(--lime)}.guts-vocab-chip.is-saved{border-color:var(--ok);color:var(--ok)}.guts-vocab-chip__hi{font-size:8px;color:var(--lime)}.guts-vocab-chip__freq{font-size:8px;color:var(--warn)}.guts-patterns{display:flex;flex-direction:column;gap:7px;margin-bottom:10px}.guts-pattern{display:flex;gap:8px;align-items:flex-start;background:var(--bg-tile);border-left:2px solid var(--lime-dim);padding:9px 11px;border-radius:0 var(--radius) var(--radius) 0}.guts-pattern__ico{color:var(--lime-dim);flex-shrink:0;font-size:11px;padding-top:2px}.guts-pattern__text{font-size:12px;line-height:1.6;color:var(--ink);flex:1}.guts-pattern__listen{flex-shrink:0;font-size:11px;padding:2px 6px;background:transparent;border:1px solid var(--line);border-radius:3px;color:var(--ink-faint);cursor:pointer;transition:all .12s}.guts-pattern__listen:hover{border-color:var(--lime-dim);color:var(--lime)}.guts-mini-btn{font-size:9px;padding:2px 8px;background:transparent;border:1px solid var(--line);border-radius:3px;color:var(--ink-faint);cursor:pointer;margin-left:auto;transition:all .12s}.guts-mini-btn:hover{border-color:var(--lime-dim);color:var(--lime)}.guts-drill-hidden{color:var(--ink-faint);font-style:italic;font-size:11px;cursor:pointer;border-bottom:1px dashed var(--ink-faint)}.guts-phrase-list{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}.guts-phrase-row{display:flex}.guts-popup{position:fixed;bottom:70px;left:14px;right:14px;z-index:3000;background:var(--bg-tile);border:1px solid var(--lime-dim);border-radius:var(--radius);padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:guts-pop .18s ease}@keyframes guts-pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.guts-popup__word{font-family:var(--serif);font-size:26px;color:var(--ink);margin-bottom:2px}.guts-popup__freq{font-size:10px;margin-bottom:3px}.guts-popup__hindi{font-size:14px;margin-bottom:4px}.guts-popup__ex{font-size:10px;color:var(--ink-dim);font-style:italic;margin-bottom:10px;border-left:2px solid var(--line);padding-left:7px;line-height:1.5}.guts-popup__actions{display:flex;gap:6px;flex-wrap:wrap}.guts-quiz-q{background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px}.guts-quiz-q__sent{font-size:13px;line-height:1.6;color:var(--ink);margin-bottom:10px}.guts-quiz-q__opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}.guts-quiz-opt{padding:7px 10px;background:transparent;border:1px solid var(--line);border-radius:var(--radius);font-family:var(--mono);font-size:11px;color:var(--ink-dim);cursor:pointer;transition:all .12s}.guts-quiz-opt:hover:not(:disabled){border-color:var(--lime-dim);color:var(--lime)}.guts-quiz-opt.is-correct{border-color:var(--ok);color:var(--ok);background:rgba(111,226,124,.08)}.guts-quiz-opt.is-wrong{border-color:var(--warn);color:var(--warn)}.guts-quiz-q__result{font-size:11px;margin-top:8px;font-weight:700}.guts-wb-grid{display:flex;flex-direction:column;gap:8px}.guts-wb-card{background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}.guts-wb-card--review{border-color:var(--lime-dim)}.guts-wb-card__review-badge{display:inline-block;font-size:9px;color:var(--lime);letter-spacing:.08em;margin-bottom:4px}.guts-wb-card__word{font-family:var(--serif);font-size:22px;color:var(--ink);margin-bottom:3px}.guts-wb-card__hindi{font-size:13px;color:var(--lime);margin-bottom:5px}.guts-wb-card__example{font-size:11px;color:var(--ink-dim);font-style:italic;line-height:1.5;border-left:2px solid var(--line);padding-left:7px;margin-bottom:8px}.guts-wb-card__footer{display:flex;align-items:center;justify-content:space-between}.guts-wb-card__date{font-size:9px;color:var(--ink-faint)}.guts-wb-card__listen,.guts-wb-card__del{font-size:11px;background:none;border:none;cursor:pointer;padding:2px 6px;color:var(--ink-faint);transition:color .12s}.guts-wb-card__listen:hover{color:var(--lime)}.guts-wb-card__del:hover{color:var(--warn)}.guts-pages-nav{display:flex;gap:5px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px;-webkit-overflow-scrolling:touch}.guts-page-btn{flex-shrink:0;padding:5px 12px;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.08em;border:1px solid var(--line);border-radius:var(--radius);background:transparent;color:var(--ink-dim);cursor:pointer;transition:all .12s}.guts-page-btn.is-active{border-color:var(--lime-dim);color:var(--lime);background:rgba(212,255,58,.06)}.guts-page-btn--add{color:var(--lime);border-color:var(--lime-dim)}.guts-note-title{width:100%;padding:7px 10px;background:transparent;border:none;border-bottom:1px solid var(--line);color:var(--ink);font-family:var(--serif);font-size:24px;margin-bottom:10px;outline:none}.guts-note-title:focus{border-bottom-color:var(--lime-dim)}.guts-rte-toolbar{display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--bg-tile);border:1px solid var(--line);border-radius:var(--radius) var(--radius) 0 0;flex-wrap:wrap}.guts-rte-btn{padding:5px 8px;font-family:var(--mono);font-size:12px;border:1px solid var(--line);border-radius:4px;background:transparent;color:var(--ink-dim);cursor:pointer;transition:all .12s;white-space:nowrap}.guts-rte-btn:hover,.guts-rte-btn.is-active{border-color:var(--lime-dim);color:var(--lime);background:rgba(212,255,58,.06)}.guts-rte-btn--ra{color:var(--lime);border-color:var(--lime-dim)}.guts-rte-btn--danger{color:var(--warn)}.guts-rte-btn--danger:hover{border-color:var(--warn);background:rgba(255,122,58,.06)}.guts-rte{min-height:220px;padding:12px;background:var(--bg-soft);border:1px solid var(--line);border-top:none;border-radius:0 0 var(--radius) var(--radius);color:var(--ink);font-family:var(--mono);font-size:14px;line-height:1.7;outline:none;white-space:pre-wrap;word-break:break-word}.guts-rte:empty::before{content:attr(data-placeholder);color:var(--ink-faint);pointer-events:none}.guts-rte h3{font-family:var(--serif);font-size:20px;font-weight:400;margin:10px 0 4px}.guts-rte strong{color:var(--lime)}.guts-rte img{max-width:100%;border-radius:4px;margin:6px 0}.guts-note-footer{display:flex;justify-content:space-between;padding:6px 2px 0}.vault-tool-btn--danger{border-color:var(--warn)!important;color:var(--warn)!important}.vault-tool-btn--danger:hover{background:rgba(255,122,58,.08)!important}`;
  document.head.appendChild(_styleEl);
}
