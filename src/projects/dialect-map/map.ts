// Dialect map, browser half. The server renders the first feature; this switches features and cities.
// Follows scripts/filters.ts: init on load and after every client-side navigation, tear down before the next swap.
import type { Payload, Sym } from './payload';

type Cell = Exclude<Payload['cells'][number][number], 0>;

const HOLD_MS = 400;
const NEAR = 20;
const NEAR_TOUCH = 24;
const COPIED_MS = 1500;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const symbol = (s: Sym) => {
  const e = h('span', `sym ${s}`);
  e.setAttribute('aria-hidden', 'true');
  return e;
};
const lower = (s: string) => s.toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

let stop: AbortController | undefined;

function init() {
  stop?.abort();
  const root = document.querySelector<HTMLElement>('[data-dm]');
  const raw = root?.querySelector('#dm-data')?.textContent;
  if (!root || !raw) return;
  const ctl = new AbortController();
  stop = ctl;
  const { signal } = ctl;
  const data: Payload = JSON.parse(raw);
  const { places, features, kinds, sources, findings } = data;

  const frame = root.querySelector<HTMLElement>('.dm-frame') as HTMLElement;
  const layer = root.querySelector<HTMLElement>('.dm-dots') as HTMLElement;
  const dots = [...layer.querySelectorAll<HTMLElement>('.dot')];
  const insp = document.querySelector<HTMLElement>('[data-inspector]') as HTMLElement;
  const slot = root.querySelector<HTMLElement>('[data-inspector-slot]') as HTMLElement;
  const list = root.querySelector<HTMLElement>('[data-list]') as HTMLElement;
  const listHead = root.querySelector<HTMLElement>('#dm-lh') as HTMLElement;
  const live = root.querySelector<HTMLElement>('[data-live]') as HTMLElement;
  const picks = root.querySelector<HTMLElement>('.dm-picks') as HTMLElement;
  const pickBtns = [...picks.querySelectorAll<HTMLButtonElement>('button[data-f]')];
  const baseTitle = document.title;
  const firstIdx = Math.max(0, features.findIndex((f) => f.id === data.first));
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const phone = matchMedia('(max-width: 999px)');

  let feature = firstIdx;
  let place = -1;
  let hover = -1;
  let focusSym: Sym | null = null;
  let holdT: number | undefined;
  let copyT: number | undefined;
  let viewKey = '';
  let quiet = false; // focus moved by us: no preview

  const cellAt = (fi: number, pi: number): Cell | null => data.cells[fi][pi] || null;
  const symAt = (fi: number, pi: number): Sym => {
    const c = cellAt(fi, pi);
    return c ? findings[c.h].y : 'none';
  };
  const srcText = (f: (typeof findings)[number]) => `${sources[f.s].short} ${f.p}`.trim();
  const countsOf = (fi: number): Record<Sym, number> => {
    const n: Record<Sym, number> = { full: 0, near: 0, half: 0, ring: 0, none: 0 };
    for (let i = 0; i < places.length; i++) n[symAt(fi, i)]++;
    return n;
  };
  const recordedAt = (pi: number) => features.filter((_, fi) => cellAt(fi, pi)).length;

  // ---- inspector --------------------------------------------------------------------------------

  const copyButton = () => {
    const b = h('button', 'dm-copy', 'Copy link');
    b.type = 'button';
    b.dataset.k = 'copy';
    return b;
  };

  function featureView(fi: number): Node[] {
    const f = features[fi];
    const kind = kinds[f.kind];
    const out: Node[] = [h('p', 'lab', kind.label), h('h2', 'card-title', f.name)];
    if (f.also) out.push(h('p', 'dm-also', `Also called ${f.also}`));
    const say = h('p', 'dm-say');
    say.append(h('span', 'lab', 'Say'), ' ', h('i', '', f.ex.join(' · ')));
    out.push(say, h('p', 'card-line', f.about));
    const src = data.fsrc[fi];
    if (!src.length) out.push(h('p', 'dm-mute', 'Nothing recorded for this feature yet.'));
    else {
      const n = countsOf(fi);
      const ul = h('ul', 'dm-leg');
      for (const l of kind.legend) {
        const b = h('button');
        b.type = 'button';
        b.dataset.k = `leg:${l.s}`;
        b.dataset.sym = l.s;
        b.setAttribute('aria-pressed', String(focusSym === l.s));
        b.append(symbol(l.s), h('span', 'nm', l.l), h('span', 'ct tn', String(n[l.s])));
        const li = h('li');
        li.append(b);
        ul.append(li);
      }
      const from = h('ul', 'dm-from');
      for (const [si, count] of src) {
        from.append(h('li', '', `${sources[si].short} · collected ${sources[si].yrs} · ${plural(count, 'place', 'places')}`));
      }
      out.push(ul, h('p', 'dm-total tn', `${places.length} places`), h('p', 'lab dm-h', 'Data from'), from);
      const differs = places.filter((_, pi) => cellAt(fi, pi)?.d).length;
      if (differs) out.push(h('p', 'dm-mute', `Sources differ in ${plural(differs, 'place', 'places')}. The dot shows the newest data.`));
    }
    out.push(copyButton());
    return out;
  }

  function cityView(pi: number, selected: boolean): Node[] {
    const p = places[pi];
    const top = h('div', 'dm-top');
    top.append(h('span', 'lab', `Place · ${p.rn}`));
    if (selected) {
      const x = h('button', 'dm-x', '×');
      x.type = 'button';
      x.dataset.k = 'x';
      x.setAttribute('aria-label', `Close ${p.n}`);
      top.append(x);
    }
    const out: Node[] = [top, h('h2', 'card-title', p.n), h('p', 'card-meta', `${recordedAt(pi)} of ${features.length} features recorded`)];
    let kindId = '';
    let ul: HTMLElement | null = null;
    features.forEach((f, fi) => {
      if (f.kind !== kindId) {
        kindId = f.kind;
        out.push(h('p', 'lab dm-h', kinds[kindId].plural), (ul = h('ul', 'dm-rows')));
      }
      const c = cellAt(fi, pi);
      const row = h(selected ? 'button' : 'div', `dm-r${fi === feature ? ' on' : ''}`);
      if (row instanceof HTMLButtonElement) {
        row.type = 'button';
        row.dataset.f = f.id;
        row.dataset.k = `row:${f.id}`;
      }
      const shown = c && findings[c.h];
      const vl = h('span', `vl${c ? '' : ' mu'}`, shown ? shown.v : 'Nothing recorded');
      if (c?.d) vl.append(' ', h('span', 'df', '≠ sources differ'));
      row.append(symbol(shown ? shown.y : 'none'), h('span', 'nm', f.name), vl);
      if (c) {
        // several lines when sources differ or ages split, each with its own value
        const many = c.d || c.g;
        for (const i of many ? c.f : [c.h]) {
          const fd = findings[i];
          const bits = [srcText(fd), `collected ${sources[fd.s].yrs}`, fd.m, fd.a].filter(Boolean);
          row.append(h('span', 'ln', `${many ? `${fd.v} — ` : ''}${bits.join(' · ')}`));
          if (fd.n) row.append(h('span', 'nt', fd.n));
        }
      }
      const li = h('li');
      li.append(row);
      ul?.append(li);
    });
    if (selected) out.push(copyButton());
    return out;
  }

  function renderInspector() {
    const view = hover >= 0 ? hover : place;
    const key = view >= 0 ? `c${view}|${view === place ? 's' : 'p'}|${feature}` : `f${feature}`;
    if (key === viewKey) return;
    viewKey = key;
    const had = insp.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.k : undefined;
    insp.replaceChildren(...(view >= 0 ? cityView(view, view === place) : featureView(feature)));
    if (had) {
      for (const el of insp.querySelectorAll<HTMLElement>('[data-k]')) {
        if (el.dataset.k === had) el.focus({ preventScroll: true });
      }
    }
  }

  // ---- list -------------------------------------------------------------------------------------

  function renderList() {
    const f = features[feature];
    listHead.textContent = `${f.name} by place`;
    const groups: Node[] = [];
    for (const l of kinds[f.kind].legend) {
      const rows = places.map((_, i) => i).filter((i) => symAt(feature, i) === l.s);
      if (!rows.length) continue;
      if (l.s === 'none') {
        const p = h('p', 'dm-nr', 'Nothing recorded: ');
        rows.forEach((i, k) => {
          const b = h('button', 'dm-pn', places[i].n);
          b.type = 'button';
          b.dataset.i = String(i);
          const nw = h('span', 'nw');
          nw.append(b, k < rows.length - 1 ? ',' : '');
          p.append(nw, k < rows.length - 1 ? ' ' : '');
        });
        groups.push(p);
        continue;
      }
      const sec = h('section', 'dm-g');
      const head = h('h3', 'dm-gh');
      head.append(symbol(l.s), h('span', '', l.l), h('span', 'tn', `· ${rows.length}`));
      const ul = h('ul');
      for (const i of rows) {
        const c = cellAt(feature, i) as Cell;
        const b = h('button', 'dm-pl');
        b.type = 'button';
        b.dataset.i = String(i);
        const m = h('span', 'm', srcText(findings[c.h]));
        if (c.d) m.append(h('span', 'df', ' ≠ sources differ'));
        b.append(h('span', 't', `${places[i].n}, ${places[i].r}`), m);
        const li = h('li');
        li.append(b);
        ul.append(li);
      }
      sec.append(head, ul);
      groups.push(sec);
    }
    list.replaceChildren(...groups);
    markList();
  }

  const markList = () => list.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === place));

  // ---- map --------------------------------------------------------------------------------------

  layer.querySelectorAll('.dm-lbl').forEach((e) => e.remove());
  const lblHover = h('span', 'dm-lbl');
  const lblSel = h('span', 'dm-lbl');
  layer.append(lblHover, lblSel);

  function setLabel(e: HTMLElement, pi: number) {
    e.hidden = pi < 0;
    if (pi < 0) return;
    const p = places[pi];
    e.textContent = p.n;
    e.style.top = `${p.y}%`;
    const flip = p.x > 80;
    e.style.left = flip ? 'auto' : `calc(${p.x}% + 9px)`;
    e.style.right = flip ? `calc(${100 - p.x}% + 9px)` : 'auto';
  }

  function paintDots() {
    dots.forEach((d, i) => {
      d.className = `sym dot ${symAt(feature, i)}${i === hover || i === place ? ' on' : ''}${i === place ? ' sel' : ''}`;
    });
    frame.dataset.focus = focusSym ?? '';
    setLabel(lblHover, hover >= 0 && hover !== place ? hover : -1);
    setLabel(lblSel, place);
  }

  function paint() {
    paintDots();
    renderInspector();
    markList();
  }

  // ---- state changes ----------------------------------------------------------------------------

  function say(text: string) {
    live.textContent = text;
  }
  function sayPlace() {
    const f = features[feature];
    const c = cellAt(feature, place);
    return `${places[place].n}: ${f.name}, ${c ? lower(findings[c.h].v) : 'nothing recorded'}`;
  }
  function sayFeature() {
    const n = countsOf(feature);
    const parts = kinds[features[feature].kind].legend.filter((l) => n[l.s]).map((l) => `${n[l.s]} ${lower(l.l)}`);
    return `${features[feature].name}: ${parts.join(', ')}`;
  }

  function sync() {
    const f = features[feature];
    const q = new URLSearchParams(location.search);
    q.delete('feature');
    q.delete('place');
    if (feature !== firstIdx) q.set('feature', f.id);
    if (place >= 0) q.set('place', places[place].id);
    const s = q.toString();
    // keep the router's own history state, only the address changes
    history.replaceState(history.state, '', location.pathname + (s ? `?${s}` : '') + location.hash);
    document.title = place >= 0 ? `${places[place].n} · ${f.name} / ${baseTitle}` : feature !== firstIdx ? `${f.name} / ${baseTitle}` : baseTitle;
  }

  function setFeature(fi: number) {
    if (fi === feature) return;
    feature = fi;
    focusSym = null;
    pickBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === features[fi].id)));
    renderList();
    paint();
    sync();
    say(place >= 0 ? `${sayFeature()}. ${sayPlace()}` : sayFeature());
  }

  function select(pi: number) {
    if (pi === place) return;
    place = pi;
    paint();
    sync();
    if (pi >= 0) say(sayPlace());
  }

  function setHover(pi: number) {
    clearTimeout(holdT);
    holdT = undefined;
    if (pi === hover) return;
    hover = pi;
    paint();
  }
  function hold() {
    if (hover < 0 || holdT !== undefined) return;
    holdT = window.setTimeout(() => {
      holdT = undefined;
      hover = -1;
      paint();
    }, HOLD_MS);
  }

  function setFocusSym(s: Sym | null) {
    focusSym = s;
    insp.querySelectorAll<HTMLElement>('[data-sym]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sym === s)));
    frame.dataset.focus = s ?? '';
  }

  // The inspector sits under the map on phones; bring it into view when a tap changes it.
  function showInspector(always: boolean) {
    if (!phone.matches) return;
    const r = insp.getBoundingClientRect();
    if (always ? r.top < 0 || r.top > innerHeight : r.top > innerHeight) insp.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  }

  // ---- map pointer ------------------------------------------------------------------------------

  let w = 0;
  let ht = 0;
  const measure = () => {
    w = frame.clientWidth;
    ht = frame.clientHeight;
  };
  const ro = new ResizeObserver(measure);
  ro.observe(frame);
  measure();

  function nearest(e: MouseEvent, max: number) {
    const r = frame.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best = -1;
    let bd = max * max;
    places.forEach((p, i) => {
      const dx = (p.x / 100) * w - x;
      const dy = (p.y / 100) * ht - y;
      const d = dx * dx + dy * dy;
      if (d <= bd) [best, bd] = [i, d];
    });
    return best;
  }

  frame.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || !fine.matches) return;
      const i = nearest(e, NEAR);
      frame.classList.toggle('hit', i >= 0);
      if (i >= 0) setHover(i);
      else hold();
    },
    { signal },
  );
  frame.addEventListener(
    'pointerleave',
    (e) => {
      if (e.pointerType === 'touch') return;
      frame.classList.remove('hit');
      hold();
    },
    { signal },
  );
  frame.addEventListener(
    'click',
    (e) => {
      const touch = (e as PointerEvent).pointerType === 'touch';
      const i = nearest(e, touch ? NEAR_TOUCH : NEAR);
      select(i >= 0 && i !== place ? i : -1);
      if (touch && i >= 0) showInspector(false);
    },
    { signal },
  );

  // ---- list, picker, inspector, recent ----------------------------------------------------------

  const rowOf = (t: EventTarget | null) => (t as Element | null)?.closest<HTMLElement>('[data-i]') ?? null;
  list.addEventListener(
    'pointerover',
    (e) => {
      const r = rowOf(e.target);
      if (r && e.pointerType !== 'touch') setHover(Number(r.dataset.i));
    },
    { signal },
  );
  list.addEventListener('pointerout', (e) => e.pointerType !== 'touch' && rowOf(e.target) && hold(), { signal });
  list.addEventListener('focusin', (e) => rowOf(e.target) && !quiet && setHover(Number(rowOf(e.target)?.dataset.i)), { signal });
  list.addEventListener('focusout', (e) => rowOf(e.target) && hold(), { signal });
  list.addEventListener(
    'click',
    (e) => {
      const r = rowOf(e.target);
      if (!r) return;
      const i = Number(r.dataset.i);
      if (i === place) {
        leave(e.detail === 0);
        return;
      }
      select(i);
      showInspector(true);
    },
    { signal },
  );

  picks.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-f]');
      if (b) setFeature(features.findIndex((f) => f.id === b.dataset.f));
    },
    { signal },
  );

  insp.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-k]');
      const k = b?.dataset.k ?? '';
      if (!b) return;
      if (k.startsWith('leg:')) setFocusSym(focusSym === b.dataset.sym ? null : (b.dataset.sym as Sym));
      else if (k.startsWith('row:')) setFeature(features.findIndex((f) => f.id === b.dataset.f));
      else if (k === 'x') {
        leave(true);
      } else if (k === 'copy') copyLink(b);
    },
    { signal },
  );

  // Deselect and show the feature view; with `refocus` focus goes back to the place's list row without previewing it.
  function leave(clearHover: boolean) {
    const was = place;
    const inside = insp.contains(document.activeElement);
    select(-1);
    if (clearHover) setHover(-1);
    if (inside || clearHover) {
      quiet = true;
      (list.querySelector<HTMLElement>(`[data-i="${was}"]`) ?? frame).focus({ preventScroll: true });
      quiet = false;
    }
  }

  function copyLink(b: HTMLElement) {
    clearTimeout(copyT);
    (navigator.clipboard?.writeText(location.href) ?? Promise.reject(new Error('no clipboard'))).then(
      () => {
        b.textContent = 'Copied';
        copyT = window.setTimeout(() => (b.textContent = 'Copy link'), COPIED_MS);
      },
      () => {
        // no clipboard: show the address, selected, to copy by hand
        const input = h('input', 'dm-url');
        input.readOnly = true;
        input.value = location.href;
        input.setAttribute('aria-label', 'Link to this view');
        b.replaceWith(input);
        input.focus();
        input.select();
      },
    );
  }

  root.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element).closest<HTMLElement>('.dm-recent button');
      if (!b) return;
      const fi = features.findIndex((f) => f.id === b.dataset.feature);
      const pi = places.findIndex((p) => p.id === b.dataset.place);
      if (fi >= 0) setFeature(fi);
      select(pi);
      frame.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    },
    { signal },
  );

  // ---- keys -------------------------------------------------------------------------------------

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === '[' || e.key === ']') {
        const n = features.length;
        setFeature((feature + (e.key === ']' ? 1 : n - 1)) % n);
      } else if (e.key === 'Escape') {
        if (focusSym) setFocusSym(null);
        else if (place >= 0) leave(true);
      }
    },
    { signal },
  );

  // ---- phone: the inspector lives under the map ---------------------------------------------------

  function park() {
    if (phone.matches) slot.append(insp);
    else document.querySelector('.card-bot .sketch-wrap')?.after(insp);
  }
  phone.addEventListener('change', park, { signal });
  park();

  signal.addEventListener('abort', () => {
    clearTimeout(holdT);
    clearTimeout(copyT);
    ro.disconnect();
  });

  // ---- start ------------------------------------------------------------------------------------

  const q = new URLSearchParams(location.search);
  const fi = features.findIndex((f) => f.id === q.get('feature')?.toLowerCase());
  const pi = places.findIndex((p) => p.id === q.get('place')?.toLowerCase());
  if (fi >= 0) feature = fi;
  if (pi >= 0) place = pi;
  pickBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === features[feature].id)));
  if (feature !== firstIdx) renderList();
  viewKey = `f${firstIdx}`;
  paint();
  if (q.has('feature') || q.has('place')) sync();
  picks.hidden = false;
  root.querySelector('.dm-tip')?.removeAttribute('hidden');
}

init();
document.addEventListener('astro:after-swap', init);
document.addEventListener('astro:before-swap', () => stop?.abort());
