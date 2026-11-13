// How dots and areas relate: which dots fall in which area, and which areas sit inside or overlap others.
import type { BuiltArea } from './areas';
import { edgeDistance, inMulti, inRing, intersect, multiArea, parseLoop, parsePath, type Multi, type Pt, type Ring } from './geom';
import { plate } from './plates';

const shapes = new Map<string, Multi>();
const loops = new Map<string, Ring>();
const shapeOf = (a: BuiltArea) => {
  let m = shapes.get(a.path);
  if (!m) shapes.set(a.path, (m = parsePath(a.path)));
  return m;
};
const loopOf = (a: BuiltArea) => {
  if (!a.loop) return undefined;
  let r = loops.get(a.loop);
  if (!r) loops.set(a.loop, (r = parseLoop(a.loop)));
  return r;
};

// Coasts are simplified, so a dot just outside the drawn land still counts as inside this many units of it.
const COAST_SLACK = 1.5;

/** For each area, the ids of the dots inside it (a rough area counts everything inside its loop). */
export function dotsInAreas(dots: { id: string; lat: number; lon: number }[], areas: BuiltArea[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const placed = new Map<string, (Pt | null)[]>();
  for (const a of areas) {
    out[a.id] = [];
    if (!a.path) continue;
    let pts = placed.get(a.plate);
    if (!pts) {
      const p = plate(a.plate);
      placed.set(a.plate, (pts = dots.map((d) => { const q = p.project(d.lat, d.lon); return q && [q.x, q.y]; })));
    }
    const shape = shapeOf(a), loop = loopOf(a);
    dots.forEach((d, i) => {
      const pt = pts![i];
      if (!pt) return;
      if (inMulti(pt, shape) || (loop && inRing(pt, loop)) || edgeDistance(pt, shape) <= COAST_SLACK) out[a.id].push(d.id);
    });
  }
  return out;
}

export interface AreaOverlap {
  a: string;
  b: string;
  /** `a-contains-b`, `b-contains-a` or `overlap`. */
  relation: 'a-contains-b' | 'b-contains-a' | 'overlap';
  /** Share of a's size that lies in b, and of b's that lies in a (0 to 1). */
  shareOfA: number;
  shareOfB: number;
}

const CONTAINS = 0.9;
const NEGLIGIBLE = 0.01;

/** Every pair of areas on the same plate that overlap. */
export function areaOverlaps(areas: BuiltArea[]): AreaOverlap[] {
  const out: AreaOverlap[] = [];
  const live = areas.filter((a) => a.path);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.plate !== b.plate) continue;
    if (a.bbox[2] < b.bbox[0] || b.bbox[2] < a.bbox[0] || a.bbox[3] < b.bbox[1] || b.bbox[3] < a.bbox[1]) continue;
    const both = multiArea(intersect(shapeOf(a), shapeOf(b)));
    const sa = multiArea(shapeOf(a)), sb = multiArea(shapeOf(b));
    const shareOfA = sa ? both / sa : 0, shareOfB = sb ? both / sb : 0;
    if (Math.max(shareOfA, shareOfB) < NEGLIGIBLE) continue;
    const bigA = shareOfB >= CONTAINS && sa >= sb, bigB = shareOfA >= CONTAINS && sb > sa;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    out.push({ a: a.id, b: b.id, relation: bigA ? 'a-contains-b' : bigB ? 'b-contains-a' : 'overlap', shareOfA: r(shareOfA), shareOfB: r(shareOfB) });
  }
  return out;
}
