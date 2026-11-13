// The atlas in the browser: list, map, sheet, search, keys. Reads the plate's data from #atlas-data.
import { accentAreas as areasOf, anchorOf as anchorIn } from './atlas-first';
import { answers, backLabel, kindOf, notation, question, rowLabel, sym, symInner, wordOf } from './atlas-words';

const D = JSON.parse(document.getElementById('atlas-data').textContent);
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const byId = (a) => Object.fromEntries(a.map((x) => [x.id, x]));

const PL = D.plate;
// the normal land and borders are already in the map the server drew, so they are not sent twice
PL.land = $('#map .land').getAttribute('d');
PL.borders = $('#map .bord').getAttribute('d');
const SOUND = byId(D.sounds), ACC = byId(D.accents), PLACE = byId(D.dots), AREA = byId(D.areas), SRC = byId(D.sources.map((s) => ({ ...s, id: s.key })));
const FIND = D.findings;
const KORD = ['yes', 'opt0', 'opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'nearly', 'mixed', 'no'];
const FILLS = { yes: 'rgba(226,48,29,.14)', opt0: 'rgba(226,48,29,.14)', nearly: 'rgba(226,48,29,.07)', mixed: 'url(#stripe)', opt1: 'url(#dots)', opt2: 'rgba(226,48,29,.1)', opt3: 'rgba(226,48,29,.1)', opt4: 'rgba(226,48,29,.05)', opt5: 'rgba(226,48,29,.05)' };
const FINE_AT = 2.5; // zoom (times the fitted size) from which the finer coastline is used

const S = { tab: 'accents', sound: null, accent: null, spot: null, filter: '', seg: null, hover: null, ph: 'peek' };
const V = { k: 1, x: 0, y: 0, fit: true, fitK: 1 };
let W = 0, H = 0;
const phone = window.matchMedia('(max-width:759px)');
const other = D.elsewhere;
const baseOf = (id) => `/dialects/${id}/`;

/* ---------- derived access ---------- */
const dsound = (id) => { const d = D.derived.sounds[id]; return d && d.n ? d : null; };
const soundTotal = (id) => (dsound(id) ? dsound(id).n : 0);
const isArea = (id) => !!AREA[id];
const accCount = (id) => D.derived.accents[id].length;
const shownOf = (s, type, id) => { const d = dsound(s.id); return d && d.shown[`${type}:${id}`]; };
const rowExtra = (e, n) => [e.d ? 'sources differ' : e.a ? 'by age' : n > 1 ? `${n} findings` : '', e.dr ? 'draft' : ''].filter(Boolean).join(' · ');

/* ---------- marks for the sound view ---------- */
function marks() {
  const out = { place: {}, area: {}, acc: 0 };
  const snd = SOUND[S.sound]; if (!snd) return out;
  const d = dsound(S.sound); if (!d) return out;
  Object.keys(d.shown).forEach((key) => {
    const [t, id] = key.split(':'), v = d.shown[key].v, k = kindOf(snd, v);
    if (t === 'place') out.place[id] = { v, k };
    else if (t === 'area') out.area[id] = { v, k, label: AREA[id].name };
  });
  Object.keys(d.shown).forEach((key) => {
    const [t, id] = key.split(':');
    if (t !== 'accent') return;
    out.acc++;
    const a = ACC[id]; if (!a || a.tie === 'social') return;
    const v = d.shown[key].v, k = kindOf(snd, v);
    a.wider.forEach((w) => { if (isArea(w) && !out.area[w]) out.area[w] = { v, k, label: a.name }; });
  });
  return out;
}
function placeCounts(m) {
  const c = {}; let n = 0;
  Object.keys(m.place).forEach((id) => { c[m.place[id].k] = (c[m.place[id].k] || 0) + 1; n++; });
  c.none = D.dots.length - n;
  return c;
}

/* ---------- hash ---------- */
function writeHash() {
  const p = [];
  if (S.tab === 'sounds') p.push('tab=sounds');
  if (S.sound) p.push('sound=' + S.sound);
  if (S.accent) p.push('accent=' + S.accent);
  if (S.seg) p.push('seg=' + S.seg);
  if (S.spot) {
    const sp = S.spot;
    p.push('spot=' + (sp.t === 'place' ? 'place:' + sp.id : sp.t === 'area' ? 'area:' + sp.id + '@' + Math.round(sp.x) + ',' + Math.round(sp.y) : 'land:' + Math.round(sp.x) + ',' + Math.round(sp.y)));
  }
  try { history.replaceState(null, '', location.pathname + location.search + (p.length ? '#' + p.join('&') : '')); } catch (e) { /* ignore */ }
}
function readHash() {
  const o = {};
  location.hash.replace(/^#/, '').split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  S.tab = o.tab === 'sounds' ? 'sounds' : 'accents';
  S.sound = SOUND[o.sound] ? o.sound : null;
  S.accent = !S.sound && ACC[o.accent] ? o.accent : null;
  if (S.sound) S.tab = 'sounds'; else if (S.accent) S.tab = 'accents';
  S.seg = o.seg || null;
  S.spot = null;
  if (o.spot) {
    let m;
    if ((m = o.spot.match(/^place:(.+)$/)) && PLACE[m[1]]) S.spot = { t: 'place', id: m[1] };
    else if ((m = o.spot.match(/^area:(.+)@(-?\d+),(-?\d+)$/)) && AREA[m[1]]) S.spot = { t: 'area', id: m[1], x: +m[2], y: +m[3] };
    else if ((m = o.spot.match(/^land:(-?\d+),(-?\d+)$/))) S.spot = { t: 'land', x: +m[1], y: +m[2] };
  }
}

/* ---------- actions ---------- */
function pickSound(id, keepSpot) {
  S.sound = id; S.accent = null; S.tab = 'sounds'; S.seg = null;
  if (!keepSpot) S.spot = null;
  commit(true);
}
function pickAccent(id, keepSpot) {
  const a = ACC[id];
  S.accent = id; S.sound = null; S.tab = 'accents'; S.seg = null;
  if (!keepSpot) S.spot = null;
  commit(true);
  measure(); focusAccent(a);
}
const bboxCache = {};
function bboxOf(id) {
  if (bboxCache[id]) return bboxCache[id];
  const nums = (AREA[id].loop || AREA[id].path).match(/-?\d+\.?\d*/g).map(Number), b = [1e9, 1e9, -1e9, -1e9];
  for (let i = 0; i + 1 < nums.length; i += 2) { b[0] = Math.min(b[0], nums[i]); b[1] = Math.min(b[1], nums[i + 1]); b[2] = Math.max(b[2], nums[i]); b[3] = Math.max(b[3], nums[i + 1]); }
  return (bboxCache[id] = b);
}
let anim = 0;
function animateTo(k, x, y) {
  cancelAnimationFrame(anim);
  const k0 = V.k, x0 = V.x, y0 = V.y, t0 = performance.now();
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) { V.k = k; V.x = x; V.y = y; drawMap(); return; }
  (function step(now) {
    const t = Math.min(1, (now - t0) / 250), e = 1 - Math.pow(1 - t, 3);
    V.k = k0 + (k - k0) * e; V.x = x0 + (x - x0) * e; V.y = y0 + (y - y0) * e; drawMap();
    if (t < 1) anim = requestAnimationFrame(step);
  })(t0);
}
function focusAccent(a) {
  if (!W) return;
  const b = [1e9, 1e9, -1e9, -1e9];
  const add = (x0, y0, x1, y1) => { b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0); b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], y1); };
  a.core.concat(a.wider).forEach((id) => { if (PLACE[id]) add(PLACE[id].x, PLACE[id].y, PLACE[id].x, PLACE[id].y); else if (AREA[id]) { const q = bboxOf(id); add(q[0], q[1], q[2], q[3]); } });
  const bx = fitBox(), fitK = Math.max(0.05, Math.min((W - bx.pad - bx.right) / PL.w, (H - bx.top - bx.bot) / PL.h));
  if (b[0] > 1e8) return;
  const bw = Math.max(b[2] - b[0], 90), bh = Math.max(b[3] - b[1], 90);
  if (bw * fitK >= 0.15 * PL.w * fitK) { if (!V.fit) fitAnimated(); return; }
  V.fitK = fitK;
  const k = Math.max(fitK * 1.6, Math.min(fitK * 4.5, (W * 0.34) / bw, (H * 0.34) / bh));
  V.fit = false;
  animateTo(k, W / 2 - ((b[0] + b[2]) / 2) * k, H / 2 - ((b[1] + b[3]) / 2) * k);
}
function pickSpot(sp) { S.spot = sp; commit(true); }
function clearOne() {
  if (S.spot) S.spot = null;
  else if (S.sound || S.accent) { S.sound = null; S.accent = null; S.seg = null; }
  else return;
  commit();
}
function commit(opened) {
  if (opened && phone.matches && S.ph === 'peek' && (S.sound || S.accent || S.spot)) S.ph = 'half';
  document.body.setAttribute('data-ph', S.ph);
  writeHash();
  renderPlates(); renderList(); renderTitle(); renderKey(); renderSheet(); drawMap();
}

/* ---------- header: the plate links carry the sound over when it has data there ---------- */
function renderPlates() {
  $$('[data-plate]').forEach((a) => {
    const id = a.getAttribute('data-plate'), snd = S.sound && SOUND[S.sound];
    a.setAttribute('href', baseOf(id) + (snd && D.derived.sounds[snd.id].other[id] ? '#tab=sounds&sound=' + snd.id : ''));
  });
}

/* ---------- left list ---------- */
let listOrder = [];
const match = (q, arr) => { q = q.toLowerCase(); return arr.some((x) => x && String(x).toLowerCase().indexOf(q) >= 0); };
const matchSound = (q, s) => match(q, [s.name, s.also, s.words && s.words.join(' '), s.from, s.to, wordOf(s)]);
function renderList() {
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.getAttribute('data-tab') === S.tab));
  const q = S.filter.trim();
  let h = '';
  listOrder = [];
  if (S.tab === 'accents') {
    const groups = [], gm = {};
    D.accents.forEach((a) => {
      if (q && !match(q, [a.name, a.also, a.where, a.group])) return;
      const g = a.group || 'Other accents';
      if (!gm[g]) { gm[g] = []; groups.push(g); }
      gm[g].push(a);
    });
    groups.forEach((g) => {
      h += '<h3>' + esc(g) + '</h3>';
      const arr = gm[g], ordered = [];
      arr.filter((a) => !a.parent || !arr.some((p) => p.id === a.parent)).forEach((a) => {
        ordered.push(a);
        arr.filter((c) => c.parent === a.id).forEach((c) => ordered.push(c));
      });
      ordered.forEach((a) => {
        listOrder.push({ t: 'accent', id: a.id });
        h += '<button type="button" class="row' + (a.parent ? ' child' : '') + '" data-acc="' + a.id + '" data-go="accent:' + a.id + '"' + (S.accent === a.id ? ' aria-current="true"' : '') + '><span class="t">' + esc(a.name) + '</span><span class="n">' + (accCount(a.id) || '') + '</span></button>';
      });
    });
    if (!groups.length) h = '<p class="none">' + (D.accents.length ? 'No accents match.' : 'No accents recorded on this map yet.') + '</p>';
  } else {
    const heads = { pair: 'Do these sound the same?', change: 'Does this change?', options: 'Which is it?' };
    const off = [];
    ['pair', 'change', 'options'].forEach((sc) => {
      let rows = '';
      D.sounds.forEach((s) => {
        if (s.scale !== sc) return;
        if (q && !matchSound(q, s)) return;
        if (!soundTotal(s.id)) { off.push(s); return; }
        listOrder.push({ t: 'sound', id: s.id });
        rows += '<button type="button" class="row" data-go="sound:' + s.id + '"' + (S.sound === s.id ? ' aria-current="true"' : '') + '><span class="t">' + esc(rowLabel(s)) + '</span><span class="n">' + soundTotal(s.id) + '</span></button>';
      });
      if (rows) h += '<h3 class="q">' + heads[sc] + '</h3>' + rows;
    });
    if (off.length) {
      h += '<h3 class="q">Not on this map yet</h3>';
      off.forEach((s) => {
        listOrder.push({ t: 'sound', id: s.id });
        h += '<button type="button" class="row off" data-go="sound:' + s.id + '"' + (S.sound === s.id ? ' aria-current="true"' : '') + '><span class="t">' + esc(rowLabel(s)) + '</span></button>';
      });
    }
    if (!h) h = '<p class="none">No sounds match.</p>';
  }
  $('#list').innerHTML = h;
  const cur = $('#list [aria-current=true]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
}
function stepList(d) {
  if (!listOrder.length) return;
  const cur = S.sound ? 'sound:' + S.sound : S.accent ? 'accent:' + S.accent : '';
  let i = listOrder.findIndex((x) => x.t + ':' + x.id === cur);
  i = i < 0 ? (d > 0 ? 0 : listOrder.length - 1) : (i + d + listOrder.length) % listOrder.length;
  const it = listOrder[i];
  if (it.t === 'sound') pickSound(it.id, true); else pickAccent(it.id, true);
}

/* ---------- title + key ---------- */
function renderTitle() {
  let h, sub;
  const snd = SOUND[S.sound], a = ACC[S.accent];
  if (snd) {
    h = question(snd); sub = esc(snd.name) + (snd.also ? ' · ' + esc(snd.also) : '');
    if (!dsound(snd.id)) sub += '<br>Nothing recorded on this map yet.';
  } else if (a) {
    h = esc(a.name); sub = a.tie === 'social' ? 'Not tied to one place' : esc(a.where);
  } else {
    h = esc(PL.title);
    sub = D.accents.length ? D.accents.length + ' accents · ' + D.dots.length + ' places. Pick one on the left, or click the map.' : D.dots.length + ' places. No accents recorded here yet. Click a place on the map.';
  }
  $('#maptitle').innerHTML = '<h1>' + h + '</h1><p>' + sub + '</p>';
}
function renderKey() {
  const snd = SOUND[S.sound], a = ACC[S.accent];
  let h = '';
  const kr = (kind, text, n, seg) => {
    const inner = sym(kind) + '<span class="t">' + esc(text) + '</span><span class="n">' + n + '</span>';
    return seg ? '<button type="button" class="k' + (n === 0 ? ' zero' : '') + '" data-seg="' + kind + '" aria-pressed="' + (S.seg === kind) + '">' + inner + '</button>' : '<div class="k">' + inner + '</div>';
  };
  if (snd && dsound(snd.id)) {
    const m = marks(), c = placeCounts(m), seen = {};
    answers(snd).forEach((an) => {
      if (seen[an.kind]) return; seen[an.kind] = 1;
      const n = c[an.kind] || 0;
      if (snd.scale === 'options' && an.val === 'mixed' && !n) return;
      h += kr(an.kind, an.text, n, true);
    });
    h += kr('none', 'nothing recorded', c.none || 0, true);
  } else if (a) {
    h += '<div class="k"><span class="sw area" style="background:rgba(226,48,29,.2)"></span><span class="t">' + (a.tie === 'social' ? 'Not tied to one place' : 'Spoken here') + '</span></div>';
    if (a.tie !== 'social') h += '<div class="k"><span class="sw area" style="background:rgba(226,48,29,.08)"></span><span class="t">Also spoken</span></div>';
    h += '<div class="k">' + sym('yes') + '<span class="t">Core place</span></div>';
  } else if (snd) {
    h = '<div class="k"><span class="t">Nothing to show on this map</span></div>';
  } else {
    if (D.accents.length) h += '<div class="k"><span class="sw area"></span><span class="t">Where an accent is heard</span></div>';
    h += '<div class="k">' + sym('none') + '<span class="t">Place</span></div>';
  }
  $('#key').innerHTML = h;
}

/* ---------- sheet ---------- */
function srcFold(fs, inline) {
  const by = {};
  fs.forEach((f) => { by[f.src] = (by[f.src] || 0) + 1; });
  const ids = Object.keys(by).sort();
  if (!ids.length) return '';
  const body = ids.map((s) => '<div><a class="lk" href="/dialects/sources/#' + esc(s) + '">' + esc(SRC[s].short) + '</a><span>' + by[s] + (by[s] === 1 ? ' finding' : ' findings') + ' · ' + esc(SRC[s].years) + '</span></div>').join('');
  return '<details class="fold' + (inline ? ' inline' : '') + '"><summary>' + ids.length + (ids.length === 1 ? ' source' : ' sources') + '</summary><div class="body">' + body + '</div></details>';
}
function topBar(back, label) {
  const l = back ? '<button type="button" class="back" data-act="back">← ' + esc(back) + '</button>' : '<span class="ctx">' + esc(label || PL.name) + '</span>';
  return '<div class="grab-wrap"></div><div class="sh-top">' + l + '<button type="button" class="x" data-act="close" aria-label="Close">×</button></div>';
}
function links(ids, kind) {
  return ids.map((id) => '<button type="button" class="lk" data-go="' + kind + ':' + id + '">' + esc((kind === 'accent' ? ACC[id] : AREA[id]).name) + '</button>').join(', ');
}
function soundRow(s, v, extra, cls) {
  return '<button type="button" class="srow ' + (cls || '') + (S.sound === s.id ? ' pickedrow' : '') + '" data-go="soundkeep:' + s.id + '">' + sym(kindOf(s, v)) + '<span class="t">' + esc(notation(s, v)) + '</span>' + (extra ? '<span class="n">' + esc(extra) + '</span>' : '') + '</button>';
}
const sortRows = (rows) => rows.sort((a, b) => KORD.indexOf(a.k) - KORD.indexOf(b.k) || D.sounds.indexOf(a.s) - D.sounds.indexOf(b.s));
const otherPlateWith = (id) => other.find((p) => D.derived.sounds[id].other[p.id]);

function soundSheet(snd) {
  const d = dsound(snd.id);
  let h = topBar(null, 'Sound');
  if (!d) {
    const o = otherPlateWith(snd.id);
    h += '<p class="empty" style="margin-top:16px">Nothing recorded for this sound on ' + esc(PL.name) + ' yet.</p>';
    if (o) h += '<a class="btn" href="' + baseOf(o.id) + '#tab=sounds&amp;sound=' + snd.id + '">See it on ' + esc(o.name) + ' →</a>';
    h += '<p class="sh-sub sec">' + esc(snd.name) + (snd.also ? ' · ' + esc(snd.also) : '') + '. ' + esc(snd.about) + '</p>';
    return h;
  }
  const m = marks(), c = placeCounts(m), tot = D.dots.length;
  h += '<div class="bar" role="group" aria-label="Share of places">';
  const segs = [];
  answers(snd).forEach((an) => { if (!segs.some((x) => x.k === an.kind)) segs.push({ k: an.kind, t: an.text }); });
  segs.push({ k: 'none', t: 'nothing recorded' });
  segs.forEach((sg) => { const n = c[sg.k] || 0; if (n) h += '<button type="button" class="b-' + sg.k + '" style="flex:' + n + ' 1 0" data-seg="' + sg.k + '" aria-pressed="' + (S.seg === sg.k) + '" aria-label="' + esc(sg.t) + ', ' + n + '"></button>'; });
  h += '</div><div class="sec" style="margin-top:0">';
  segs.forEach((sg) => {
    const n = c[sg.k] || 0;
    if (!n && sg.k !== 'none' && snd.scale === 'options') return;
    h += '<button type="button" class="srow big' + (n ? '' : ' dimmed') + '" data-seg="' + sg.k + '" aria-pressed="' + (S.seg === sg.k) + '">' + sym(sg.k) + '<span class="t">' + esc(sg.t) + '</span><span class="n">' + n + '</span></button>';
  });
  const na = Object.keys(m.area).length;
  h += '</div><p class="note">' + (tot - c.none) + ' of ' + tot + ' places' + (na ? ', ' + na + (na === 1 ? ' area' : ' areas') : '') + (m.acc ? ', ' + m.acc + (m.acc === 1 ? ' accent' : ' accents') : '') + ' have a finding.</p>';
  const byk = {};
  Object.keys(d.shown).forEach((key) => {
    if (key.indexOf('accent:') !== 0) return;
    const k = kindOf(snd, d.shown[key].v);
    (byk[k] = byk[k] || []).push(key.slice(7));
  });
  let lines = '';
  if (snd.scale === 'options') snd.options.forEach((o, i) => { if (byk['opt' + i]) lines += '<p class="sh-line"><span class="mute">' + esc(wordOf(snd) + ', ' + o.label.replace(/^[^,]*,\s*/, '')) + ' in</span> ' + links(byk['opt' + i], 'accent') + '</p>'; });
  else if (byk.yes) lines += '<p class="sh-line"><span class="mute">' + (snd.scale === 'pair' ? 'Sound the same in' : 'Happens in') + '</span> ' + links(byk.yes, 'accent') + '</p>';
  if (lines) h += '<div class="sec">' + lines + '</div>';
  h += '<p class="sh-sub sec">' + esc(snd.name) + (snd.also ? ' · ' + esc(snd.also) : '') + '. ' + esc(snd.about) + '</p>';
  other.forEach((o) => {
    const np = D.derived.sounds[snd.id].other[o.id];
    if (np) h += '<p class="sh-line"><a class="lk" href="' + baseOf(o.id) + '#tab=sounds&amp;sound=' + snd.id + '">Also on ' + esc(o.name) + ': ' + np + (np === 1 ? ' place' : ' places') + ' →</a></p>';
  });
  h += srcFold(FIND.filter((f) => f.f === snd.id));
  return h;
}
function accentSheet(a) {
  let h = topBar(null, 'Accent' + (a.group ? ' · ' + a.group : ''));
  h += '<p class="sh-line" style="margin-top:16px">' + (a.tie === 'social' ? 'Not tied to one place' : esc(a.where)) + '</p>';
  if (a.also && a.also !== a.name) h += '<p class="sh-sub" style="margin-top:4px">Also called ' + esc(a.also) + '</p>';
  const by = {};
  D.derived.accents[a.id].forEach((i) => { const f = FIND[i]; (by[f.f] = by[f.f] || []).push(f); });
  const rows = [];
  D.sounds.forEach((s) => {
    const e = shownOf(s, 'accent', a.id);
    if (e) rows.push({ s, v: e.v, k: kindOf(s, e.v), e });
  });
  sortRows(rows);
  const fpS = D.sounds.filter((s) => dsound(s.id));
  if (fpS.length) {
    h += '<div class="sec"><h4 class="p">One mark per sound, same order for every accent</h4><div class="fp">';
    fpS.forEach((s) => {
      const r = rows.find((x) => x.s === s), k = r ? r.k : 'none';
      h += '<button type="button" data-go="soundkeep:' + s.id + '" data-tip="' + esc(rowLabel(s)) + '|' + esc(r ? notation(s, r.v) : 'nothing recorded') + '" aria-label="' + esc(rowLabel(s)) + '">' + sym(k) + '</button>';
    });
    h += '</div></div>';
  }
  h += '<div class="sec"><h4 class="p">' + rows.length + (rows.length === 1 ? ' sound' : ' sounds') + ' recorded</h4>';
  if (!rows.length) h += '<p class="none" style="padding:0">Nothing recorded yet.</p>';
  rows.forEach((r) => { h += soundRow(r.s, r.v, rowExtra(r.e, by[r.s.id].length)); });
  h += '</div>';
  const kids = D.accents.filter((x) => x.parent === a.id).map((x) => x.id);
  if ((a.parent && ACC[a.parent]) || kids.length) {
    h += '<div class="sec">';
    if (a.parent && ACC[a.parent]) h += '<div class="srow"><span class="mute" style="width:64px">Part of</span><span class="t">' + links([a.parent], 'accent') + '</span></div>';
    if (kids.length) h += '<div class="srow"><span class="mute" style="width:64px">Includes</span><span class="t">' + links(kids, 'accent') + '</span></div>';
    h += '</div>';
  }
  h += srcFold(D.derived.accents[a.id].map((i) => FIND[i]));
  return h;
}
function areasAt(x, y) {
  return D.areas.filter((a) => pathOf(a.id).hit(x, y)).sort((p, q) => p.size - q.size);
}
function spotSheet(sp) {
  const back = S.sound ? backLabel(SOUND[S.sound]) : S.accent ? ACC[S.accent].name : null;
  let h = topBar(back), title, sub = '', sentence = '', groups = '', coreAcc = [], alsoAcc = [];
  const recorded = {}, fs = [];
  const sounds = D.sounds.filter((s) => dsound(s.id));
  const rowsFor = (type, id) => {
    const out = [];
    sounds.forEach((s) => { const e = shownOf(s, type, id); if (e) { recorded[s.id] = 1; out.push({ s, v: e.v, k: kindOf(s, e.v), e }); e.i.forEach((i) => fs.push(FIND[i])); } });
    return sortRows(out);
  };
  const rowHtml = (rows) => rows.map((r) => soundRow(r.s, r.v, rowExtra(r.e, 0))).join('');
  const none = (t) => '<p class="none" style="padding:0">' + t + '</p>';
  const x = sp.x, y = sp.y;
  if (sp.t === 'place') {
    const p = PLACE[sp.id], dd = D.derived.dots[sp.id];
    title = p.name; sub = p.region;
    coreAcc = dd.c; alsoAcc = dd.w;
    const own = rowsFor('place', sp.id);
    groups += '<div class="sec"><h4 class="p">Recorded here</h4>' + (own.length ? rowHtml(own) : none('Nothing recorded for this place.')) + '</div>';
    dd.a.map((id) => AREA[id]).sort((a, b) => a.size - b.size).forEach((ar) => {
      const rr = rowsFor('area', ar.id);
      if (rr.length) groups += '<div class="sec"><h4 class="p">From the area around it (' + esc(ar.name) + ')</h4>' + rowHtml(rr) + '</div>';
    });
  } else {
    let here;
    if (sp.t === 'area') {
      const ar0 = AREA[sp.id]; here = areasAt(x, y); if (!here.some((a) => a.id === ar0.id)) here.unshift(ar0);
      title = ar0.name; sub = ar0.edge === 'exact' ? 'Exact area' : 'Rough area, drawn by hand';
      coreAcc = D.accents.filter((a) => a.wider.indexOf(ar0.id) >= 0 || a.core.indexOf(ar0.id) >= 0).map((a) => a.id);
      const rr0 = rowsFor('area', ar0.id);
      groups += '<div class="sec"><h4 class="p">Recorded for this area</h4>' + (rr0.length ? rowHtml(rr0) : none('Nothing recorded for this area.')) + '</div>';
      const others = here.filter((a) => a.id !== ar0.id);
      if (others.length) groups += '<div class="sec"><h4 class="p">Also here, smallest first</h4><div class="sh-line">' + links(others.map((a) => a.id), 'area') + '</div></div>';
    } else {
      here = areasAt(x, y);
      let near = null, bd = 1e9;
      D.dots.forEach((q) => { const dist = Math.hypot(q.x - x, q.y - y); if (dist < bd) { bd = dist; near = q; } });
      title = near ? 'Near ' + near.name : 'Here'; sub = 'Nothing recorded at this spot';
      groups += here.length ? '<div class="sec"><h4 class="p">Areas here, smallest first</h4>' + here.map((a) => '<button type="button" class="srow" data-go="spot:area:' + a.id + '@' + Math.round(x) + ',' + Math.round(y) + '"><span class="t">' + esc(a.name) + '</span><span class="n">' + (a.edge === 'exact' ? 'exact' : 'rough') + '</span></button>').join('') + '</div>' : '';
    }
  }
  const accLinks = (ids) => ids.map((id) => '<button type="button" class="lk" data-go="accentkeep:' + id + '">' + esc(ACC[id].name) + '</button>').join(', ');
  if (sp.t === 'place') {
    if (coreAcc.length) sentence = accLinks(coreAcc) + ' ' + (coreAcc.length > 1 ? 'are' : 'is') + ' spoken here.';
    if (alsoAcc.length) sentence += (sentence ? ' ' : '') + 'Also heard: ' + accLinks(alsoAcc) + '.';
    if (!sentence) sentence = 'No accent recorded here.';
  } else if (coreAcc.length) sentence = accLinks(coreAcc) + ' ' + (coreAcc.length > 1 ? 'are' : 'is') + ' spoken in this area.';
  else if (sp.t === 'land') sentence = 'No accent recorded here.';
  h += '<h2 class="sh-h">' + esc(title) + '</h2><p class="sh-sub">' + esc(sub) + '</p>' + (sentence ? '<p class="sh-line">' + sentence + '</p>' : '') + groups;
  if (sp.t !== 'land') {
    const rest = sounds.filter((s) => !recorded[s.id]);
    if (rest.length) h += '<details class="fold"><summary>' + rest.length + ' other ' + (rest.length === 1 ? 'sound' : 'sounds') + ': nothing recorded yet</summary><div class="body">' + rest.map((s) => '<div><span>' + esc(rowLabel(s)) + '</span></div>').join('') + '</div></details>';
    h += srcFold(fs, !!rest.length);
  }
  return h;
}
let lastSheetKey = '';
const sheetKey = () => [S.sound, S.accent, S.spot && S.spot.t + (S.spot.id || '')].join('|');
function renderSheet() {
  const sh = $('#sheet'), snd = SOUND[S.sound], a = ACC[S.accent];
  let h = '';
  if (S.spot) h = spotSheet(S.spot);
  else if (snd) h = soundSheet(snd);
  else if (a) h = accentSheet(a);
  sh.hidden = !h;
  $('#main').classList.toggle('has-sheet', !!h);
  if (h) {
    h = h.replace('<div class="grab-wrap"></div>', '<button class="grab" type="button" aria-label="Resize panel"><span></span></button>');
    const keep = sh.scrollTop; sh.innerHTML = h; sh.scrollTop = sheetKey() === lastSheetKey ? keep : 0; lastSheetKey = sheetKey();
  } else { sh.innerHTML = ''; lastSheetKey = ''; }
}

/* ---------- map ---------- */
const svg = $('#map'), mapEl = $('#mapwrap');
const pathCache = {};
const cv = document.createElement('canvas').getContext('2d');
function pathOf(id) {
  if (pathCache[id]) return pathCache[id];
  const p = id === 'land' ? new Path2D(PL.land) : id.indexOf('loop:') === 0 ? new Path2D(AREA[id.slice(5)].loop || AREA[id.slice(5)].path) : new Path2D(AREA[id].path);
  return (pathCache[id] = { hit: (x, y) => cv.isPointInPath(p, x, y, 'evenodd') });
}
const textCache = {};
function tw(text, size, weight) {
  const key = text + size + weight;
  if (textCache[key] != null) return textCache[key];
  cv.font = weight + ' ' + size + 'px "Hanken Grotesk Variable", "Hanken Grotesk", sans-serif';
  return (textCache[key] = cv.measureText(text).width);
}
const sx = (x) => x * V.k + V.x;
const sy = (y) => y * V.k + V.y;
let visibleAreas = [];

const accentAreas = (a) => areasOf(AREA, a);
const anchorOf = (a) => anchorIn(AREA, a);

function drawMap() {
  if (!W) return;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const snd = SOUND[S.sound], acc = ACC[S.accent], zoomed = V.k >= V.fitK * 3.5, fine = V.k >= V.fitK * FINE_AT;
  const inv = 1 / V.k;
  let defs = '', fills = '', ols = '', ticks = '', labels = [];
  const dots = [];
  defs += '<pattern id="stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45) scale(' + inv + ')"><line x1="0" y1="0" x2="0" y2="6" stroke="#e2301d" stroke-width="1.3"/></pattern>';
  defs += '<pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="scale(' + inv + ')"><circle cx="3" cy="3" r="1" fill="#e2301d"/></pattern>';
  visibleAreas = [];
  const areas = D.areas.filter((a) => !a.closeup || zoomed || (acc && acc.wider.indexOf(a.id) >= 0)).sort((a, b) => b.size - a.size);
  const outline = (a, cls) => '<path class="ol ' + cls + '" d="' + (a.loop || a.path) + '"/>';
  const mk = snd && dsound(snd.id) ? marks() : null;
  const dimOf = (k) => (S.seg && S.seg !== k ? ' dim' : '');
  const named = {}; // areas that already carry an accent name (first-open view)
  if (!snd && !acc) {
    D.accents.forEach((a) => {
      if (a.tie === 'social') return;
      const id = anchorOf(a);
      if (!id || !areas.some((x) => x.id === id)) return;
      named[id] = 1;
      labels.push({ text: a.name, x: sx(AREA[id].x), y: sy(AREA[id].y), cls: 'lbl', pr: 70 - Math.log(AREA[id].size + 1), must: true });
    });
  }
  areas.forEach((a) => {
    if (mk) {
      const m = mk.area[a.id]; if (!m) return;
      visibleAreas.push(a.id);
      const dim = dimOf(m.k);
      if (FILLS[m.k]) fills += '<path class="fl' + dim + '" d="' + a.path + '" fill="' + FILLS[m.k] + '"/>';
      ols += outline(a, (m.k === 'no' ? 'no' : '') + (dim.trim() ? ' dim' : ''));
      if (m.k === 'yes' || m.k === 'opt0') {
        defs += '<clipPath id="cp-' + a.id + '"><path d="' + (a.loop || a.path) + '"/></clipPath>';
        ticks += '<path class="tick' + dim + '" d="' + (a.loop || a.path) + '" clip-path="url(#cp-' + a.id + ')"/>';
      }
      labels.push({ text: m.label, x: sx(a.x), y: sy(a.y), cls: 'lbl' + (S.seg && S.seg !== m.k ? ' faint' : ''), pr: 80 - Math.log(a.size + 1) });
    } else if (acc) {
      if (acc.wider.indexOf(a.id) >= 0 || acc.core.indexOf(a.id) >= 0) {
        visibleAreas.push(a.id);
        if (acc.tie === 'social') ols += outline(a, 'dotted');
        else {
          fills += '<path class="fl" d="' + a.path + '" fill="rgba(226,48,29,' + (acc.core.indexOf(a.id) >= 0 ? '.22' : '.1') + ')"/>';
          ols += outline(a, '');
        }
        labels.push({ text: a.name, x: sx(a.x), y: sy(a.y), cls: 'lbl', pr: 80 });
      } else if (D.accents.some((x) => x.wider.indexOf(a.id) >= 0 || x.core.indexOf(a.id) >= 0)) {
        ols += outline(a, 'faint'); visibleAreas.push(a.id);
      }
    } else if (!snd) {
      if (!D.accents.some((x) => x.tie !== 'social' && accentAreas(x).indexOf(a.id) >= 0)) return;
      visibleAreas.push(a.id);
      ols += outline(a, 'thin');
      if (!named[a.id]) labels.push({ text: a.name, x: sx(a.x), y: sy(a.y), cls: 'lbl faint', pr: 60 - Math.log(a.size + 1), must: true });
    }
  });
  const hotIds = {};
  if (S.hover && S.hover.t === 'place') hotIds[S.hover.id] = 1;
  if (S.spot && S.spot.t === 'place') hotIds[S.spot.id] = 1;
  let dotsHtml = '';
  D.dots.forEach((p) => {
    let kind = 'none', dim = '';
    if (mk) { const m = mk.place[p.id]; if (m) { kind = m.k; dim = dimOf(m.k); } else dim = S.seg && S.seg !== 'none' ? ' dim' : ''; }
    else if (acc && acc.core.indexOf(p.id) >= 0) kind = 'yes';
    const px = sx(p.x), py = sy(p.y);
    if (px < -20 || py < -20 || px > W + 20 || py > H + 20) return;
    if (kind !== 'none' || hotIds[p.id]) dots.push({ x: px, y: py });
    dotsHtml += '<g class="dotg' + dim + '" tabindex="0" role="button" data-place="' + p.id + '" aria-label="' + esc(p.name) + '" transform="translate(' + px.toFixed(1) + ' ' + py.toFixed(1) + ')"><circle class="fr" r="9"/><g transform="scale(' + (kind === 'none' ? 1 : 1.1) + ') translate(-6 -6)">' + symInner(kind) + '</g></g>';
    const pr = p.rank === 1 ? 50 : p.rank === 2 ? 30 : 20;
    const show = p.rank === 1 || (p.rank === 2 && V.k >= V.fitK * 1.6) || (p.rank === 3 && V.k >= V.fitK * 2.6) || hotIds[p.id] || (acc && acc.core.indexOf(p.id) >= 0);
    if (show) labels.push({ text: p.name, x: px, y: py, cls: 'city r' + p.rank + (hotIds[p.id] ? ' hot' : ''), pr: hotIds[p.id] ? 100 : pr, city: true });
  });
  if (V.k < V.fitK * 2.2) PL.nations.forEach((n) => labels.push({ text: n.text, x: sx(n.x), y: sy(n.y), cls: 'nation', pr: 5, nation: true }));
  const areaTexts = {};
  labels.forEach((l) => { if (l.cls.indexOf('lbl') === 0) areaTexts[l.text.toLowerCase()] = 1; });
  labels = labels.filter((l) => !(l.city && areaTexts[l.text.toLowerCase()]));
  const placed = dots.map((d) => ({ x0: d.x - 6, x1: d.x + 6, y0: d.y - 6, y1: d.y + 6 }));
  const clashes = (r, l) => placed.filter((p) => { const self = l.city && Math.abs((p.x0 + p.x1) / 2 - l.x) < 1 && Math.abs((p.y0 + p.y1) / 2 - l.y) < 1; return !self && !(r.x1 < p.x0 || r.x0 > p.x1 || r.y1 < p.y0 || r.y0 > p.y1); }).length;
  labels.sort((a, b) => b.pr - a.pr);
  if (snd || acc) { const seen = {}; labels = labels.filter((l) => { if (l.cls.indexOf('lbl') !== 0) return true; if (seen[l.text]) return false; seen[l.text] = 1; return true; }); }
  let lhtml = '';
  labels.forEach((l) => {
    if (l.x < -50 || l.y < -20 || l.x > W + 50 || l.y > H + 20) return;
    if (l.nation) {
      const nwid = tw(l.text, 10, 500) + l.text.length * 2;
      let hide = false;
      for (let q = 0; q <= 8 && !hide; q++) {
        const qx = (l.x - nwid / 2 + (nwid * q) / 8 - V.x) / V.k, qy1 = (l.y - 6 - V.y) / V.k, qy2 = (l.y + 6 - V.y) / V.k;
        visibleAreas.forEach((id) => { if (!hide && (pathOf('loop:' + id).hit(qx, qy1) || pathOf('loop:' + id).hit(qx, qy2))) hide = true; });
      }
      if (hide) return;
    }
    const wt = l.nation ? 10 : 11, wgt = l.cls.indexOf('lbl') === 0 ? 700 : 500;
    const w = tw(l.text, wt, wgt) + (l.nation ? l.text.length * 2 : 0);
    const cands = [];
    if (l.city) cands.push([l.x + (l.cls.indexOf('hot') >= 0 ? 11 : 8), 0], [l.x - 8 - w, 0]);
    else if (l.nation) cands.push([l.x - w / 2, 0]);
    else (l.must ? [0, -12, 12, -24, 24, -36, 36] : [0, -12, 12, -24, 24]).forEach((dy) => cands.push([l.x - w / 2, dy]));
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const x0 = cands[i][0], ly = l.y + cands[i][1], r = { x0: x0 - 2, x1: x0 + w + 2, y0: ly - 8, y1: ly + 6 };
      const bad = clashes(r, l);
      if (bad && l.must) { if (!best || bad < best.bad) best = { x0, ly, r, bad }; continue; }
      if (bad) continue;
      best = { x0, ly, r, bad: 0 }; break;
    }
    if (!best) return;
    const { x0, ly, r } = best;
    placed.push(r);
    if (l.nation) lhtml += '<text class="nation" x="' + (x0 + w / 2).toFixed(1) + '" y="' + (ly + 3).toFixed(1) + '">' + esc(l.text) + '</text>';
    else if (l.city) lhtml += '<text class="' + l.cls + '" x="' + x0.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '">' + esc(l.text) + '</text>';
    else lhtml += '<text class="' + l.cls + '" x="' + (x0 + w / 2).toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '">' + esc(l.text) + '</text>';
  });
  const tf = 'matrix(' + V.k + ' 0 0 ' + V.k + ' ' + V.x + ' ' + V.y + ')';
  svg.innerHTML = '<defs>' + defs + '</defs><g transform="' + tf + '"><path class="land" d="' + (fine ? PL.landFine : PL.land) + '"/><path class="bord" d="' + (fine ? PL.bordersFine : PL.borders) + '"/>' + fills + ticks + ols + '<g id="hlw"></g></g><g id="over">' + lhtml + dotsHtml + '<g id="hlo"></g></g>';
  drawHL(); scaleBar();
}
function drawHL() {
  const w = $('#hlw'), o = $('#hlo'); if (!w) return;
  let hw = '', ho = '';
  const add = (t, id, pin) => {
    if (t === 'place') { const p = PLACE[id]; if (p) ho += '<circle class="ring' + (pin ? ' pin' : '') + '" r="9" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '"/>'; }
    else if (t === 'area') { const a = AREA[id]; if (a) hw += '<path class="ol hover" d="' + (a.loop || a.path) + '"/>'; }
    else if (t === 'accent') { const ac = ACC[id]; if (!ac) return; ac.core.forEach((c) => { if (PLACE[c]) add('place', c); else if (AREA[c]) add('area', c); }); ac.wider.forEach((c) => { if (AREA[c]) add('area', c); }); }
  };
  if (S.hover) add(S.hover.t, S.hover.id);
  if (S.spot) {
    if (S.spot.t === 'place') add('place', S.spot.id, true);
    else if (S.spot.t === 'area') { const a = AREA[S.spot.id]; hw += '<path class="ol hover" d="' + (a.loop || a.path) + '"/>'; ho += '<circle class="ring pin" r="4" cx="' + sx(S.spot.x).toFixed(1) + '" cy="' + sy(S.spot.y).toFixed(1) + '"/>'; }
    else ho += '<circle class="ring pin" r="4" cx="' + sx(S.spot.x).toFixed(1) + '" cy="' + sy(S.spot.y).toFixed(1) + '"/>';
  }
  w.innerHTML = hw; o.innerHTML = ho;
}
function scaleBar() {
  let best = null;
  [10, 20, 50, 100, 200, 500, 1000, 2000].forEach((n) => { const px = (n / PL.km) * V.k; if (px <= 120) best = { n, px }; });
  $('#scalebar').innerHTML = best ? '<i style="width:' + best.px.toFixed(0) + 'px"></i>' + best.n + ' km' : '';
}

/* view */
function measure() { const r = mapEl.getBoundingClientRect(); W = Math.round(r.width); H = Math.round(r.height); }
function fitBox() {
  const pad = phone.matches ? 12 : 24;
  let top = pad, bot = pad, right = pad;
  if (phone.matches) {
    const t = $('#maptitle'), k = $('#key'), z = $('.zoom');
    top = Math.max(pad, t.offsetTop + t.offsetHeight + 4);
    bot = Math.max(pad, k.offsetHeight ? k.offsetHeight + 16 : pad);
    right = z.offsetWidth + 16;
  }
  return { pad, top, bot, right };
}
function fitView() {
  const b = fitBox(), aw = W - b.pad - b.right, ah = H - b.top - b.bot;
  V.fitK = Math.max(0.05, Math.min(aw / PL.w, ah / PL.h));
  V.k = V.fitK; V.x = b.pad + (aw - PL.w * V.k) / 2; V.y = b.top + (ah - PL.h * V.k) / 2; V.fit = true;
}
function fitAnimated() {
  cancelAnimationFrame(anim);
  measure();
  const k = V.k, x = V.x, y = V.y;
  fitView();
  const fk = V.k, fx = V.x, fy = V.y;
  V.k = k; V.x = x; V.y = y; V.fit = true;
  animateTo(fk, fx, fy);
}
function onResize() {
  const oldW = W, oldH = H, cxw = (oldW / 2 - V.x) / V.k, cyw = (oldH / 2 - V.y) / V.k;
  measure(); if (!W || !H) return;
  const pad = phone.matches ? 12 : 24;
  if (V.fit || !oldW) fitView();
  else { V.fitK = Math.max(0.05, Math.min((W - 2 * pad) / PL.w, (H - 2 * pad) / PL.h)); V.k = Math.max(V.k, V.fitK); V.x = W / 2 - cxw * V.k; V.y = H / 2 - cyw * V.k; }
  drawMap();
}
function zoomAt(f, px, py) {
  const nk = Math.min(V.fitK * 16, Math.max(V.fitK, V.k * f));
  if (nk === V.k) return;
  const wx = (px - V.x) / V.k, wy = (py - V.y) / V.k;
  V.k = nk; V.x = px - wx * nk; V.y = py - wy * nk; V.fit = nk <= V.fitK * 1.001;
  if (V.fit) fitView();
  drawMap();
}
function clampPan() {
  V.x = Math.min(W - 80, Math.max(80 - PL.w * V.k, V.x));
  V.y = Math.min(H - 80, Math.max(80 - PL.h * V.k, V.y));
}

/* hit test */
function hitAt(px, py, forHover) {
  const wx = (px - V.x) / V.k, wy = (py - V.y) / V.k;
  let best = null, bd = 14;
  D.dots.forEach((p) => { const d = Math.hypot(sx(p.x) - px, sy(p.y) - py); if (d <= bd) { bd = d; best = p; } });
  if (best) return { t: 'place', id: best.id };
  const zoomed = V.k >= V.fitK * 3.5;
  const as = D.areas.filter((a) => (!a.closeup || zoomed) && (!forHover || visibleAreas.indexOf(a.id) >= 0)).filter((a) => pathOf(a.id).hit(wx, wy)).sort((a, b) => a.size - b.size);
  if (as.length) return { t: 'area', id: as[0].id, x: wx, y: wy };
  if (forHover) return null;
  if (pathOf('land').hit(wx, wy)) return { t: 'land', x: wx, y: wy };
  return null;
}
function tagHtml(hit) {
  const snd = SOUND[S.sound];
  let name, line = '';
  const ansFor = (type, id) => {
    if (!snd) return '';
    const e = shownOf(snd, type, id);
    return e ? '<span class="a">' + sym(kindOf(snd, e.v)) + esc(notation(snd, e.v)) + '</span>' : '<span class="mute">nothing recorded</span>';
  };
  if (hit.t === 'place') {
    const p = PLACE[hit.id]; name = p.name;
    if (snd) line = ansFor('place', p.id);
    else { const core = D.derived.dots[p.id].c; line = '<span class="mute">' + esc(core.length ? core.map((i) => ACC[i].name).join(', ') : p.region) + '</span>'; }
  } else {
    const a = AREA[hit.id]; name = a.name;
    if (snd) line = ansFor('area', a.id);
    else { const us = D.accents.filter((x) => x.wider.indexOf(a.id) >= 0 || x.core.indexOf(a.id) >= 0); line = '<span class="mute">' + esc(us.length ? us.map((x) => x.name).join(', ') : 'Area') + '</span>'; }
  }
  return '<b>' + esc(name) + '</b>' + line;
}
const tag = $('#tag');
function showTag(html, e) {
  tag.innerHTML = html; tag.hidden = false;
  let x = e.clientX + 14, y = e.clientY + 14;
  const r = tag.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
  tag.style.left = x + 'px'; tag.style.top = y + 'px';
}
const hideTag = () => { tag.hidden = true; };

/* pointer */
const pts = {};
let drag = null, pinch = null, raf = 0;
svg.addEventListener('pointerdown', (e) => {
  const r = mapEl.getBoundingClientRect();
  pts[e.pointerId] = { x: e.clientX - r.left, y: e.clientY - r.top };
  try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
  const ids = Object.keys(pts);
  if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y, moved: false };
  else if (ids.length === 2) { const a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; if (drag) drag.moved = true; }
});
svg.addEventListener('pointermove', (e) => {
  const r = mapEl.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (pts[e.pointerId]) {
    pts[e.pointerId] = { x: px, y: py };
    const ids = Object.keys(pts);
    if (ids.length === 2 && pinch) {
      const a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; svg.classList.add('drag'); hideTag(); }
      if (drag.moved) { V.x = drag.vx + dx; V.y = drag.vy + dy; V.fit = false; clampPan(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawMap(); }); }
      return;
    }
  }
  if (e.pointerType !== 'mouse') return;
  const hit = hitAt(px, py, true), key = hit ? hit.t + hit.id : '';
  const cur = S.hover ? S.hover.t + S.hover.id : '';
  if (key !== cur) { S.hover = hit ? { t: hit.t, id: hit.id } : null; drawHL(); markListHover(); drawMapLabelsHot(); }
  if (hit) showTag(tagHtml(hit), e); else hideTag();
});
function drawMapLabelsHot() { // hovered small cities get their name
  const need = S.hover && S.hover.t === 'place' && !$('#over .city.hot');
  if (need || (!S.hover && $('#over .city.hot') && !(S.spot && S.spot.t === 'place'))) drawMap();
}
function endPointer(e) {
  const r = mapEl.getBoundingClientRect(), moved = drag && drag.moved;
  delete pts[e.pointerId];
  if (Object.keys(pts).length < 2) pinch = null;
  svg.classList.remove('drag');
  if (e.type === 'pointerup' && drag && !moved && Object.keys(pts).length === 0) {
    const hit = hitAt(e.clientX - r.left, e.clientY - r.top, false);
    if (!hit) { S.hover = null; hideTag(); clearAll(); }
    else if (hit.t === 'place') { S.spot = { t: 'place', id: hit.id }; commit(true); }
    else { S.spot = hit.t === 'area' ? { t: 'area', id: hit.id, x: hit.x, y: hit.y } : { t: 'land', x: hit.x, y: hit.y }; commit(true); }
  }
  if (Object.keys(pts).length === 0) drag = null;
}
function clearAll() { S.spot = null; S.sound = null; S.accent = null; S.seg = null; commit(); }
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) { S.hover = null; hideTag(); drawHL(); markListHover(); } });
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = mapEl.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
svg.addEventListener('keydown', (e) => {
  const g = e.target.closest && e.target.closest('.dotg');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickSpot({ t: 'place', id: g.getAttribute('data-place') }); }
});
svg.addEventListener('dblclick', (e) => { const r = mapEl.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top); });
$('#zin').onclick = () => zoomAt(1.6, W / 2, H / 2);
$('#zout').onclick = () => zoomAt(1 / 1.6, W / 2, H / 2);
$('#zfit').onclick = fitAnimated;

/* list hover -> map */
function markListHover() {
  const set = {};
  if (S.hover) {
    if (S.hover.t === 'accent') set[S.hover.id] = 1;
    else if (S.hover.t === 'place') { const dd = D.derived.dots[S.hover.id]; dd.c.concat(dd.w).forEach((i) => { set[i] = 1; }); }
    else D.accents.forEach((a) => { if (a.wider.indexOf(S.hover.id) >= 0 || a.core.indexOf(S.hover.id) >= 0) set[a.id] = 1; });
  }
  $$('#list .row[data-acc]').forEach((r) => r.classList.toggle('hl', !!set[r.getAttribute('data-acc')] && !(S.hover && S.hover.t === 'accent')));
}
$('#list').addEventListener('mouseover', (e) => {
  const r = e.target.closest('.row[data-acc]');
  const id = r ? r.getAttribute('data-acc') : null;
  const cur = S.hover && S.hover.t === 'accent' ? S.hover.id : null;
  if (id === cur) return;
  S.hover = id ? { t: 'accent', id } : null; drawHL();
  if (!id) { hideTag(); return; }
  const a = ACC[id], mr = mapEl.getBoundingClientRect();
  const c0 = a.core.find((c) => PLACE[c]), w0 = a.wider.find((c) => AREA[c]) || a.core.find((c) => AREA[c]);
  const pos = c0 ? [sx(PLACE[c0].x), sy(PLACE[c0].y)] : w0 ? [sx(AREA[w0].x), sy(AREA[w0].y)] : null;
  if (!pos || pos[0] < 0 || pos[1] < 0 || pos[0] > W || pos[1] > H) { hideTag(); return; }
  showTag('<b>' + esc(a.name) + '</b><span class="mute">' + esc(a.tie === 'social' ? 'Not tied to one place' : a.where) + '</span>', { clientX: mr.left + pos[0], clientY: mr.top + pos[1] });
});
$('#list').addEventListener('mouseleave', () => { if (S.hover && S.hover.t === 'accent') { S.hover = null; drawHL(); hideTag(); } });

/* delegated clicks */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go],[data-act],[data-seg],[data-tab]');
  if (!t) { if (!e.target.closest('.search')) $('#results').hidden = true; return; }
  if (t.hasAttribute('data-tab')) { S.tab = t.getAttribute('data-tab'); S.filter = ''; $('#filter').value = ''; renderList(); writeHash(); return; }
  if (t.hasAttribute('data-seg')) { const k = t.getAttribute('data-seg'); S.seg = S.seg === k ? null : k; writeHash(); renderKey(); renderSheet(); drawMap(); return; }
  const act = t.getAttribute('data-act');
  if (act === 'close') { clearOne(); return; }
  if (act === 'back') { S.spot = null; commit(); return; }
  const go = t.getAttribute('data-go'), i = go.indexOf(':'), kind = go.slice(0, i), id = go.slice(i + 1);
  hideTag();
  if (kind === 'sound') pickSound(id, false);
  else if (kind === 'soundkeep') pickSound(id, !!S.spot);
  else if (kind === 'accent') pickAccent(id, false);
  else if (kind === 'accentkeep') pickAccent(id, !!S.spot);
  else if (kind === 'area') { const a = AREA[id]; pickSpot({ t: 'area', id, x: a.x, y: a.y }); }
  else if (kind === 'spot') { const m = id.match(/^area:(.+)@(-?\d+),(-?\d+)$/); if (m) pickSpot({ t: 'area', id: m[1], x: +m[2], y: +m[3] }); }
});
$('#filter').addEventListener('input', (e) => { S.filter = e.target.value; renderList(); });

/* tips for the fingerprint */
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { if (!S.hover) hideTag(); return; }
  const p = t.getAttribute('data-tip').split('|');
  tag.innerHTML = '<b>' + esc(p[0]) + '</b><span class="mute">' + esc(p[1]) + '</span>'; tag.hidden = false;
  const r = t.getBoundingClientRect(), tr = tag.getBoundingClientRect();
  tag.style.left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + 'px'; tag.style.top = (r.bottom + 4) + 'px';
});
document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hideTag(); });

/* search: this plate, then the other plates (their results open that page) */
const qEl = $('#q'), resEl = $('#results');
let resSel = -1;
function search(q) {
  q = q.trim(); if (!q) { resEl.hidden = true; return; }
  const away = (o) => ({ accents: o.accents.filter((a) => match(q, [a[1], a[2]])).slice(0, 3), places: o.places.filter((p) => match(q, [p[1]])).slice(0, 3), o });
  const groups = [
    ['Accents', D.accents.filter((a) => match(q, [a.name, a.also])).slice(0, 6).map((a) => ({ go: 'accent:' + a.id, t: a.name, n: a.group })).concat(other.flatMap((o) => away(o).accents.map((a) => ({ go: 'far:' + o.id + ':accent:' + a[0], t: a[1], n: o.name }))))],
    ['Sounds', D.sounds.filter((s) => matchSound(q, s)).slice(0, 6).map((s) => ({ go: 'sound:' + s.id, t: rowLabel(s), n: '' }))],
    ['Places', D.dots.filter((p) => match(q, [p.name])).slice(0, 6).map((p) => ({ go: 'place:' + p.id, t: p.name, n: p.region })).concat(other.flatMap((o) => away(o).places.map((p) => ({ go: 'far:' + o.id + ':place:' + p[0], t: p[1], n: o.name }))))],
  ];
  let h = '';
  groups.forEach((g) => { if (g[1].length) { h += '<h4>' + g[0] + '</h4>'; g[1].forEach((r) => { h += '<button type="button" data-r="' + esc(r.go) + '"><span>' + esc(r.t) + '</span><span class="n">' + esc(r.n) + '</span></button>'; }); } });
  resEl.innerHTML = h || '<p>Nothing found.</p>'; resEl.hidden = false; resSel = -1;
}
function chooseResult(go) {
  const i = go.indexOf(':'), kind = go.slice(0, i), id = go.slice(i + 1);
  resEl.hidden = true; qEl.value = ''; qEl.blur();
  if (kind === 'accent') pickAccent(id);
  else if (kind === 'sound') pickSound(id);
  else if (kind === 'far') { const [pl, what, thing] = id.split(':'); location.href = baseOf(pl) + (what === 'accent' ? '#accent=' + thing : '#spot=place:' + thing); }
  else { S.spot = { t: 'place', id }; commit(true); }
}
qEl.addEventListener('input', () => search(qEl.value));
qEl.addEventListener('focus', () => { if (qEl.value) search(qEl.value); });
qEl.addEventListener('keydown', (e) => {
  const bs = $$('button', resEl);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!bs.length) return; resSel = (resSel + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length; bs.forEach((b, i) => b.classList.toggle('on', i === resSel)); }
  else if (e.key === 'Enter' && bs.length) { chooseResult(bs[Math.max(0, resSel)].getAttribute('data-r')); }
  else if (e.key === 'Escape') { qEl.value = ''; resEl.hidden = true; qEl.blur(); e.stopPropagation(); }
});
resEl.addEventListener('mousedown', (e) => { const b = e.target.closest('button'); if (b) { e.preventDefault(); chooseResult(b.getAttribute('data-r')); } });

/* keys */
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (e.key === 'Escape') { if (typing) { document.activeElement.blur(); return; } clearOne(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); qEl.focus(); }
  else if (e.key === '[') stepList(-1);
  else if (e.key === ']') stepList(1);
  else if (e.key === '+' || e.key === '=') zoomAt(1.6, W / 2, H / 2);
  else if (e.key === '-') zoomAt(1 / 1.6, W / 2, H / 2);
});

/* phone panel */
const PH = ['peek', 'half', 'full'];
document.addEventListener('click', (e) => {
  const g = e.target.closest('.grab'); if (!g || g._dragged) { if (g) g._dragged = false; return; }
  S.ph = PH[(PH.indexOf(S.ph) + 1) % 3]; document.body.setAttribute('data-ph', S.ph);
});
let gdrag = null;
document.addEventListener('pointerdown', (e) => { const g = e.target.closest('.grab'); if (g && phone.matches) gdrag = { y: e.clientY, g }; });
document.addEventListener('pointerup', (e) => {
  if (!gdrag) return;
  const dy = e.clientY - gdrag.y, g = gdrag.g; gdrag = null;
  if (Math.abs(dy) < 24) return;
  g._dragged = true;
  let i = PH.indexOf(S.ph); i = Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1))); S.ph = PH[i]; document.body.setAttribute('data-ph', S.ph);
});

/* start */
function start() {
  try { localStorage.setItem('dialects-plate', PL.id); } catch (e) { /* private mode */ }
  document.body.classList.add('js');
  readHash();
  if (phone.matches && (S.sound || S.accent || S.spot)) S.ph = 'half';
  renderPlates(); renderList(); renderTitle(); renderKey(); renderSheet();
  document.body.setAttribute('data-ph', S.ph);
  measure(); fitView(); drawMap();
  if (S.accent) focusAccent(ACC[S.accent]);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(mapEl);
  window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Object.keys(textCache).forEach((k) => delete textCache[k]); drawMap(); });
}
window.addEventListener('hashchange', () => { readHash(); commit(); measure(); fitView(); drawMap(); if (S.accent) focusAccent(ACC[S.accent]); });
start();
