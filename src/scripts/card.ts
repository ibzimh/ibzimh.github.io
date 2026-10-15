// Live card on home and collection pages: preview on hover/focus, rolling number.
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

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function init(): CardController | null {
  const card = document.querySelector<HTMLElement>('.card');
  if (!card || document.body.dataset.layout !== 'list') return null;
  const elNum = card.querySelector<HTMLElement>('.num');
  const elLabel = card.querySelector<HTMLElement>('.card-label');
  const elTitle = card.querySelector<HTMLElement>('.card-title');
  const elMeta = card.querySelector<HTMLElement>('.card-meta');
  const elLine = card.querySelector<HTMLElement>('.card-line');
  const elSketch = card.querySelector<HTMLElement>('.sketch-wrap');
  if (!elNum) return null;

  let curNum = elNum.getAttribute('aria-label') ?? '';
  let curKey = '';
  let curSketch = card.dataset.cardSketch ?? '';
  let defaultState = stateFrom(card);
  let settle: number | undefined;
  let showTimer: number | undefined;
  let holdTimer: number | undefined;

  const cell = (ch: string) => {
    const c = document.createElement('span');
    c.className = 'c';
    const s = document.createElement('span');
    s.textContent = ch;
    if (ch === '-') s.className = 'd';
    c.appendChild(s);
    return c;
  };
  const paint = (t: string) => elNum.replaceChildren(...[...t].map(cell));

  // Each character rolls like a counter; an interrupted roll is repainted cleanly.
  function setNum(t: string, animate: boolean) {
    if (t === curNum) return;
    if (settle !== undefined) {
      clearTimeout(settle);
      settle = undefined;
      paint(curNum);
    }
    const old = [...curNum];
    const next = [...t];
    curNum = t;
    elNum!.className = `num ${next.length === 1 ? 'n1' : 'n4'}`;
    elNum!.setAttribute('aria-label', t);
    if (!animate || reduced() || old.length === 0) {
      paint(t);
      return;
    }
    const n = Math.max(old.length, next.length);
    const kids: HTMLElement[] = [];
    for (let i = 0; i < n; i++) {
      const o = old[i] ?? '';
      const nw = next[i] ?? '';
      if (o === nw) {
        kids.push(cell(o));
        continue;
      }
      const c = document.createElement('span');
      c.className = 'c';
      const col = document.createElement('span');
      col.className = 'col';
      for (const ch of [o, nw]) {
        const s = document.createElement('span');
        s.textContent = ch;
        if (ch === '-') s.className = 'd';
        col.appendChild(s);
      }
      c.appendChild(col);
      kids.push(c);
      col.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-50%)' }], {
        duration: 220,
        delay: i * 30,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'both',
      });
    }
    elNum!.replaceChildren(...kids);
    settle = window.setTimeout(() => {
      settle = undefined;
      paint(curNum);
    }, 220 + n * 30 + 40);
  }

  function setText(el: HTMLElement | null, text: string, animate: boolean) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (animate && !reduced() && text) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  }

  function setSketch(kind: string, animate: boolean) {
    if (!elSketch || kind === curSketch) return;
    curSketch = kind;
    const tpl = kind ? card!.querySelector<HTMLTemplateElement>(`template[data-kind="${CSS.escape(kind)}"]`) : null;
    elSketch.replaceChildren(...(tpl ? [tpl.content.cloneNode(true)] : []));
    if (animate && !reduced() && tpl) elSketch.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  }

  function setCard(s: CardState, animate: boolean) {
    const key = JSON.stringify(s);
    if (key === curKey) return;
    curKey = key;
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

  const clearTimers = () => {
    clearTimeout(showTimer);
    clearTimeout(holdTimer);
  };
  function show(el: HTMLElement) {
    clearTimers();
    showTimer = window.setTimeout(() => {
      mark(el.classList.contains('row') ? el : null);
      setCard(stateFrom(el), true);
    }, 40);
  }
  function hold() {
    clearTimers();
    holdTimer = window.setTimeout(() => {
      mark(null);
      setCard(defaultState, true);
    }, 400);
  }

  document.querySelectorAll<HTMLElement>('.row[data-card-num], .shelf a[data-card-num]').forEach((el) => {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('pointerleave', hold);
    el.addEventListener('blur', hold);
  });

  curKey = JSON.stringify(defaultState);
  return {
    setDefault(s) {
      clearTimers();
      defaultState = s;
      mark(null);
      setCard(s, false);
    },
  };
}

export const cardController = init();
