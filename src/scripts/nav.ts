// Page changes: a click on a link to the page you are already on does nothing.
// After each client-side navigation, keyboard focus moves to the main column.
addEventListener(
  'click',
  (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin === location.origin && u.pathname === location.pathname && u.search === location.search && !u.hash) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);

document.addEventListener('astro:after-swap', () => {
  if (!location.hash) document.getElementById('main')?.focus({ preventScroll: true });
});
