// Kind filters on collection pages. The server HTML lists every row; this hides the ones that don't match.
import { cardController, stateFrom } from './card';

let filterStop: AbortController | undefined;

function init() {
  filterStop?.abort();
  const bar = document.querySelector<HTMLElement>('.filters');
  if (!bar || !cardController) return;
  const ctl = new AbortController();
  filterStop = ctl;
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button[data-f]')];
  const rows = [...document.querySelectorAll<HTMLElement>('.rows > li[data-kind]')];
  const tokens = new Set(buttons.map((b) => b.dataset.f ?? '').filter(Boolean));
  const base = stateFrom(document.querySelector<HTMLElement>('.card') as HTMLElement);
  const { name = '', total = '0', allLabel = '' } = bar.dataset;

  function apply(f: string) {
    let lastYear = '';
    const shown: HTMLElement[] = [];
    for (const li of rows) {
      const on = !f || li.dataset.kind === f;
      li.hidden = !on;
      const yr = li.querySelector('.yr');
      if (!on) continue;
      shown.push(li);
      if (yr) yr.textContent = li.dataset.year !== lastYear ? (li.dataset.year ?? '') : '';
      lastYear = li.dataset.year ?? '';
    }
    for (const b of buttons) b.setAttribute('aria-pressed', String((b.dataset.f ?? '') === f));
    cardController?.setDefault({ ...base, label: f ? `${name} · showing ${shown.length} of ${total}` : allLabel });
  }

  function fromHash() {
    let h = '';
    try {
      h = decodeURIComponent(location.hash.slice(1));
    } catch {
      /* malformed hash: treat as none */
    }
    apply(tokens.has(h.toLowerCase()) ? h.toLowerCase() : '');
  }

  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-f]');
    if (!b) return;
    const f = b.dataset.f ?? '';
    // keep the router's own history state, only the address changes
    history.replaceState(history.state, '', f ? `#${f}` : location.pathname + location.search);
    apply(f);
  });
  window.addEventListener('hashchange', fromHash, { signal: ctl.signal });
  bar.hidden = false;
  fromHash();
}

init();
document.addEventListener('astro:after-swap', init);
document.addEventListener('astro:before-swap', () => filterStop?.abort());
