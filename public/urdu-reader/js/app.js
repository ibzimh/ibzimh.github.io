import { cleanForDisplay, tokenize, lookupKey } from './text.js';
import { loadDictionary, lookup, romanFor } from './dict.js';

const SAMPLE = `آج صبح بارش ہو رہی تھی۔ میں نے چائے بنائی اور کھڑکی کے پاس بیٹھ گیا۔ باہر گلی میں بچے کاغذ کی کشتیاں چلا رہے تھے۔ مجھے اپنا بچپن یاد آ گیا، جب ہم بھی یہی کھیل کھیلا کرتے تھے۔

شام کو میں اپنے دوست سے ملنے گیا۔ اس نے مجھے ایک پرانی کتاب دی جو اس کے دادا کی تھی۔ کتاب کے صفحے پیلے ہو چکے تھے، لیکن الفاظ اب بھی صاف پڑھے جا سکتے تھے۔`;

const SIZES = [22, 26, 30, 36, 42];
const MODES = ['urdu', 'roman', 'both'];
const LOOKED_MAX = 300;
const UNDO_MS = 5000;
const KEYS_LINE = '← → next word · 1 2 3 script · E edit';

const $ = (id) => document.getElementById(id);
const el = {
  body: document.body, root: document.documentElement, card: $('card'), cardScroll: $('card-scroll'), cardBody: $('card-body'),
  announce: $('announce'), compose: $('compose'), read: $('read'), text: $('text'), input: $('input'), toggle: $('toggle'),
  clear: $('clear'), hint: $('hint-text'), phoneLooked: $('looked-phone'),
};

const phoneMQ = matchMedia('(max-width: 899px)');
const touchOnly = matchMedia('(hover: none)').matches;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const store = {
  get(k) { try { return localStorage.getItem('urdu-reader:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('urdu-reader:' + k, v); } catch { /* storage unavailable */ } },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  view: 'compose', text: '', mode: 'urdu', size: 2,
  selIdx: -1, selWord: null, tab: 0,
  dict: 'loading', looked: [], undo: null,
};
let doc = { paras: [], words: [], keyIdx: new Map(), known: null };
let wordEls = [];
const romanCache = new Map();

/* ---------- document ---------- */

function buildDoc(text) {
  const paras = tokenize(text);
  const words = [];
  const keyIdx = new Map();
  for (const lines of paras) {
    let start = true; // at the start of a sentence
    for (const line of lines) for (const t of line) {
      if (t.type === 'punct' && /[۔؟!.?]/.test(t.text)) start = true;
      if (t.type !== 'word') continue;
      t.i = words.length;
      const key = lookupKey(t.text);
      words.push({ text: t.text, key, ctx: { start, next: '' } });
      if (t.i > 0 && !words[t.i - 1].ctx.next) words[t.i - 1].ctx.next = key;
      start = false;
      if (keyIdx.has(key)) keyIdx.get(key).push(t.i); else keyIdx.set(key, [t.i]);
    }
  }
  return { paras, words, keyIdx, known: null };
}

function romanOf(w) {
  const ck = `${w.key}|${w.ctx.start ? 1 : 0}|${w.ctx.next}`;
  let r = romanCache.get(ck);
  if (!r) { r = romanFor(w.text, w.ctx); romanCache.set(ck, r); }
  return r;
}

// context of the selected word, so homographs read the way they do in the text
const selCtx = () => (S.selIdx >= 0 ? doc.words[S.selIdx]?.ctx : undefined);

const ROMAN_PUNCT = { '۔': '.', '،': ',', '؟': '?', '؛': ';', '«': '“', '»': '”' };
const toRomanPunct = (s) => s.replace(/[۔،؟؛«»]/g, (c) => ROMAN_PUNCT[c]);
const toLatinDigits = (s) => s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
const capitalise = (s) => s.replace(/^(\P{L}*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());

function wordHtml(t, mode, cap) {
  const w = doc.words[t.i];
  const r = mode === 'urdu' ? null : romanOf(w);
  let cls = 'w';
  if (mode === 'both') cls += ' stack';
  if (r && r.guessed) cls += ' g';
  if (t.i === S.selIdx) cls += ' sel';
  if (S.looked.some((x) => x.k === w.key)) cls += ' seen';
  const open = `<button type="button" class="${cls}" data-i="${t.i}" aria-pressed="${t.i === S.selIdx}" tabindex="-1">`;
  if (mode === 'urdu') return `${open}${esc(t.text)}</button>`;
  const rom = esc(cap ? capitalise(r.roman) : r.roman);
  if (mode === 'roman') return `${open}${rom}</button>`;
  return `${open}<span lang="ur">${esc(t.text)}</span><span class="r" lang="ur-Latn">${rom}</span></button>`;
}

function textHtml() {
  const mode = S.mode;
  const roman = mode === 'roman';
  const dropSpace = (tokens, ti) => roman && tokens[ti].type === 'space' && tokens[ti + 1]?.type === 'punct' && /^[۔،؟؛]/.test(tokens[ti + 1].text);
  let html = '';
  for (const lines of doc.paras) {
    let cap = true; // capitalise the first word of each sentence
    html += `<p dir="${roman ? 'ltr' : 'rtl'}" lang="${roman ? 'ur-Latn' : 'ur'}">`;
    lines.forEach((tokens, li) => {
      if (li) html += '<br>';
      let nb = false; // inside a no-wrap group, so punctuation stays with its word
      tokens.forEach((t, ti) => {
        if (t.type === 'word') {
          const next = tokens[ti + 1];
          const glueAfter = next?.type === 'punct' || (next && dropSpace(tokens, ti + 1));
          if (!nb && glueAfter) { html += '<span class="nb">'; nb = true; }
          html += wordHtml(t, mode, roman && cap);
          cap = false;
          if (nb && !glueAfter) { html += '</span>'; nb = false; }
        } else if (t.type === 'space') {
          if (!dropSpace(tokens, ti)) html += ' ';
        } else if (t.type === 'punct') {
          const s = roman ? toRomanPunct(t.text) : t.text;
          if (roman && /[.?!]/.test(s)) cap = true;
          const prev = tokens[ti - 1];
          const back = prev?.type === 'word' || (prev && dropSpace(tokens, ti - 1) && tokens[ti - 2]?.type === 'word');
          if (back) {
            html += esc(s);
            if (nb) { html += '</span>'; nb = false; }
          } else if (tokens[ti + 1]?.type === 'word') {
            html += `<span class="nb">${esc(s)}`;
            nb = true;
          } else html += esc(s);
        } else if (t.type === 'num') {
          html += roman ? esc(toLatinDigits(t.text)) : `<bdi dir="ltr">${esc(t.text)}</bdi>`;
        } else {
          html += roman ? esc(t.text) : `<bdi class="lat" lang="en" dir="ltr">${esc(t.text)}</bdi>`;
        }
      });
      if (nb) html += '</span>';
    });
    html += '</p>';
  }
  return html;
}

function renderText() {
  el.read.dir = S.mode === 'roman' ? 'ltr' : 'rtl';
  el.text.dataset.mode = S.mode;
  el.text.innerHTML = textHtml();
  wordEls = [...el.text.querySelectorAll('.w')];
  S.tab = Math.min(Math.max(S.selIdx >= 0 ? S.selIdx : S.tab, 0), Math.max(wordEls.length - 1, 0));
  if (wordEls[S.tab]) wordEls[S.tab].tabIndex = 0;
}

function setTab(i) {
  if (i === S.tab || !wordEls[i]) return;
  if (wordEls[S.tab]) wordEls[S.tab].tabIndex = -1;
  S.tab = i;
  wordEls[i].tabIndex = 0;
}

/* ---------- keep reading position across re-renders ---------- */

const BAR = 56;

function anchor() {
  const n = wordEls.length;
  if (!n) return null;
  if (S.selIdx >= 0 && wordEls[S.selIdx]) {
    const r = wordEls[S.selIdx].getBoundingClientRect();
    if (r.bottom > BAR && r.top < innerHeight) return { i: S.selIdx, top: r.top };
  }
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wordEls[mid].getBoundingClientRect().bottom > BAR) hi = mid; else lo = mid + 1;
  }
  return { i: lo, top: wordEls[lo].getBoundingClientRect().top };
}

function keepPosition(change) {
  const a = S.view === 'read' ? anchor() : null;
  change();
  if (a && wordEls[a.i]) window.scrollBy(0, wordEls[a.i].getBoundingClientRect().top - a.top);
}

/* ---------- selection and looked-up list ---------- */

function markSeen(key) {
  for (const i of doc.keyIdx.get(key) || []) wordEls[i]?.classList.add('seen');
}

function addLooked(key, word) {
  S.looked = [{ k: key, w: word }, ...S.looked.filter((x) => x.k !== key)].slice(0, LOOKED_MAX);
  store.set('looked', JSON.stringify(S.looked));
  markSeen(key);
}

function setSelected(idx, word) {
  const prev = S.selIdx;
  if (prev >= 0 && wordEls[prev]) { wordEls[prev].classList.remove('sel'); wordEls[prev].setAttribute('aria-pressed', 'false'); }
  S.selIdx = idx;
  S.selWord = word;
  if (idx >= 0 && wordEls[idx]) { wordEls[idx].classList.add('sel'); wordEls[idx].setAttribute('aria-pressed', 'true'); setTab(idx); }
  if (word) addLooked(lookupKey(word), word);
  renderAll();
}

function revealWord(i, block = 'nearest') {
  wordEls[i]?.scrollIntoView({ block, inline: 'nearest' });
}

function selectIdx(i, { block = 'nearest', focus = false } = {}) {
  if (i < 0 || i >= doc.words.length) return;
  setSelected(i, doc.words[i].text);
  if (focus) wordEls[i].focus({ preventScroll: true });
  revealWord(i, block);
}

function deselect({ refocus = true } = {}) {
  if (!S.selWord) return;
  const prev = S.selIdx;
  setSelected(-1, null);
  if (refocus && prev >= 0 && wordEls[prev]) wordEls[prev].focus({ preventScroll: true });
}

function selectKey(key, word) {
  const idx = S.view === 'read' ? doc.keyIdx.get(key)?.[0] : undefined;
  if (idx !== undefined) selectIdx(idx, { block: 'center' });
  else setSelected(-1, word);
  el.cardScroll.focus({ preventScroll: true });
}

function step(delta) {
  if (S.selIdx < 0) return;
  selectIdx(S.selIdx + delta, { focus: document.activeElement?.closest?.('#text') != null });
}

/* ---------- word card ---------- */

const CARD_ACTS = ['prev', 'next', 'clear-looked', 'undo-looked'];

function highlightHtml(sentence, keys) {
  let html = '';
  for (const lines of tokenize(cleanForDisplay(sentence))) {
    for (const line of lines) for (const t of line) {
      html += t.type === 'word' && keys.has(lookupKey(t.text)) ? `<span class="hl">${esc(t.text)}</span>` : esc(t.text);
    }
  }
  return html;
}

function lookedHtml() {
  const rows = S.looked.map((x) => {
    const m = lookup(x.w).matches[0];
    return `<li><button type="button" class="lrow" data-k="${esc(x.k)}" data-w="${esc(x.w)}"><span class="lr" lang="ur-Latn">${esc(romanFor(x.w).roman)}</span><span class="lm">${esc(m ? m.entry.meanings[0] : '')}</span><span class="lu" lang="ur">${esc(x.w)}</span></button></li>`;
  }).join('');
  let right = '';
  if (S.undo) right = '<button type="button" class="lnk quiet" data-act="undo-looked">Undo</button>';
  else if (S.looked.length) right = '<button type="button" class="lnk quiet" data-act="clear-looked">Clear</button>';
  const body = S.looked.length ? `<ul>${rows}</ul>` : '<p class="empty">Words you tap will collect here.</p>';
  return `<section class="looked" aria-label="Looked up"><div class="row"><span class="lab">Looked up · ${S.looked.length}</span>${right}</div>${body}</section>`;
}

function idleHtml() {
  const reading = S.view === 'read';
  let html = `<div class="row"><span class="lab">${reading ? 'Reading' : 'Reader'}</span></div>`;
  html += `<p class="hint-line">${reading ? 'Tap any word to see what it means.' : 'Paste or type Urdu on the right. Then tap any word to see what it means.'}</p>`;
  if (reading) {
    const total = doc.words.length;
    let stats = `${total} word${total === 1 ? '' : 's'}`;
    if (S.dict === 'ready') {
      if (doc.known === null) doc.known = doc.words.filter((w) => ['exact', 'form'].includes(lookup(w.text).via)).length;
      stats += ` · ${doc.known} in the dictionary`;
    }
    html += `<p class="mono stats">${stats}</p>`;
  }
  if (S.dict === 'failed') html += '<p class="dictfail">The dictionary didn\'t load.</p>';
  if (reading) html += lookedHtml();
  html += `<div class="mono keys">${KEYS_LINE}</div>`;
  return html;
}

function wordHtmlCard() {
  const word = S.selWord;
  const key = lookupKey(word);
  const res = lookup(word, selCtx());
  const rm = romanFor(word, selCtx());
  const rtl = S.mode !== 'roman';
  const pos = S.selIdx >= 0 ? `${S.selIdx + 1} / ${doc.words.length}` : 'not in this text';
  let html = `<div class="row"><span class="lab">Word</span><span class="mono">${pos}</span></div>`;
  html += `<div class="big" lang="ur" dir="rtl">${esc(word)}</div>`;
  html += `<p class="roman${rm.guessed ? ' guessed' : ''}" lang="ur-Latn">${esc(rm.roman)}${rm.guessed ? ' <span class="g">(guess)</span>' : ''}</p>`;
  if (rm.guessed) html += '<p class="muted-note small">Roman spelling is a guess.</p>';
  const lemma = res.matches[0]?.entry;
  if (res.via === 'form') {
    const f = res.matches[0].form;
    html += `<p class="formline">form of <span class="ur" lang="ur">${esc(lemma.ur)}</span> <i lang="ur-Latn">${esc(lemma.roman)}</i>${f.note ? ` <span class="note">· ${esc(f.note)}</span>` : ''}</p>`;
  } else if (res.via === 'guess') {
    html += `<p class="formline">probably a form of <span class="ur" lang="ur">${esc(lemma.ur)}</span> <i lang="ur-Latn">${esc(lemma.roman)}</i></p>`;
  }
  if (res.matches.length) {
    const many = res.matches.length > 1;
    res.matches.forEach(({ entry }) => {
      html += `<section class="entry"><div class="row"><span class="lab">${esc(entry.pos || '')}</span>`;
      if (many && entry.roman !== rm.roman) html += `<span class="eroman" lang="ur-Latn">${esc(entry.roman)}</span>`;
      html += '</div>';
      const ms = entry.meanings || [];
      html += `<ol class="means${ms.length === 1 ? ' one' : ''}">${ms.map((m) => `<li>${esc(m)}</li>`).join('')}</ol></section>`;
    });
    const keys = new Set([key]);
    res.matches.forEach(({ entry }) => { keys.add(lookupKey(entry.ur)); (entry.forms || []).forEach((f) => keys.add(lookupKey(f.ur))); });
    const exs = res.matches.flatMap(({ entry }) => entry.examples || []);
    if (exs.length) {
      html += '<section class="examples"><div class="lab">In a sentence</div>';
      for (const ex of exs) {
        html += `<div class="ex"><p class="u" lang="ur" dir="rtl">${highlightHtml(ex.ur, keys)}</p>`;
        if (ex.roman) html += `<p class="r" lang="ur-Latn">${esc(ex.roman)}</p>`;
        if (ex.en) html += `<p class="e" lang="en">${esc(ex.en)}</p>`;
        html += '</div>';
      }
      html += '</section>';
    }
  } else if (S.dict === 'failed') html += '<p class="dictfail">The dictionary didn\'t load.</p>';
  else if (S.dict === 'loading') html += '<p class="muted-note">Loading the dictionary…</p>';
  else html += '<p class="muted-note">Not in the dictionary yet.</p>';
  html += `<div class="actions"><a class="lnk" href="https://www.rekhta.org/urdudictionary?keyword=${encodeURIComponent(key)}" target="_blank" rel="noopener">Look up on Rekhta ↗</a><button type="button" class="copy" data-act="copy" data-w="${esc(word)}"><span class="a">Copy</span><span class="b" aria-hidden="true">Copied</span></button></div>`;
  const i = S.selIdx, last = doc.words.length - 1;
  const prevOff = i <= 0, nextOff = i < 0 || i >= last;
  const prevBtn = (side) => `<button type="button" class="tb" data-act="prev"${prevOff ? ' disabled' : ''}>${side === 'left' ? '← previous word' : 'previous word →'}</button>`;
  const nextBtn = (side) => `<button type="button" class="tb" data-act="next"${nextOff ? ' disabled' : ''}>${side === 'left' ? '← next word' : 'next word →'}</button>`;
  html += `<div class="pn">${rtl ? nextBtn('left') + prevBtn('right') : prevBtn('left') + nextBtn('right')}</div>`;
  return html;
}

function announcement() {
  const w = S.selWord;
  const res = lookup(w, selCtx());
  const m = res.matches[0];
  return `${w}, ${romanFor(w, selCtx()).roman}. ${m ? m.entry.meanings[0] : 'Not in the dictionary yet.'}`;
}

function renderCard() {
  const showWord = S.selWord && S.view === 'read';
  const active = document.activeElement;
  const act = active && el.cardBody.contains(active) ? active.dataset.act : null;
  const scrollTop = el.cardScroll.scrollTop;
  el.cardBody.innerHTML = showWord ? wordHtmlCard() : idleHtml();
  el.cardScroll.scrollTop = showWord ? 0 : scrollTop;
  el.body.classList.toggle('sheet-open', Boolean(showWord));
  if (act && CARD_ACTS.includes(act)) el.cardBody.querySelector(`[data-act="${act}"]:not(:disabled)`)?.focus({ preventScroll: true });
  if (showWord && cardWord !== S.selWord) el.announce.textContent = announcement();
  cardWord = showWord ? S.selWord : null;
  syncSheet();
}
let cardWord = null;

function renderLooked() {
  el.phoneLooked.innerHTML = S.view === 'read' ? lookedHtml() : '';
}

function renderAll() {
  renderCard();
  renderLooked();
}

function syncSheet() {
  const open = phoneMQ.matches && el.body.classList.contains('sheet-open');
  el.root.style.setProperty('--sheet-h', open ? `${el.card.offsetHeight}px` : '0px');
}

/* ---------- controls ---------- */

function applySize() {
  const fs = SIZES[S.size];
  el.root.style.setProperty('--fs-urdu', `${fs}px`);
  el.root.style.setProperty('--fs-text', `${S.mode === 'roman' ? Math.round(fs * 0.72) : fs}px`);
}

function syncControls() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('[data-act="smaller"]').forEach((b) => { b.disabled = S.size === 0; });
  document.querySelectorAll('[data-act="larger"]').forEach((b) => { b.disabled = S.size === SIZES.length - 1; });
  const composing = S.view === 'compose';
  el.toggle.textContent = composing ? 'Read' : 'Edit';
  el.toggle.disabled = composing && !el.input.value.trim();
  el.clear.hidden = !(composing && el.input.value.length);
}

function setMode(m) {
  if (m === S.mode) return;
  keepPosition(() => {
    S.mode = m;
    store.set('mode', m);
    applySize();
    if (S.view === 'read') renderText();
  });
  renderAll();
  syncControls();
}

function changeSize(d) {
  const n = Math.min(Math.max(S.size + d, 0), SIZES.length - 1);
  if (n === S.size) return;
  keepPosition(() => { S.size = n; store.set('size', String(n)); applySize(); });
  autosize();
  syncControls();
  syncSheet();
}

function autosize() {
  if (S.view !== 'compose') return;
  el.input.style.height = 'auto';
  el.input.style.height = `${el.input.scrollHeight}px`;
}

/* ---------- compose / read ---------- */

let saveTimer = 0;
function saveText(v) { clearTimeout(saveTimer); store.set('text', v); }
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set('text', el.input.value), 300); }

function setView(v) {
  S.view = v;
  el.body.dataset.view = v;
  el.compose.hidden = v !== 'compose';
  el.read.hidden = v !== 'read';
}

function commitRead(scroll = true) {
  const clean = cleanForDisplay(el.input.value);
  if (!clean) return;
  if (clean !== S.text) {
    S.text = clean;
    doc = buildDoc(clean);
    S.selIdx = -1; S.selWord = null; S.tab = 0;
  }
  el.input.value = clean;
  saveText(clean);
  setView('read');
  renderText();
  renderAll();
  syncControls();
  if (scroll) window.scrollTo(0, 0);
}

function edit() {
  setView('compose');
  renderAll();
  syncControls();
  autosize();
  window.scrollTo(0, 0);
  el.input.focus({ preventScroll: true });
  el.input.setSelectionRange(el.input.value.length, el.input.value.length);
}

function clearInput() {
  el.input.focus();
  el.input.select();
  if (!document.execCommand('delete') || el.input.value) el.input.value = '';
  el.input.dispatchEvent(new Event('input'));
}

let pastedIntoEmpty = false;
el.input.addEventListener('paste', () => { pastedIntoEmpty = !el.input.value.trim(); });
el.input.addEventListener('input', () => {
  autosize();
  syncControls();
  scheduleSave();
  if (pastedIntoEmpty) {
    pastedIntoEmpty = false;
    if (el.input.value.trim()) commitRead();
  }
});

/* ---------- looked-up list actions ---------- */

function clearLooked() {
  clearTimeout(S.undo?.timer);
  const list = S.looked;
  if (!list.length) return;
  S.looked = [];
  store.set('looked', '[]');
  doc.keyIdx.forEach((idx) => idx.forEach((i) => wordEls[i]?.classList.remove('seen')));
  S.undo = { list, timer: setTimeout(() => { S.undo = null; renderAll(); }, UNDO_MS) };
  if (S.selWord) addLooked(lookupKey(S.selWord), S.selWord);
  renderAll();
}

function undoLooked() {
  if (!S.undo) return;
  clearTimeout(S.undo.timer);
  const cur = S.looked;
  S.looked = [...cur, ...S.undo.list.filter((x) => !cur.some((c) => c.k === x.k))].slice(0, LOOKED_MAX);
  S.undo = null;
  store.set('looked', JSON.stringify(S.looked));
  S.looked.forEach((x) => markSeen(x.k));
  renderAll();
}

/* ---------- events ---------- */

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return; } catch { /* fall back below */ }
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch { /* nothing more to try */ }
  ta.remove();
}

document.addEventListener('click', (e) => {
  const t = e.target;
  const word = t.closest('#text .w');
  if (word) {
    const i = Number(word.dataset.i);
    if (i === S.selIdx) deselect({ refocus: false });
    else { setSelected(i, doc.words[i].text); word.focus({ preventScroll: true }); revealWord(i); }
    return;
  }
  const row = t.closest('.lrow');
  if (row) { selectKey(row.dataset.k, row.dataset.w); return; }
  const mode = t.closest('[data-mode]');
  if (mode) { setMode(mode.dataset.mode); return; }
  const btn = t.closest('[data-act]');
  if (!btn) return;
  switch (btn.dataset.act) {
    case 'smaller': changeSize(-1); break;
    case 'larger': changeSize(1); break;
    case 'toggle': if (S.view === 'compose') commitRead(); else edit(); break;
    case 'sample': el.input.value = SAMPLE; commitRead(); break;
    case 'clear': clearInput(); break;
    case 'close': deselect(); break;
    case 'prev': step(-1); break;
    case 'next': step(1); break;
    case 'clear-looked': clearLooked(); break;
    case 'undo-looked': undoLooked(); break;
    case 'copy':
      copyText(btn.dataset.w);
      btn.classList.add('done');
      clearTimeout(btn.timer);
      btn.timer = setTimeout(() => btn.classList.remove('done'), 1200);
      break;
    default:
  }
});
$('close').dataset.act = 'close';

el.text.addEventListener('focusin', (e) => {
  const w = e.target.closest('.w');
  if (w) setTab(Number(w.dataset.i));
});

el.text.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || !e.target.closest('.w')) return;
  const n = doc.words.length;
  const i = Number(e.target.closest('.w').dataset.i);
  const fwd = S.mode === 'roman' ? 'ArrowRight' : 'ArrowLeft';
  const back = S.mode === 'roman' ? 'ArrowLeft' : 'ArrowRight';
  let to = null;
  if (e.key === fwd) to = Math.min(i + 1, n - 1);
  else if (e.key === back) to = Math.max(i - 1, 0);
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = n - 1;
  if (to === null) return;
  e.preventDefault();
  if (to === S.selIdx && wordEls[to] === document.activeElement) return;
  selectIdx(to, { focus: true });
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (S.view === 'compose') { e.preventDefault(); commitRead(); }
    return;
  }
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches?.('textarea, input, select, [contenteditable]')) return;
  const k = e.key;
  if (k === 'Escape') deselect();
  else if (k === 'e' || k === 'E') { if (S.view === 'read') { e.preventDefault(); edit(); } else el.input.focus(); }
  else if (k >= '1' && k <= '3') setMode(MODES[Number(k) - 1]);
  else if (k === '-') changeSize(-1);
  else if (k === '=' || k === '+') changeSize(1);
});

new ResizeObserver(syncSheet).observe(el.card);
phoneMQ.addEventListener('change', syncSheet);
addEventListener('pagehide', () => store.set('text', el.input.value));
document.fonts?.ready.then(() => { autosize(); syncSheet(); });
addEventListener('resize', autosize);

/* ---------- start ---------- */

function boot() {
  const mode = store.get('mode');
  if (MODES.includes(mode)) S.mode = mode;
  const size = Number(store.get('size'));
  S.size = Number.isInteger(size) && size >= 0 && size < SIZES.length && store.get('size') !== null ? size : (phoneMQ.matches ? 1 : 2);
  try {
    const looked = JSON.parse(store.get('looked') || '[]');
    if (Array.isArray(looked)) S.looked = looked.filter((x) => x && typeof x.k === 'string' && typeof x.w === 'string').slice(0, LOOKED_MAX);
  } catch { S.looked = []; }
  el.hint.textContent = touchOnly ? 'Paste or type Urdu, then tap Read' : `Paste or type Urdu, then ${isMac ? '⌘' : 'Ctrl'} Enter to read`;
  const saved = store.get('text');
  el.input.value = saved || '';
  applySize();
  if (saved && saved.trim()) commitRead(false);
  else { setView('compose'); renderAll(); syncControls(); autosize(); el.input.focus(); }
}

boot();

loadDictionary(new URL('../dict/sample.json', import.meta.url))
  .then(() => { S.dict = 'ready'; })
  .catch(() => { S.dict = 'failed'; })
  .finally(() => {
    romanCache.clear();
    doc.known = null;
    if (S.view === 'read' && S.mode !== 'urdu') keepPosition(renderText);
    renderAll();
  });
