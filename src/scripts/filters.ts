// Kind filters on collection pages. The server HTML lists every row; this hides the ones that don't match.
import { cardController, stateFrom } from './card';

function init() {
  const bar = document.querySelector<HTMLElement>('.filters');
  if (!bar || !cardController) return;
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button[data-f]')];
  const rows = [...document.querySelectorAll<HTMLElement>('.rows > li[data-kind]')];
  const tokens = new Set(buttons.map((b) => b.dataset.f ?? '').filter(Boolean));
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
    const first = shown[0]?.querySelector<HTMLElement>('.row');
    if (!first) return;
    cardController!.setDefault({
      ...stateFrom(first),
      label: f ? `${name} · showing ${shown.length} of ${total}` : allLabel,
    });
  }

  function fromHash() {
    let h = '';
    try {
      h = decodeURIComponent(location.hash.slice(1));
    } catch {
      /* malformed hash: treat as none */
    }
    apply(tokens.has(h) ? h : '');
  }

  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-f]');
    if (!b) return;
    const f = b.dataset.f ?? '';
    history.replaceState(null, '', f ? `#${f}` : location.pathname + location.search);
    apply(f);
  });
  window.addEventListener('hashchange', fromHash);
  bar.hidden = false;
  fromHash();
}

init();
