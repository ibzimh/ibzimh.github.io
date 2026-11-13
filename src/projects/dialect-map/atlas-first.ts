// What a plate shows on first open, worked out for the server-rendered map (and shared with the browser script).
import type { Atlas } from './atlas';

type AtlasArea = Atlas['areas'][number];
type AtlasAccent = Atlas['accents'][number];

/** The areas an accent covers, core first. */
export const accentAreas = (areas: Record<string, AtlasArea>, a: AtlasAccent): string[] =>
  a.core.concat(a.wider).filter((id, i, l) => areas[id] && l.indexOf(id) === i);

/** Where an accent's name sits: the smallest area it covers. */
export const anchorOf = (areas: Record<string, AtlasArea>, a: AtlasAccent): string | undefined =>
  accentAreas(areas, a).sort((p, q) => areas[p].size - areas[q].size)[0];

export interface FirstView {
  outlines: string[];
  labels: { text: string; x: number; y: number; cls: string }[];
}

const wide = (text: string, bold: boolean) => text.length * (bold ? 6.4 : 5.8);

/** Outlines and names for the nothing-picked view. `k` is roughly how many pixels one map unit is on screen. */
export function firstView(a: Atlas, k: number): FirstView {
  const areas = Object.fromEntries(a.areas.map((x) => [x.id, x]));
  const shown = a.areas.filter((x) => !x.closeup && a.accents.some((c) => c.tie !== 'social' && accentAreas(areas, c).includes(x.id)));
  const wanted: { text: string; x: number; y: number; cls: string; must: boolean; pr: number }[] = [];
  const named = new Set<string>();
  for (const c of a.accents) {
    if (c.tie === 'social') continue;
    const id = anchorOf(areas, c);
    if (!id || !shown.some((x) => x.id === id)) continue;
    named.add(id);
    wanted.push({ text: c.name, x: areas[id].x, y: areas[id].y, cls: 'lbl', must: true, pr: 70 - Math.log(areas[id].size + 1) });
  }
  for (const x of shown) {
    if (named.has(x.id)) continue;
    wanted.push({ text: x.name, x: x.x, y: x.y, cls: 'lbl faint', must: true, pr: 60 - Math.log(x.size + 1) });
  }
  const areaNames = new Set(wanted.map((l) => l.text.toLowerCase()));
  for (const p of a.dots) if (p.rank === 1 && !areaNames.has(p.name.toLowerCase())) wanted.push({ text: p.name, x: p.x, y: p.y, cls: 'city', must: false, pr: 50 });

  const taken = a.dots.map((p) => [p.x - 6 / k, p.y - 6 / k, p.x + 6 / k, p.y + 6 / k]);
  const clashes = (r: number[], self: boolean) => taken.filter((t) => !(r[2] < t[0] || r[0] > t[2] || r[3] < t[1] || r[1] > t[3])).length - (self ? 1 : 0);
  const labels: FirstView['labels'] = [];
  for (const l of wanted.sort((p, q) => q.pr - p.pr)) {
    const w = wide(l.text, l.cls.startsWith('lbl')) / k;
    const tries = l.cls === 'city' ? [[8 / k, 0], [-8 / k - w, 0]] : [0, -12, 12, -24, 24, -36, 36].map((dy) => [-w / 2, dy / k]);
    let best: { x: number; y: number; bad: number; r: number[] } | undefined;
    for (const [dx, dy] of tries) {
      const x = l.x + dx, y = l.y + dy;
      const r = [x - 2 / k, y - 8 / k, x + w + 2 / k, y + 6 / k];
      const bad = clashes(r, l.cls === 'city');
      if (bad && !l.must) continue;
      if (!best || bad < best.bad) best = { x, y, bad, r };
      if (!bad) break;
    }
    if (!best) continue;
    taken.push(best.r);
    labels.push({ text: l.text, x: l.cls === 'city' ? best.x : best.x + w / 2, y: best.y + 4 / k, cls: l.cls });
  }
  return { outlines: shown.map((x) => x.loop ?? x.path), labels };
}
