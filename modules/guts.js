/* ============================================================
   modules/guts.js  —  Get Up To Speed  v0.1
   Story-based English learning · Upload · Parse · EN ↔ Hindi
   ─────────────────────────────────────────────────────────────
   INSTALL:
     1. Drop this file into  smartapp/modules/guts.js
     2. In core/router.js add:
           import guts from '../modules/guts.js';
        and add  guts  to the MODULES array.
     3. Update core/storage.js  (see storage-patch.js)
   No other files need touching.
   ============================================================ */

import { db }    from '../core/storage.js';
import { toast } from '../core/ui.js';

const STORE_L = 'guts_lessons';   // processed lesson objects
const STORE_W = 'guts_wordbank';  // saved words

// ── Module state (all reset in cleanup) ───────────────────────
let _root     = null;
let _view     = 'home';     // 'home'|'upload'|'library'|'lesson'|'wordbank'|'transfer'
let _lessonId = null;
let _lessons  = [];
let _wordbank = [];
let _styleEl  = null;
let _popup    = null;       // currently open word popup

// ── Module definition ─────────────────────────────────────────
export default {
  id:      'guts',
  name:    'Get Up To Speed',
  tagline: 'stories · patterns · EN ↔ Hindi',
  status:  'ready',

  async render(root) {
    _root = root;
    injectStyles();
    await refreshAll();
    route();
  },

  cleanup() {
    if (_styleEl) { _styleEl.remove(); _styleEl = null; }
    closePopup();
    _root     = null;
    _view     = 'home';
    _lessonId = null;
    _lessons  = [];
    _wordbank = [];
  },
};

// ── Data helpers ──────────────────────────────────────────────
async function refreshAll() {
  _lessons  = await db.getAll(STORE_L);
  _lessons.sort((a, b) => b.createdAt - a.createdAt);
  _wordbank = await db.getAll(STORE_W);
}

async function saveLesson(lesson) {
  await db.put(STORE_L, lesson);
  _lessons = await db.getAll(STORE_L);
  _lessons.sort((a, b) => b.createdAt - a.createdAt);
}

async function deleteLesson(id) {
  await db.delete(STORE_L, id);
  _lessons = _lessons.filter(l => l.id !== id);
}

async function saveWord(entry) {
  await db.put(STORE_W, entry);
  _wordbank = await db.getAll(STORE_W);
}

async function deleteWord(id) {
  await db.delete(STORE_W, id);
  _wordbank = _wordbank.filter(w => w.id !== id);
}

// ── Router ────────────────────────────────────────────────────
function route() {
  if (!_root) return;
  closePopup();
  switch (_view) {
    case 'upload':   renderUpload();   break;
    case 'library':  renderLibrary();  break;
    case 'lesson':   renderLesson();   break;
    case 'wordbank': renderWordBank(); break;
    case 'transfer': renderTransfer(); break;
    default:         renderHome();
  }
}

function nav(view, lessonId = null) {
  _view     = view;
  _lessonId = lessonId;
  route();
}

// ── Nav bar (shared across views) ─────────────────────────────
function navBar(active) {
  return `
    <div class="guts-nav">
      <button class="guts-nav__btn ${active==='home'    ?'is-active':''}" data-nav="home">Home</button>
      <button class="guts-nav__btn ${active==='upload'  ?'is-active':''}" data-nav="upload">Upload</button>
      <button class="guts-nav__btn ${active==='library' ?'is-active':''}" data-nav="library">Library</button>
      <button class="guts-nav__btn ${active==='wordbank'?'is-active':''}" data-nav="wordbank">Words</button>
      <button class="guts-nav__btn ${active==='transfer'?'is-active':''}" data-nav="transfer">↕</button>
    </div>`;
}

function bindNav(root) {
  root.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => nav(btn.dataset.nav));
  });
}

// ═══════════════════════════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════════════════════════
function renderHome() {
  const total    = _lessons.length;
  const unread   = _lessons.filter(l => l.status === 'unread').length;
  const done     = _lessons.filter(l => l.status === 'done').length;
  const wbCount  = _wordbank.length;
  const latest   = _lessons.find(l => l.status !== 'done') || _lessons[0] || null;

  _root.innerHTML = `
    ${navBar('home')}

    <div class="guts-home">
      <div class="guts-stats">
        <div class="guts-stat">
          <span class="guts-stat__n">${total}</span>
          <span class="guts-stat__l">LESSONS</span>
        </div>
        <div class="guts-stat">
          <span class="guts-stat__n">${unread}</span>
          <span class="guts-stat__l">UNREAD</span>
        </div>
        <div class="guts-stat">
          <span class="guts-stat__n">${done}</span>
          <span class="guts-stat__l">DONE</span>
        </div>
        <div class="guts-stat">
          <span class="guts-stat__n">${wbCount}</span>
          <span class="guts-stat__l">WORDS</span>
        </div>
      </div>

      ${latest ? `
        <div class="guts-section-label">Continue reading</div>
        <div class="guts-lesson-card guts-lesson-card--featured" id="home-latest">
          <div class="guts-lesson-card__status ${statusClass(latest.status)}">
            ${statusLabel(latest.status)}
          </div>
          <div class="guts-lesson-card__title">${esc(latest.title)}</div>
          <div class="guts-lesson-card__meta">
            ${latest.allVocab.length} words ·
            ${latest.allPhrases.length} phrases ·
            ${latest.allPatterns.length} patterns ·
            ${fmtDate(latest.createdAt)}
          </div>
          <div class="guts-lesson-card__arrow">→</div>
        </div>
      ` : `
        <div class="placeholder" style="margin-top:24px;">
          <div class="placeholder__icon">📖</div>
          <div>No lessons yet</div>
          <div style="margin-top:6px;font-size:10px;color:var(--ink-dim);">
            Upload a PDF, paste text, or add a story to get started
          </div>
        </div>
      `}

      <div class="guts-section-label" style="margin-top:22px;">Quick actions</div>
      <div class="guts-actions">
        <button class="guts-action-btn" data-nav="upload">
          <span class="guts-action-btn__icon">⬆</span>
          <span>Upload Material</span>
        </button>
        <button class="guts-action-btn" data-nav="library">
          <span class="guts-action-btn__icon">📚</span>
          <span>All Lessons</span>
        </button>
        <button class="guts-action-btn" data-nav="wordbank">
          <span class="guts-action-btn__icon">💡</span>
          <span>Word Bank</span>
        </button>
        <button class="guts-action-btn" data-nav="transfer">
          <span class="guts-action-btn__icon">↕</span>
          <span>Export / Import</span>
        </button>
      </div>
    </div>
  `;

  bindNav(_root);

  if (latest) {
    _root.querySelector('#home-latest')
         .addEventListener('click', () => nav('lesson', latest.id));
  }
  _root.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => nav(btn.dataset.nav));
  });
}

// ═══════════════════════════════════════════════════════════════
//  UPLOAD
// ═══════════════════════════════════════════════════════════════
function renderUpload() {
  _root.innerHTML = `
    ${navBar('upload')}

    <div class="guts-upload">
      <div class="guts-section-label">Add new material</div>

      <div class="guts-upload__title-row">
        <label class="guts-label">Lesson title (optional)</label>
        <input type="text" id="guts-title" class="guts-input"
               placeholder="e.g. Deep English — Episode 42" maxlength="80">
      </div>

      <div class="guts-tabs">
        <button class="guts-tab is-active" data-tab="paste">✏ PASTE TEXT</button>
        <button class="guts-tab" data-tab="file">📁 UPLOAD FILE</button>
      </div>

      <!-- Paste panel -->
      <div class="guts-panel" id="panel-paste">
        <label class="guts-label">
          Paste your content below
          <span class="guts-label__hint">(article · transcript · story · notes)</span>
        </label>
        <textarea id="guts-paste" class="guts-textarea"
                  placeholder="Paste your English text here…&#10;&#10;Works with:&#10;• Articles &amp; blog posts&#10;• YouTube / meeting transcripts&#10;• Story or lesson text&#10;• Any English material you want to learn from"
                  rows="12"></textarea>
        <div class="guts-upload__actions">
          <button class="vault-tool-btn" id="guts-process-paste">⚡ PROCESS &amp; SAVE</button>
          <span class="guts-char-count" id="guts-charcount">0 chars</span>
        </div>
      </div>

      <!-- File panel -->
      <div class="guts-panel" id="panel-file" hidden>
        <label class="guts-label">
          Supported formats
          <span class="guts-label__hint">.txt · .docx · .vtt · .srt</span>
        </label>
        <label class="guts-dropzone" id="guts-dropzone" for="guts-file-input">
          <span class="guts-dropzone__icon">📄</span>
          <span class="guts-dropzone__text">Tap to pick a file</span>
          <span class="guts-dropzone__hint">.txt · .docx · .vtt · .srt</span>
          <input type="file" id="guts-file-input"
                 accept=".txt,.docx,.vtt,.srt,text/plain" hidden>
        </label>
        <div id="guts-file-preview" class="guts-file-preview" hidden></div>
        <div class="guts-upload__actions">
          <button class="vault-tool-btn" id="guts-process-file" disabled>⚡ PROCESS &amp; SAVE</button>
        </div>
      </div>

      <div id="guts-processing" class="guts-processing" hidden>
        <span class="guts-processing__dot"></span> Processing…
      </div>
    </div>
  `;

  bindNav(_root);
  bindUpload();
}

function bindUpload() {
  // Tabs
  _root.querySelectorAll('.guts-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _root.querySelectorAll('.guts-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      _root.querySelector('#panel-paste').hidden = tab.dataset.tab !== 'paste';
      _root.querySelector('#panel-file').hidden  = tab.dataset.tab !== 'file';
    });
  });

  // Char counter
  const ta = _root.querySelector('#guts-paste');
  const cc = _root.querySelector('#guts-charcount');
  ta.addEventListener('input', () => {
    cc.textContent = ta.value.length.toLocaleString() + ' chars';
  });

  // Process paste
  _root.querySelector('#guts-process-paste').addEventListener('click', async () => {
    const text  = ta.value.trim();
    const title = _root.querySelector('#guts-title').value.trim();
    if (text.length < 50) { toast('Paste at least 50 characters of text', 'warn'); return; }
    await runProcessor(text, title, 'paste');
  });

  // File picker
  let _fileText = '';
  const fileInput = _root.querySelector('#guts-file-input');
  const procBtn   = _root.querySelector('#guts-process-file');
  const preview   = _root.querySelector('#guts-file-preview');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showProcessing(true);
      _fileText = await readFile(file);
      preview.hidden = false;
      preview.innerHTML = `
        <div class="guts-file-preview__name">${esc(file.name)}</div>
        <div class="guts-file-preview__meta">${_fileText.length.toLocaleString()} chars extracted</div>
        <pre class="guts-file-preview__peek">${esc(_fileText.slice(0, 300))}${_fileText.length > 300 ? '…' : ''}</pre>
      `;
      procBtn.disabled = false;
    } catch (err) {
      toast('Could not read file: ' + err.message, 'err');
    } finally {
      showProcessing(false);
    }
  });

  procBtn.addEventListener('click', async () => {
    if (!_fileText) return;
    const title = _root.querySelector('#guts-title').value.trim();
    await runProcessor(_fileText, title, 'file');
  });
}

async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return readDocx(file);
  if (name.endsWith('.vtt'))  return readVtt(await file.text());
  if (name.endsWith('.srt'))  return readSrt(await file.text());
  return file.text(); // .txt or plain
}

async function readDocx(file) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip not available — check vendor/jszip.min.js');
  const zip = await JSZip.loadAsync(file);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('Not a valid .docx file');
  const xml = await xmlFile.async('text');
  return xml
    .replace(/<w:br[^>]*>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readVtt(raw) {
  return raw
    .split('\n')
    .filter(l => !l.match(/^WEBVTT|^\d+$|-->/))
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readSrt(raw) {
  return raw
    .replace(/^\d+\s*$/gm, '')
    .replace(/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function showProcessing(on) {
  const el = _root && _root.querySelector('#guts-processing');
  if (el) el.hidden = !on;
}

async function runProcessor(text, title, source) {
  showProcessing(true);
  try {
    await new Promise(r => setTimeout(r, 30)); // let UI breathe
    const lesson = processText(text, title, source);
    await saveLesson(lesson);
    toast(`✓ Lesson saved — ${lesson.chunks.length} chunks, ${lesson.allVocab.length} vocab words`);
    nav('lesson', lesson.id);
  } catch (err) {
    toast('Processing failed: ' + err.message, 'err');
    showProcessing(false);
  }
}

// ═══════════════════════════════════════════════════════════════
//  LIBRARY
// ═══════════════════════════════════════════════════════════════
function renderLibrary() {
  const total = _lessons.length;

  _root.innerHTML = `
    ${navBar('library')}
    <div class="guts-section-label">${total} LESSON${total !== 1 ? 'S' : ''}</div>
    ${total === 0 ? `
      <div class="placeholder">
        <div class="placeholder__icon">📚</div>
        <div>No lessons yet — upload some material</div>
      </div>
    ` : `
      <div class="guts-lesson-list" id="guts-list"></div>
    `}
  `;

  bindNav(_root);

  if (total > 0) {
    const list = _root.querySelector('#guts-list');
    _lessons.forEach(lesson => {
      const card = document.createElement('div');
      card.className = 'guts-lesson-card';
      card.innerHTML = `
        <div class="guts-lesson-card__status ${statusClass(lesson.status)}">
          ${statusLabel(lesson.status)}
        </div>
        <div class="guts-lesson-card__title">${esc(lesson.title)}</div>
        <div class="guts-lesson-card__meta">
          ${lesson.chunks.length} chunks ·
          ${lesson.allVocab.length} vocab ·
          ${lesson.allPhrases.length} phrases ·
          ${fmtDate(lesson.createdAt)}
        </div>
        <div class="guts-lesson-card__arrow">→</div>
      `;
      card.addEventListener('click', () => nav('lesson', lesson.id));
      list.appendChild(card);
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  LESSON READER
// ═══════════════════════════════════════════════════════════════
function renderLesson() {
  const lesson = _lessons.find(l => l.id === _lessonId);
  if (!lesson) { nav('library'); return; }

  const wbIds  = new Set(_wordbank.map(w => w.word));
  const hiMode = lesson.hindiMode || false;

  _root.innerHTML = `
    ${navBar('library')}

    <div class="guts-reader">
      <div class="guts-reader__header">
        <div class="guts-reader__title">${esc(lesson.title)}</div>
        <div class="guts-reader__meta">
          ${lesson.chunks.length} chunks ·
          ${lesson.allVocab.length} vocab ·
          ${fmtDate(lesson.createdAt)}
        </div>
        <div class="guts-reader__controls">
          <button class="vault-tool-btn ${hiMode ? 'is-active' : ''}" id="guts-hi-toggle">
            ${hiMode ? '🇮🇳 हिंदी' : '🇬🇧 English'}
          </button>
          <button class="vault-tool-btn ${lesson.status === 'done' ? 'is-active' : ''}"
                  id="guts-mark-done">
            ${lesson.status === 'done' ? '✓ DONE' : '○ MARK DONE'}
          </button>
          <button class="vault-tool-btn vault-tool-btn--danger" id="guts-del-lesson">✕ DELETE</button>
        </div>
      </div>

      <!-- Story chunks -->
      <div class="guts-section-label">Story</div>
      <div class="guts-chunks" id="guts-chunks">
        ${lesson.chunks.map((chunk, i) => `
          <div class="guts-chunk">
            <div class="guts-chunk__num">§${i + 1}</div>
            <div class="guts-chunk__text">${renderWords(chunk.text, wbIds)}</div>
            ${chunk.phrases.length ? `
              <div class="guts-chunk__tags">
                ${chunk.phrases.map(p =>
                  `<span class="guts-badge guts-badge--phrase">${esc(p)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>

      <!-- Vocabulary -->
      ${lesson.allVocab.length ? `
        <div class="guts-section-label">Key vocabulary</div>
        <div class="guts-vocab-grid">
          ${lesson.allVocab.map(w => {
            const hindi = HINDI_DICT[w] || '';
            const saved = wbIds.has(w);
            return `<button class="guts-vocab-chip ${saved ? 'is-saved' : ''}"
                            data-word="${esc(w)}" title="${esc(hindi || w)}">
              ${esc(w)}${hindi ? '<span class="guts-vocab-chip__hi">'+esc(hindi.split('(')[0].trim())+'</span>' : ''}
            </button>`;
          }).join('')}
        </div>
      ` : ''}

      <!-- Long Patterns -->
      ${lesson.allPatterns.length ? `
        <div class="guts-section-label">Long patterns</div>
        <div class="guts-patterns">
          ${lesson.allPatterns.map(p => `
            <div class="guts-pattern">
              <span class="guts-pattern__icon">◈</span>
              <span class="guts-pattern__text">${esc(p)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Phrases -->
      ${lesson.allPhrases.length ? `
        <div class="guts-section-label">Key phrases</div>
        <div class="guts-phrase-list">
          ${lesson.allPhrases.map(p => `
            <div class="guts-phrase-row">
              <span class="guts-badge guts-badge--phrase">${esc(p)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Word popup (hidden, shown on word tap) -->
    <div class="guts-popup" id="guts-popup" hidden>
      <div class="guts-popup__word" id="guts-popup-word"></div>
      <div class="guts-popup__hindi" id="guts-popup-hindi"></div>
      <div class="guts-popup__actions">
        <button class="vault-tool-btn" id="guts-popup-save">+ WORD BANK</button>
        <button class="vault-tool-btn" id="guts-popup-close">✕</button>
      </div>
    </div>
  `;

  bindNav(_root);
  bindReader(lesson, wbIds);
}

function renderWords(text, wbIds) {
  return text.replace(/\b([a-zA-Z]+)\b/g, (match) => {
    const key   = match.toLowerCase();
    const hindi = HINDI_DICT[key];
    const saved = wbIds.has(key);
    const cls   = ['guts-word',
                   hindi  ? 'guts-word--known' : '',
                   saved  ? 'guts-word--saved'  : ''].filter(Boolean).join(' ');
    return `<span class="${cls}" data-word="${key}">${esc(match)}</span>`;
  });
}

function bindReader(lesson, wbIds) {
  // Hindi toggle
  _root.querySelector('#guts-hi-toggle').addEventListener('click', async () => {
    lesson.hindiMode = !lesson.hindiMode;
    await saveLesson(lesson);
    renderLesson();
  });

  // Mark done
  _root.querySelector('#guts-mark-done').addEventListener('click', async () => {
    lesson.status = lesson.status === 'done' ? 'reading' : 'done';
    await saveLesson(lesson);
    toast(lesson.status === 'done' ? '✓ Marked as done' : 'Marked as reading');
    renderLesson();
  });

  // Delete lesson
  _root.querySelector('#guts-del-lesson').addEventListener('click', async () => {
    if (!confirm(`Delete "${lesson.title}"? This cannot be undone.`)) return;
    await deleteLesson(lesson.id);
    toast('Lesson deleted');
    nav('library');
  });

  // Word tap → popup
  _root.querySelector('#guts-chunks').addEventListener('click', e => {
    const span = e.target.closest('.guts-word');
    if (!span) { closePopup(); return; }
    showWordPopup(span.dataset.word, wbIds);
  });

  // Vocab chip tap
  _root.querySelectorAll('.guts-vocab-chip').forEach(chip => {
    chip.addEventListener('click', () => showWordPopup(chip.dataset.word, wbIds));
  });

  // Popup buttons
  _root.querySelector('#guts-popup-close').addEventListener('click', closePopup);
  _root.querySelector('#guts-popup-save').addEventListener('click', async () => {
    const word = _root.querySelector('#guts-popup-word').dataset.word;
    if (!word) return;
    if (wbIds.has(word)) { toast('Already in word bank', 'warn'); return; }
    const entry = {
      id:        'wb_' + Date.now(),
      word,
      hindi:     HINDI_DICT[word] || '',
      example:   findExample(lesson, word),
      savedAt:   Date.now(),
      lessonId:  lesson.id,
    };
    await saveWord(entry);
    wbIds.add(word);
    toast('✓ Saved to word bank');
    // Update saved state on spans
    _root.querySelectorAll(`[data-word="${word}"]`)
         .forEach(el => el.classList.add('guts-word--saved'));
    _root.querySelector('#guts-popup-save').textContent = '✓ SAVED';
    closePopup();
  });
}

function showWordPopup(word, wbIds) {
  const popup = _root.querySelector('#guts-popup');
  if (!popup) return;
  const hindi   = HINDI_DICT[word] || '';
  const saved   = wbIds.has(word);
  const wordEl  = popup.querySelector('#guts-popup-word');
  const hindiEl = popup.querySelector('#guts-popup-hindi');
  const saveBtn = popup.querySelector('#guts-popup-save');

  wordEl.textContent  = word;
  wordEl.dataset.word = word;
  hindiEl.textContent = hindi || 'No Hindi translation in dictionary';
  hindiEl.style.color = hindi ? 'var(--lime)' : 'var(--ink-faint)';
  saveBtn.textContent = saved ? '✓ IN WORD BANK' : '+ WORD BANK';
  saveBtn.disabled    = saved;
  popup.hidden = false;
  _popup = popup;
}

function closePopup() {
  if (_popup) { _popup.hidden = true; _popup = null; }
  const el = document.getElementById('guts-popup');
  if (el) el.hidden = true;
}

function findExample(lesson, word) {
  const re = new RegExp(`\\b${word}\\b`, 'i');
  for (const chunk of lesson.chunks) {
    const match = chunk.sentences.find(s => re.test(s));
    if (match) return match;
  }
  return '';
}

// ═══════════════════════════════════════════════════════════════
//  WORD BANK
// ═══════════════════════════════════════════════════════════════
function renderWordBank() {
  const total = _wordbank.length;

  _root.innerHTML = `
    ${navBar('wordbank')}
    <div class="guts-section-label">${total} SAVED WORD${total !== 1 ? 'S' : ''}</div>
    ${total === 0 ? `
      <div class="placeholder">
        <div class="placeholder__icon">💡</div>
        <div>No words saved yet</div>
        <div style="margin-top:6px;font-size:10px;color:var(--ink-dim);">
          Tap any word while reading a lesson to save it here
        </div>
      </div>
    ` : `
      <div class="guts-wb-grid" id="guts-wb-grid"></div>
    `}
  `;

  bindNav(_root);

  if (total > 0) {
    const grid = _root.querySelector('#guts-wb-grid');
    _wordbank.sort((a, b) => b.savedAt - a.savedAt).forEach(entry => {
      const card = document.createElement('div');
      card.className = 'guts-wb-card';
      card.innerHTML = `
        <div class="guts-wb-card__word">${esc(entry.word)}</div>
        ${entry.hindi ? `<div class="guts-wb-card__hindi">${esc(entry.hindi)}</div>` : ''}
        ${entry.example ? `<div class="guts-wb-card__example">"${esc(entry.example)}"</div>` : ''}
        <div class="guts-wb-card__footer">
          <span class="guts-wb-card__date">${fmtDate(entry.savedAt)}</span>
          <button class="guts-wb-card__del" data-id="${esc(entry.id)}" title="Remove">✕</button>
        </div>
      `;
      card.querySelector('.guts-wb-card__del').addEventListener('click', async e => {
        e.stopPropagation();
        await deleteWord(entry.id);
        toast('Word removed');
        renderWordBank();
      });
      grid.appendChild(card);
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════
function renderTransfer() {
  _root.innerHTML = `
    ${navBar('transfer')}

    <div class="guts-section-label">Export your data</div>
    <div class="set-card">
      <div class="set-row">
        <span class="set-row__k">LESSONS</span>
        <span class="set-row__v" style="color:var(--lime)">${_lessons.length} saved</span>
      </div>
      <div class="set-row">
        <span class="set-row__k">WORD BANK</span>
        <span class="set-row__v" style="color:var(--lime)">${_wordbank.length} words</span>
      </div>
      <div class="set-row" style="border-top:1px solid var(--line-soft);padding-top:10px;margin-top:4px">
        <span class="set-row__k">FORMAT</span>
        <span class="set-row__v">JSON backup file</span>
      </div>
    </div>
    <button class="vault-tool-btn" id="guts-export" style="width:100%;margin-top:10px">
      ⬇ EXPORT ALL DATA
    </button>

    <div class="guts-section-label" style="margin-top:24px">Import from backup</div>
    <div class="set-card">
      <div class="set-row">
        <span class="set-row__k">NOTE</span>
        <span class="set-row__v" style="color:var(--ink-dim);font-size:10px">
          Import merges with existing data. Duplicate IDs are overwritten.
        </span>
      </div>
    </div>
    <label class="vault-tool-btn" style="width:100%;margin-top:10px;display:flex;
           align-items:center;justify-content:center;cursor:pointer;">
      ⬆ IMPORT BACKUP FILE
      <input type="file" id="guts-import-file" accept=".json,application/json" hidden>
    </label>
    <div id="guts-import-result" style="margin-top:10px;font-size:11px;color:var(--ink-dim);"></div>
  `;

  bindNav(_root);

  _root.querySelector('#guts-export').addEventListener('click', exportData);

  _root.querySelector('#guts-import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importData(file);
      _root.querySelector('#guts-import-result').textContent =
        `✓ Import successful — ${_lessons.length} lessons, ${_wordbank.length} words total`;
    } catch (err) {
      toast('Import failed: ' + err.message, 'err');
    }
  });
}

async function exportData() {
  if (_lessons.length === 0 && _wordbank.length === 0) {
    toast('Nothing to export yet', 'warn');
    return;
  }
  const data = {
    app:        'SmartApp — Get Up To Speed',
    version:    '0.1',
    exportedAt: new Date().toISOString(),
    lessons:    _lessons,
    wordbank:   _wordbank,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `guts-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('✓ Export downloaded');
}

async function importData(file) {
  const raw  = await file.text();
  const data = JSON.parse(raw);
  if (!Array.isArray(data.lessons) || !Array.isArray(data.wordbank)) {
    throw new Error('Invalid GUTS backup file');
  }
  for (const lesson of data.lessons) await db.put(STORE_L, lesson);
  for (const word   of data.wordbank) await db.put(STORE_W, word);
  await refreshAll();
  toast(`✓ Imported ${data.lessons.length} lessons, ${data.wordbank.length} words`);
}

// ═══════════════════════════════════════════════════════════════
//  TEXT PROCESSOR  (client-side, no API)
// ═══════════════════════════════════════════════════════════════
function processText(raw, title, source) {
  const clean    = cleanText(raw);
  const chunks   = chunkText(clean);
  const analyzed = chunks.map(analyzeChunk);
  return buildLesson(analyzed, title || autoTitle(clean), source, raw.length);
}

function cleanText(raw) {
  return raw
    // YouTube/VTT timestamps  [00:01:23]  or  00:01:23
    .replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/g, '')
    // Meeting speaker labels   "JOHN:"  "Speaker 2:"
    .replace(/^[A-Z][A-Za-z\s]{0,25}:\s*/gm, '')
    // HTML tags (in case of pasted rich text)
    .replace(/<[^>]+>/g, ' ')
    // Multiple spaces → single
    .replace(/[ \t]+/g, ' ')
    // Normalise line endings
    .replace(/\r\n/g, '\n')
    // Collapse 3+ blank lines → 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text) {
  let paras = text.split(/\n\n+/).map(p => p.replace(/\n/g, ' ').trim()).filter(p => p.length > 30);
  if (paras.length >= 2) return paras;

  // No clear paragraphs → group sentences in threes
  const sents = tokenizeSentences(text);
  const chunks = [];
  for (let i = 0; i < sents.length; i += 3) {
    const chunk = sents.slice(i, i + 3).join(' ').trim();
    if (chunk.length > 20) chunks.push(chunk);
  }
  return chunks.length ? chunks : [text];
}

function tokenizeSentences(text) {
  return text
    .replace(/([.!?])\s+(?=[A-Z"'])/g, '$1|||')
    .split('|||')
    .map(s => s.trim())
    .filter(s => s.length > 8);
}

function analyzeChunk(text) {
  const sentences = tokenizeSentences(text);
  const words     = text.match(/\b[a-zA-Z]+\b/g) || [];

  // Long patterns: sentences ≥ 12 words
  const patterns = sentences.filter(s => (s.match(/\b\w+\b/g) || []).length >= 12);

  // Vocab: ≥ 7 chars, not in common-words list, deduplicated
  const vocab = [...new Set(
    words
      .filter(w => w.length >= 7 && !COMMON_WORDS.has(w.toLowerCase()))
      .map(w => w.toLowerCase())
  )].slice(0, 10);

  // Phrases: match against phrase list
  const lower       = text.toLowerCase();
  const phrases     = COMMON_PHRASES.filter(p => lower.includes(p));

  return { text, sentences, patterns, vocab, phrases };
}

function buildLesson(chunks, title, source, sourceLength) {
  const id  = 'guts_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const now = Date.now();

  const allVocab    = [...new Set(chunks.flatMap(c => c.vocab))];
  const allPhrases  = [...new Set(chunks.flatMap(c => c.phrases))];
  const allPatterns = chunks.flatMap(c => c.patterns);

  return {
    id, title, source, sourceLength,
    createdAt:   now,
    status:      'unread',
    hindiMode:   false,
    chunks,
    allVocab,
    allPhrases,
    allPatterns,
  };
}

function autoTitle(text) {
  // Take first ~60 chars of first sentence as title
  const first = tokenizeSentences(text)[0] || text;
  return first.slice(0, 60).trim() + (first.length > 60 ? '…' : '');
}

// ═══════════════════════════════════════════════════════════════
//  HINDI DICTIONARY  (starter set — expand as needed)
// ═══════════════════════════════════════════════════════════════
const HINDI_DICT = {
  // Learning & Communication
  'fluency':        'प्रवाह',
  'fluent':         'धाराप्रवाह',
  'vocabulary':     'शब्द भंडार',
  'grammar':        'व्याकरण',
  'pronunciation':  'उच्चारण',
  'communicate':    'संवाद करना',
  'conversation':   'बातचीत',
  'expression':     'अभिव्यक्ति',
  'language':       'भाषा',
  'understand':     'समझना',
  'practice':       'अभ्यास',
  'improve':        'सुधारना',
  'learning':       'सीखना',
  'knowledge':      'ज्ञान',
  'lesson':         'पाठ',
  'sentence':       'वाक्य',
  'meaning':        'अर्थ',
  'translate':      'अनुवाद करना',
  // Mind & Growth
  'confidence':     'आत्मविश्वास',
  'motivation':     'प्रेरणा',
  'resilience':     'लचीलापन',
  'perspective':    'दृष्टिकोण',
  'imagination':    'कल्पना',
  'creativity':     'रचनात्मकता',
  'awareness':      'जागरूकता',
  'mindset':        'मानसिकता',
  'potential':      'क्षमता',
  'discipline':     'अनुशासन',
  'patience':       'धैर्य',
  'commitment':     'प्रतिबद्धता',
  'consistent':     'लगातार',
  'progress':       'प्रगति',
  'achievement':    'उपलब्धि',
  'success':        'सफलता',
  'failure':        'विफलता',
  'challenge':      'चुनौती',
  'opportunity':    'अवसर',
  'experience':     'अनुभव',
  // Ideas & Concepts
  'philosophy':     'दर्शनशास्त्र',
  'psychology':     'मनोविज्ञान',
  'spirituality':   'आध्यात्मिकता',
  'principle':      'सिद्धांत',
  'strategy':       'रणनीति',
  'process':        'प्रक्रिया',
  'effective':      'प्रभावी',
  'efficient':      'कुशल',
  'essential':      'आवश्यक',
  'important':      'महत्वपूर्ण',
  'valuable':       'मूल्यवान',
  'meaningful':     'सार्थक',
  'significant':    'महत्वपूर्ण',
  'fundamental':    'मूलभूत',
  'determine':      'निर्धारित करना',
  'establish':      'स्थापित करना',
  'demonstrate':    'प्रदर्शित करना',
  'recognize':      'पहचानना',
  'appreciate':     'सराहना करना',
  'accomplish':     'प्राप्त करना',
  // Culture & Life
  'community':      'समुदाय',
  'relationship':   'संबंध',
  'environment':    'वातावरण',
  'behaviour':      'व्यवहार',
  'behavior':       'व्यवहार',
  'character':      'चरित्र',
  'tradition':      'परंपरा',
  'culture':        'संस्कृति',
  'society':        'समाज',
  'happiness':      'खुशी',
  'freedom':        'स्वतंत्रता',
  'harmony':        'सामंजस्य',
  'balance':        'संतुलन',
  'strength':       'शक्ति',
  'weakness':       'कमजोरी',
  'journey':        'यात्रा',
  'adventure':      'साहसिक कार्य',
  'discovery':      'खोज',
  'purpose':        'उद्देश्य',
  'direction':      'दिशा',
};

// ═══════════════════════════════════════════════════════════════
//  COMMON WORDS  (excluded from vocab extraction)
// ═══════════════════════════════════════════════════════════════
const COMMON_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','it','for','not','on','with',
  'he','as','you','do','at','this','but','his','by','from','they','we','say','her',
  'she','or','an','will','my','one','all','would','there','their','what','so','up',
  'out','if','about','who','get','which','go','me','when','make','can','like','time',
  'no','just','him','know','take','people','into','year','your','good','some','could',
  'them','see','other','than','then','now','look','only','come','its','over','think',
  'also','back','after','use','two','how','our','work','first','well','way','even',
  'new','want','because','any','these','give','day','most','need','large','often',
  'hand','high','place','hold','turn','help','start','never','next','hard','open',
  'seem','always','both','show','feel','long','those','old','face','tell','keep',
  'every','find','much','still','though','should','where','does','around','three',
  'small','set','put','end','another','right','big','too','many','before','must',
  'through','under','little','being','while','become','already','against','without',
  'same','different','including','however','between','right','along','might','going',
  'great','think','about','here','were','been','used','said','each','which','their',
  'time','will','more','very','when','come','could','from','have','just','like',
  'make','than','them','then','they','this','very','what','with','your','that','this',
]);

// ═══════════════════════════════════════════════════════════════
//  COMMON PHRASES  (detected in text)
// ═══════════════════════════════════════════════════════════════
const COMMON_PHRASES = [
  'get up to speed','bear in mind','keep in mind','on the other hand',
  'in other words','as a result','for example','for instance',
  'in addition','at the same time','in fact','as well as',
  'more than ever','look forward to','take for granted','point of view',
  'make a difference','come up with','put up with','go ahead',
  'at least','in order to','as long as','even though',
  'in spite of','due to','according to','in terms of',
  'take part in','make sure','find out','figure out',
  'bring up','set up','give up','take up','right away',
  'after all','all of a sudden','once in a while',
  'sooner or later','on the whole','as far as','in general',
  'all the time','at first','to begin with','by the way',
  'on top of that','as a matter of fact','in the long run',
  'at the end of the day','when it comes to','the fact that',
  'in my opinion','from my perspective','based on','in contrast',
];

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function statusClass(s) {
  if (s === 'done')    return 'guts-status--done';
  if (s === 'reading') return 'guts-status--reading';
  return 'guts-status--unread';
}
function statusLabel(s) {
  if (s === 'done')    return '✓ Done';
  if (s === 'reading') return '▶ Reading';
  return '○ Unread';
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ═══════════════════════════════════════════════════════════════
//  INJECTED STYLES  (scoped to .guts-* classes — no app.css touch)
// ═══════════════════════════════════════════════════════════════
function injectStyles() {
  if (document.getElementById('guts-styles')) return;
  _styleEl = document.createElement('style');
  _styleEl.id = 'guts-styles';
  _styleEl.textContent = `
/* ── GUTS Nav ─────────────────────────────────────── */
.guts-nav {
  display: flex;
  gap: 4px;
  padding: 0 0 14px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.guts-nav__btn {
  flex-shrink: 0;
  padding: 5px 10px;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: transparent;
  cursor: pointer;
  transition: all 0.12s;
}
.guts-nav__btn.is-active {
  color: var(--lime);
  border-color: var(--lime-dim);
  background: rgba(212,255,58,0.06);
}

/* ── Stats ────────────────────────────────────────── */
.guts-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}
.guts-stat {
  background: var(--bg-tile);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px 8px;
  text-align: center;
}
.guts-stat__n {
  display: block;
  font-family: var(--serif);
  font-size: 28px;
  line-height: 1;
  color: var(--lime);
}
.guts-stat__l {
  display: block;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
  margin-top: 4px;
}

/* ── Section label ────────────────────────────────── */
.guts-section-label {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin: 4px 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.guts-section-label::after {
  content:""; flex:1; height:1px; background:var(--line-soft);
}

/* ── Quick actions ────────────────────────────────── */
.guts-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.guts-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 10px;
  background: var(--bg-tile);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-dim);
  cursor: pointer;
  transition: all 0.12s;
}
.guts-action-btn:hover { border-color: var(--lime-dim); color: var(--lime); }
.guts-action-btn__icon { font-size: 22px; }

/* ── Lesson cards ─────────────────────────────────── */
.guts-lesson-list { display: flex; flex-direction: column; gap: 8px; }
.guts-lesson-card {
  position: relative;
  background: var(--bg-tile);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.guts-lesson-card:hover { border-color: var(--lime-dim); }
.guts-lesson-card--featured { border-color: var(--lime-dim); }
.guts-lesson-card__status {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.guts-status--unread  { color: var(--ink-faint); }
.guts-status--reading { color: var(--warn); }
.guts-status--done    { color: var(--ok); }
.guts-lesson-card__title {
  font-family: var(--serif);
  font-size: 20px;
  line-height: 1.2;
  color: var(--ink);
  margin-bottom: 6px;
}
.guts-lesson-card__meta {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.06em;
}
.guts-lesson-card__arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-dim);
  font-size: 16px;
}

/* ── Upload ───────────────────────────────────────── */
.guts-upload { display: flex; flex-direction: column; gap: 10px; }
.guts-upload__title-row { display: flex; flex-direction: column; gap: 4px; }
.guts-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.guts-label__hint {
  margin-left: 6px;
  color: var(--ink-faint);
  font-size: 9px;
  text-transform: none;
  letter-spacing: 0;
}
.guts-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 12px;
}
.guts-input:focus { outline: 1px solid var(--lime-dim); border-color: var(--lime-dim); }
.guts-tabs { display: flex; gap: 6px; }
.guts-tab {
  flex: 1;
  padding: 7px;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-dim);
  cursor: pointer;
  transition: all 0.12s;
}
.guts-tab.is-active {
  border-color: var(--lime-dim);
  color: var(--lime);
  background: rgba(212,255,58,0.06);
}
.guts-textarea {
  width: 100%;
  padding: 10px;
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.55;
  resize: vertical;
  min-height: 180px;
}
.guts-textarea:focus { outline: 1px solid var(--lime-dim); border-color: var(--lime-dim); }
.guts-upload__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.guts-char-count { font-size: 10px; color: var(--ink-faint); }
.guts-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s;
}
.guts-dropzone:hover { border-color: var(--lime-dim); }
.guts-dropzone__icon { font-size: 32px; }
.guts-dropzone__text { font-size: 12px; color: var(--ink-dim); }
.guts-dropzone__hint { font-size: 10px; color: var(--ink-faint); letter-spacing: 0.1em; }
.guts-file-preview {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.guts-file-preview__name { font-size: 12px; color: var(--lime); margin-bottom: 4px; }
.guts-file-preview__meta { font-size: 10px; color: var(--ink-faint); margin-bottom: 6px; }
.guts-file-preview__peek {
  font-size: 10px;
  color: var(--ink-dim);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 80px;
  overflow: hidden;
}
.guts-processing {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--lime);
  padding: 8px 0;
}
.guts-processing__dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--lime);
  animation: pulse 1.2s ease-in-out infinite;
}

/* ── Reader ───────────────────────────────────────── */
.guts-reader { display: flex; flex-direction: column; gap: 4px; }
.guts-reader__header {
  background: var(--bg-tile);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 10px;
}
.guts-reader__title {
  font-family: var(--serif);
  font-size: 24px;
  line-height: 1.2;
  margin-bottom: 4px;
}
.guts-reader__meta { font-size: 10px; color: var(--ink-faint); margin-bottom: 10px; }
.guts-reader__controls { display: flex; gap: 6px; flex-wrap: wrap; }
.guts-chunks { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
.guts-chunk {
  background: var(--bg-tile);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.guts-chunk__num {
  font-size: 9px;
  color: var(--ink-faint);
  letter-spacing: 0.14em;
  margin-bottom: 8px;
}
.guts-chunk__text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
}
.guts-chunk__tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px; }

/* ── Words ────────────────────────────────────────── */
.guts-word { cursor: pointer; }
.guts-word--known {
  color: var(--lime);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}
.guts-word--saved { color: var(--ok); }

/* ── Badges ───────────────────────────────────────── */
.guts-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 10px;
  letter-spacing: 0.06em;
}
.guts-badge--phrase {
  background: rgba(212,255,58,0.08);
  border: 1px solid var(--lime-dim);
  color: var(--lime);
}

/* ── Vocab grid ───────────────────────────────────── */
.guts-vocab-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.guts-vocab-chip {
  padding: 5px 10px;
  background: var(--bg-tile);
  border: 1px solid var(--line);
  border-radius: 20px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-dim);
  cursor: pointer;
  transition: all 0.12s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.guts-vocab-chip:hover { border-color: var(--lime-dim); color: var(--lime); }
.guts-vocab-chip.is-saved { border-color: var(--ok); color: var(--ok); }
.guts-vocab-chip__hi {
  display: block;
  font-size: 9px;
  color: var(--lime);
  letter-spacing: 0;
}

/* ── Patterns ─────────────────────────────────────── */
.guts-patterns { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.guts-pattern {
  display: flex;
  gap: 10px;
  background: var(--bg-tile);
  border-left: 2px solid var(--lime-dim);
  padding: 10px 12px;
  border-radius: 0 var(--radius) var(--radius) 0;
}
.guts-pattern__icon { color: var(--lime-dim); flex-shrink: 0; font-size: 12px; padding-top: 2px; }
.guts-pattern__text { font-size: 13px; line-height: 1.55; color: var(--ink); }

/* ── Phrases list ─────────────────────────────────── */
.guts-phrase-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.guts-phrase-row  { display: flex; }

/* ── Word popup ───────────────────────────────────── */
.guts-popup {
  position: fixed;
  bottom: 80px;
  left: 16px;
  right: 16px;
  z-index: 3000;
  background: var(--bg-tile);
  border: 1px solid var(--lime-dim);
  border-radius: var(--radius);
  padding: 14px 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  animation: guts-pop 0.18s ease;
}
@keyframes guts-pop {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.guts-popup__word {
  font-family: var(--serif);
  font-size: 26px;
  color: var(--ink);
  margin-bottom: 4px;
}
.guts-popup__hindi {
  font-size: 14px;
  color: var(--lime);
  margin-bottom: 12px;
  min-height: 20px;
}
.guts-popup__actions { display: flex; gap: 8px; }

/* ── Word bank ────────────────────────────────────── */
.guts-wb-grid { display: flex; flex-direction: column; gap: 8px; }
.guts-wb-card {
  background: var(--bg-tile);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.guts-wb-card__word {
  font-family: var(--serif);
  font-size: 22px;
  color: var(--ink);
  margin-bottom: 4px;
}
.guts-wb-card__hindi {
  font-size: 13px;
  color: var(--lime);
  margin-bottom: 6px;
}
.guts-wb-card__example {
  font-size: 11px;
  color: var(--ink-dim);
  font-style: italic;
  line-height: 1.5;
  margin-bottom: 8px;
  border-left: 2px solid var(--line);
  padding-left: 8px;
}
.guts-wb-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.guts-wb-card__date { font-size: 9px; color: var(--ink-faint); }
.guts-wb-card__del {
  font-size: 12px;
  color: var(--ink-faint);
  cursor: pointer;
  padding: 2px 6px;
  border: none;
  background: none;
  transition: color 0.12s;
}
.guts-wb-card__del:hover { color: var(--warn); }

/* ── Danger button variant ────────────────────────── */
.vault-tool-btn--danger {
  border-color: var(--warn) !important;
  color: var(--warn) !important;
}
.vault-tool-btn--danger:hover {
  background: rgba(255,122,58,0.08) !important;
}
`;
  document.head.appendChild(_styleEl);
}
