// Contents list on item pages: mark the section you are reading.
export {};
let tocStop: AbortController | undefined;

function init() {
  tocStop?.abort();
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc a')];
  const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
  if (!links.length) return;
  const ctl = new AbortController();
  tocStop = ctl;
  let queued = false;

  function spy() {
    queued = false;
    let idx = -1;
    heads.forEach((h, i) => {
      if (h && h.getBoundingClientRect().top < window.innerHeight * 0.4) idx = i;
    });
    links.forEach((a, i) => (i === idx ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(spy);
      }
    },
    { passive: true, signal: ctl.signal },
  );
  spy();
}

init();
document.addEventListener('astro:after-swap', init);
document.addEventListener('astro:before-swap', () => tocStop?.abort());
