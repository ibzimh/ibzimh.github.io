// The catalogue card: the big number rolls when you move between pages; on home and collection
// pages it also previews whatever you hover or focus. Re-initialised after every client-side navigation.
export interface CardState {
  num: string;
  label: string;
  title: string;
  meta: string;
  line: string;
  sketch: string;
}

export interface CardController {
  /** Make this the card's default (what it returns to) and show it now. */
  setDefault(s: CardState): void;
}

export function stateFrom(el: HTMLElement): CardState {
  const d = el.dataset;
  return {
    num: d.cardNum ?? '',
    label: d.cardLabel ?? '',
    title: d.cardTitle ?? '',
    meta: d.cardMeta ?? '',
    line: d.cardLine ?? '',
    sketch: d.cardSketch ?? '',
  };
}

const ROLL_MS = 130;
// Changes closer together than this count as scanning: update at once, no flourish.
const SCAN_MS = 250;
const HOLD_MS = 400;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The controller for the current page (null where the card does not preview). */
export let cardController: CardController | null = null;

let teardown: (() => void) | undefined;
let leaving = ''; // the number on screen when the last page was left

// The number is plain text, so the font's own kerning applies. Only a roll swaps in per-character cells.
function plain(el: HTMLElement, text: string) {
  const nodes: Node[] = [];
  [...text].forEach((ch, i) => {
    const cls = ch === '-' ? 'd' : ch === '1' && i > 0 ? 'one' : '';
    if (!cls) return void nodes.push(document.createTextNode(ch));
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = ch;
    nodes.push(s);
  });
  el.replaceChildren(...nodes);
}

// Left edge of each character as laid out right now, relative to the number.
function offsets(el: HTMLElement): number[] {
  const base = el.getBoundingClientRect().left;
  const out: number[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n as Text).length;
    for (let i = 0; i < len; i++) {
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      out.push(range.getBoundingClientRect().left - base);
    }
  }
  return out;
}

function glyph(ch: string) {
  const s = document.createElement('span');
  s.textContent = ch;
  if (ch === '-') s.className = 'd';
  return s;
}

function init(from: string) {
  teardown?.();
  cardController = null;
  const card = document.querySelector<HTMLElement>('.card');
  const elNum = card?.querySelector<HTMLElement>('.num');
  if (!card || !elNum) return;
  const elLabel = card.querySelector<HTMLElement>('.card-label');
  const elTitle = card.querySelector<HTMLElement>('.card-title');
  const elMeta = card.querySelector<HTMLElement>('.card-meta');
  const elLine = card.querySelector<HTMLElement>('.card-line');
  const elSketch = card.querySelector<HTMLElement>('.sketch-wrap');

  let curNum = elNum.getAttribute('aria-label') ?? '';
  let curKey = '';
  let curSketch = card.dataset.cardSketch ?? '';
  let defaultState = stateFrom(card);
  let lastAt = 0;
  let settle: number | undefined;
  let holdTimer: number | undefined;

  const sizeClass = (t: string) => `num ${[...t].length === 1 ? 'n1' : 'n4'}`;

  // Each changed character rolls like a counter; unchanged ones slide to their new place.
  function setNum(t: string, animate: boolean) {
    if (t === curNum) return;
    const rolling = settle !== undefined;
    if (rolling) {
      clearTimeout(settle);
      settle = undefined;
    }
    const old = [...curNum];
    const next = [...t];
    const fromX = rolling ? [] : offsets(elNum!);
    curNum = t;
    leaving = t;
    elNum!.className = sizeClass(t);
    elNum!.dataset.l = t[0];
    elNum!.setAttribute('aria-label', t);
    plain(elNum!, t);
    // Scanning (a roll still running) jumps straight to the new number.
    if (!animate || rolling || reduced() || old.length === 0) return;
    const toX = offsets(elNum!);
    const kids: HTMLElement[] = [];
    for (let i = 0; i < Math.max(old.length, next.length); i++) {
      const o = old[i] ?? '';
      const nw = next[i] ?? '';
      const x = toX[i] ?? fromX[i] ?? 0;
      const c = document.createElement('span');
      c.className = 'c';
      c.style.left = `${x}px`;
      if (o === nw) c.appendChild(glyph(o));
      else {
        const col = document.createElement('span');
        col.className = 'col';
        col.append(glyph(o), glyph(nw));
        c.appendChild(col);
        col.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-50%)' }], {
          duration: ROLL_MS,
          easing: 'cubic-bezier(.2,.8,.2,1)',
          fill: 'both',
        });
      }
      const dx = (fromX[i] ?? x) - x;
      if (dx) c.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: ROLL_MS, easing: 'cubic-bezier(.2,.8,.2,1)' });
      kids.push(c);
    }
    elNum!.replaceChildren(...kids);
    settle = window.setTimeout(() => {
      settle = undefined;
      plain(elNum!, curNum);
    }, ROLL_MS + 30);
  }

  function setText(el: HTMLElement | null, text: string, animate: boolean) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (animate && !reduced() && text) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
  }

  function setSketch(kind: string, animate: boolean) {
    if (!elSketch || kind === curSketch) return;
    curSketch = kind;
    const tpl = kind ? card!.querySelector<HTMLTemplateElement>(`template[data-kind="${CSS.escape(kind)}"]`) : null;
    elSketch.replaceChildren(...(tpl ? [tpl.content.cloneNode(true)] : []));
    if (animate && !reduced() && tpl) elSketch.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
  }

  function setCard(s: CardState) {
    const key = JSON.stringify(s);
    if (key === curKey) return;
    curKey = key;
    const now = performance.now();
    const animate = now - lastAt > SCAN_MS;
    lastAt = now;
    setNum(s.num, animate);
    setText(elLabel, s.label, animate);
    setText(elTitle, s.title, animate);
    setText(elMeta, s.meta, animate);
    setText(elLine, s.line, animate);
    setSketch(s.sketch, animate);
    document.querySelectorAll<HTMLElement>('.shelf a').forEach((a) => a.classList.toggle('cur', a.dataset.cardNum === s.num));
  }

  function mark(el: Element | null) {
    document.querySelectorAll('.row.on').forEach((r) => r.classList.remove('on'));
    el?.classList.add('on');
  }

  function show(el: HTMLElement) {
    clearTimeout(holdTimer);
    mark(el.classList.contains('row') ? el : null);
    setCard(stateFrom(el));
  }
  function hold() {
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      mark(null);
      setCard(defaultState);
    }, HOLD_MS);
  }

  teardown = () => {
    clearTimeout(settle);
    clearTimeout(holdTimer);
    teardown = undefined;
  };

  // Arrived from another page: start from the old number and roll to this one.
  curKey = JSON.stringify(defaultState);
  if (from && from !== curNum && !reduced()) {
    const target = curNum;
    curNum = from;
    elNum.className = sizeClass(from);
    elNum.dataset.l = from[0];
    plain(elNum, from);
    setNum(target, true);
  } else leaving = curNum;

  if (document.body.dataset.layout !== 'list') return;
  document.querySelectorAll<HTMLElement>('.row[data-card-num], .shelf a[data-card-num]').forEach((el) => {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('pointerleave', hold);
    el.addEventListener('blur', hold);
  });
  cardController = {
    setDefault(s) {
      clearTimeout(holdTimer);
      defaultState = s;
      mark(null);
      lastAt = 0;
      setCard(s);
    },
  };
}

init('');
// Before the first paint of each new page: the old number is still known here.
document.addEventListener('astro:after-swap', () => init(leaving));
document.addEventListener('astro:before-swap', () => teardown?.());
