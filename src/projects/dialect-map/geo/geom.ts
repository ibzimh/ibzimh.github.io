// Flat-plane geometry helpers for map shapes. All numbers here are map (viewBox) units unless a name says otherwise.
import type { Geometry, MultiPolygon, Polygon } from 'geojson';
import { geoArea, geoStream, type GeoProjection } from 'd3-geo';
import { curveCatmullRomClosed, line } from 'd3-shape';
import polygonClipping from 'polygon-clipping';
import polylabel from 'polylabel';

export type Pt = [number, number];
export type Ring = Pt[];
export type Poly = Ring[];
export type Multi = Poly[];

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- sizes ----------
const signedArea = (r: Ring) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};
export const ringArea = (r: Ring) => Math.abs(signedArea(r));
export const polyArea = (p: Poly) => ringArea(p[0]) - p.slice(1).reduce((s, h) => s + ringArea(h), 0);
export const multiArea = (m: Multi) => m.reduce((s, p) => s + polyArea(p), 0);

export function bboxOf(m: Multi): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of m) for (const [x, y] of p[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return m.length ? [r1(x0), r1(y0), r1(x1), r1(y1)] : [0, 0, 0, 0];
}

// ---------- boolean operations (polygon-clipping can throw on broken input; callers catch) ----------
export const union = (list: Multi[]): Multi => {
  const live = list.filter((m) => m.length);
  return live.length ? (polygonClipping.union(live[0] as never, ...(live.slice(1) as never[])) as Multi) : [];
};
export const intersect = (a: Multi, b: Multi): Multi => (a.length && b.length ? (polygonClipping.intersection(a as never, b as never) as Multi) : []);
export const subtract = (a: Multi, b: Multi): Multi => (a.length && b.length ? (polygonClipping.difference(a as never, b as never) as Multi) : a);

/** Drop specks smaller than `min` units² and rings that collapse when rounded. */
export const tidy = (m: Multi, min = 0.4): Multi =>
  m.filter((p) => polyArea(p) >= min).map((p) => [p[0], ...p.slice(1).filter((h) => ringArea(h) >= min)]);

// ---------- winding (d3-geo reads a counter-clockwise ring as "the whole world minus the shape") ----------
const flip = (ring: number[][]) => ring.slice().reverse();
const sphereArea = (ring: number[][]) => geoArea({ type: 'Polygon', coordinates: [ring] });
function fixPolygon(rings: number[][][]): number[][][] {
  const out = rings.map((r, i) => {
    const wrongExterior = i === 0 && sphereArea(r) > 2 * Math.PI;
    const wrongHole = i > 0 && sphereArea(r) < 2 * Math.PI;
    return wrongExterior || wrongHole ? flip(r) : r;
  });
  return out;
}
export function fixWinding<G extends Polygon | MultiPolygon>(g: G): G {
  return (g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: fixPolygon(g.coordinates) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map(fixPolygon) }) as G;
}

// ---------- projecting ----------
/** Project a polygon geometry with a d3 projection (so its clipping applies) into flat map polygons. */
export function projectMulti(projection: GeoProjection, g: Polygon | MultiPolygon): Multi {
  const out: Multi = [];
  let rings: Ring[] = [];
  let ring: Ring = [];
  const sink = {
    point(x: number, y: number) { ring.push([x, y]); },
    lineStart() { ring = []; },
    lineEnd() { if (ring.length > 2) rings.push(ring); },
    polygonStart() { rings = []; },
    polygonEnd() {
      if (!rings.length) return;
      // after clipping the first ring is not always the outer one: outer rings share the biggest ring's direction
      const big = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
      const dir = Math.sign(signedArea(big));
      const outers = rings.filter((r) => Math.sign(signedArea(r)) === dir);
      const holes = rings.filter((r) => Math.sign(signedArea(r)) !== dir);
      const shape = outers.map((r) => [r]) as Multi;
      out.push(...(holes.length ? subtract(shape, holes.map((h) => [h]) as Multi) : shape));
    },
    sphere() {},
  };
  geoStream(g as never, projection.stream(sink));
  return out;
}

// ---------- SVG paths ----------
function ringPath(ring: Ring): string {
  let out = '';
  let last: Pt | null = null;
  const pts = ring.map(([x, y]): Pt => [r1(x), r1(y)]);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1]) pts.pop();
  for (const p of pts) {
    if (last && p[0] === last[0] && p[1] === last[1]) continue;
    out += (last ? 'L' : 'M') + p[0] + ',' + p[1];
    last = p;
  }
  return out + 'Z';
}
export const multiPath = (m: Multi) => m.map((p) => p.map(ringPath).join('')).join('');

/** Read back a path made by `multiPath` (outer rings and holes run in opposite directions). */
export function parsePath(d: string): Multi {
  const out: Multi = [];
  let dir = 0;
  for (const sub of d.split('Z')) {
    const ring: Ring = [...sub.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m): Pt => [+m[1], +m[2]]);
    if (ring.length < 3) continue;
    const s = Math.sign(signedArea(ring));
    if (!out.length || (dir && s === dir)) {
      dir = s;
      out.push([ring]);
    } else out.at(-1)!.push(ring);
  }
  return out;
}

/** Read back a smooth loop made by `loopPath`, as a many-sided ring. */
export function parseLoop(d: string): Ring {
  const nums = (s: string) => s.match(/-?[\d.]+/g)!.map(Number);
  const ring: Ring = [];
  let cur: Pt | null = null;
  for (const seg of d.replace(/Z$/, '').split(/(?=[MC])/)) {
    const n = nums(seg);
    if (seg[0] === 'M') cur = [n[0], n[1]];
    else if (cur) {
      const [x0, y0] = cur;
      for (let t = 1; t <= 8; t++) {
        const u = t / 8, v = 1 - u;
        ring.push([
          v * v * v * x0 + 3 * v * v * u * n[0] + 3 * v * u * u * n[2] + u * u * u * n[4],
          v * v * v * y0 + 3 * v * v * u * n[1] + 3 * v * u * u * n[3] + u * u * u * n[5],
        ]);
      }
      cur = [n[4], n[5]];
    }
  }
  return ring;
}

// ---------- points ----------
export function inRing(p: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const inMulti = (p: Pt, m: Multi) => m.some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h)));

export function edgeDistance(p: Pt, m: Multi): number {
  let best = Infinity;
  for (const poly of m) for (const ring of poly) for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const dx = x2 - x1, dy = y2 - y1;
    const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(p[0] - (x1 + t * dx), p[1] - (y1 + t * dy)));
  }
  return best;
}

/** A point well inside the shape (the middle of its biggest polygon). */
export function labelPoint(m: Multi): { x: number; y: number } | null {
  if (!m.length) return null;
  const big = m.reduce((a, b) => (polyArea(b) > polyArea(a) ? b : a));
  const closed = big.map((r) => (r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r : [...r, r[0]]));
  const [x, y] = polylabel(closed, 0.1);
  return { x: r1(x), y: r1(y) };
}

// ---------- loops: smooth closed curves through a few points ----------
function dpOpen(pts: Ring, tol: number): Ring {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts.at(-1)!;
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let worst = -1, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [pts[0], pts.at(-1)!];
  return [...dpOpen(pts.slice(0, at + 1), tol).slice(0, -1), ...dpOpen(pts.slice(at), tol)];
}
/** Douglas-Peucker on a closed ring: split at the point farthest from the first one. */
export function simplifyRing(ring: Ring, tol: number): Ring {
  if (ring.length < 4) return ring;
  let far = 1, best = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const a = dpOpen(ring.slice(0, far + 1), tol);
  const b = dpOpen([...ring.slice(far), ring[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
export function reduceRing(ring: Ring, maxPts: number): Ring {
  const open = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  if (open.length <= maxPts) return open;
  let lo = 0, hi = 1;
  while (simplifyRing(open, hi).length > maxPts) hi *= 2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (simplifyRing(open, mid).length > maxPts) lo = mid; else hi = mid;
  }
  return simplifyRing(open, hi);
}

export function hull(points: Pt[]): Ring {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const p of list) {
      while (h.length > 1 && cross(h.at(-2)!, h.at(-1)!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...build(pts), ...build(pts.reverse())];
}

const loopLine = line().curve(curveCatmullRomClosed.alpha(0.5));
export const loopPath = (pts: Ring) => loopLine(pts)!.replace(/-?\d+\.\d+/g, (n) => String(r1(+n)));

// ---------- the earth ----------
/** Ring of [lon, lat] points `km` from a centre, running clockwise as d3-geo wants. */
export function circleRing(lat: number, lon: number, km: number, steps = 48): number[][] {
  const ang = km / 6371;
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  const out: number[][] = [];
  for (let i = 0; i < steps; i++) {
    const b = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(ang) + Math.cos(la) * Math.sin(ang) * Math.cos(b));
    const lon2 = lo + Math.atan2(Math.sin(b) * Math.sin(ang) * Math.cos(la), Math.cos(ang) - Math.sin(la) * Math.sin(lat2));
    out.push([(((lon2 * 180) / Math.PI + 540) % 360) - 180, (lat2 * 180) / Math.PI]);
  }
  out.push(out[0]);
  return out;
}

export const isPolygonal = (g: Geometry | null | undefined): g is Polygon | MultiPolygon => !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon');
