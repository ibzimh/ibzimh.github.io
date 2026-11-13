// Areas: shapes on a plate, made from units of a set, a hand-drawn outline, a circle, or other areas.
import type { MultiPolygon, Polygon } from 'geojson';
import {
  bboxOf, circleRing, fixWinding, hull, intersect, isPolygonal, labelPoint, loopPath, multiArea, multiPath, polyArea, projectMulti,
  reduceRing, ringArea, subtract, tidy, union, type Multi, type Pt, type Ring,
} from './geom';
import { plate as getPlate, type Detail, type PlateId } from './plates';
import { didYouMean, hasSet, setIds, unitGeometry, unitIds } from './sets';

export interface AreaDef {
  id: string;
  name: string;
  /** Two-letter country code. An area is only drawn on plates that show this country. */
  country: string;
  /** `exact` follows real lines; `rough` gets a smooth loop as well, because its edge is a guess. */
  edge: 'exact' | 'rough';
  /** Exactly one of the next four. */
  units?: { set: string; ids: string[] };
  /** GeoJSON Polygon or MultiPolygon, [lon, lat]. */
  drawn?: Polygon | MultiPolygon;
  around?: { lat: number; lon: number; km: number };
  /** Other areas (by id) joined together, less the `minus` ones. */
  of?: string[];
  minus?: string[];
}

export interface BuiltArea {
  id: string;
  plate: PlateId;
  edge: 'exact' | 'rough';
  /** SVG path, clipped to the plate's land. Empty when the area could not be built. */
  path: string;
  /** Rough areas only: a smooth closed curve that may run a little over the sea. */
  loop?: string;
  bbox: [number, number, number, number];
  /** A point inside the shape, for a label. */
  label: { x: number; y: number } | null;
  /** Area in viewBox units squared. */
  size: number;
  problems: string[];
}

const kinds = ['units', 'drawn', 'around', 'of'] as const;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ---------- checks that need no plate ----------
function crosses(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function selfCrossing(ring: Ring) {
  const n = ring.length - 1; // closed ring
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (crosses(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
  }
  return false;
}
const closeRing = (r: number[][]): Ring => {
  const pts = r.filter((p, i) => !i || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]) as Ring;
  return pts.length && (pts[0][0] !== pts.at(-1)![0] || pts[0][1] !== pts.at(-1)![1]) ? [...pts, pts[0]] : pts;
};

function checkDrawn(g: unknown): string[] {
  if (!g || typeof g !== 'object' || !isPolygonal(g as never)) return ['The drawn shape must be a GeoJSON Polygon or MultiPolygon.'];
  const geom = g as Polygon | MultiPolygon;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  if (!polys.length) return ['The drawn shape is empty.'];
  const out: string[] = [];
  for (const poly of polys) {
    if (!Array.isArray(poly) || !poly.length || !Array.isArray(poly[0])) { out.push('The drawn shape is empty.'); continue; }
    for (const raw of poly) {
      if (!raw.every((p) => Array.isArray(p) && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) {
        out.push('The drawn shape has a point that is not a valid [longitude, latitude] pair.');
        continue;
      }
      const ring = closeRing(raw);
      if (ring.length < 4) out.push('The drawn shape needs at least three different points.');
      else if (selfCrossing(ring)) out.push('The drawn shape crosses itself.');
      else if (ringArea(ring) < 1e-9) out.push('The drawn shape has no area (all its points are in a line).');
    }
  }
  return [...new Set(out)];
}

/** Problems with one definition on its own (references to other areas are checked in `checkAreas`). */
function checkDef(def: AreaDef): string[] {
  const out: string[] = [];
  if (def.edge !== 'exact' && def.edge !== 'rough') out.push('Its edge must be "exact" or "rough".');
  if (!def.country) out.push('It has no country.');
  const given = kinds.filter((k) => def[k] !== undefined);
  if (given.length !== 1) return [...out, given.length ? `It says how to draw it in ${given.length} ways (${given.join(', ')}); it needs exactly one of units, drawn, around or of.` : 'It does not say how to draw it: give units, drawn, around or of.'];
  if (def.minus && !def.of) out.push('"minus" only works together with "of".');
  if (def.units) {
    const { set, ids } = def.units;
    if (!hasSet(set)) out.push(`Unknown set "${set}".${didYouMean(set, setIds())} Known sets: ${setIds().join(', ') || 'none (run npm run atlas:geo)'}.`);
    else {
      const known = unitIds(set);
      if (!Array.isArray(ids) || !ids.length) out.push(`No units listed from set "${set}".`);
      else for (const id of ids) if (!known.includes(id)) out.push(`Unknown unit "${id}" in set "${set}".${didYouMean(id, known)}`);
    }
  }
  if (def.drawn) out.push(...checkDrawn(def.drawn));
  if (def.around) {
    const { lat, lon, km } = def.around;
    if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) out.push('The circle centre is not a valid latitude and longitude.');
    if (!finite(km) || km <= 0 || km > 5000) out.push('The circle radius must be a number of kilometres above 0.');
  }
  if (def.of && (!Array.isArray(def.of) || !def.of.length)) out.push('"of" lists no areas.');
  return out;
}

/** Every problem in a list of definitions, in plain English. Needs no plate. */
export function checkAreas(defs: AreaDef[]): string[] {
  const out: string[] = [];
  const ids = defs.map((d) => d.id);
  const seen = new Set<string>();
  for (const d of defs) {
    if (seen.has(d.id)) out.push(`Two areas are called "${d.id}".`);
    seen.add(d.id);
    for (const p of checkDef(d)) out.push(`Area "${d.id}": ${p}`);
    for (const ref of [...(d.of ?? []), ...(d.minus ?? [])]) {
      if (ref === d.id) out.push(`Area "${d.id}": it uses itself.`);
      else if (!ids.includes(ref)) out.push(`Area "${d.id}": it uses "${ref}", which is not an area.${didYouMean(ref, ids)}`);
    }
  }
  const byId = new Map(defs.map((d) => [d.id, d]));
  const state = new Map<string, 'open' | 'done'>();
  const reported = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      const loop = [...trail.slice(trail.indexOf(id)), id];
      const key = [...loop.slice(0, -1)].sort().join('|');
      if (!reported.has(key) && loop.length > 2) { reported.add(key); out.push(`These areas use each other in a circle: ${loop.join(' → ')}.`); }
      return;
    }
    state.set(id, 'open');
    const d = byId.get(id);
    for (const ref of [...(d?.of ?? []), ...(d?.minus ?? [])]) if (byId.has(ref) && ref !== id) visit(ref, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of ids) visit(id, []);
  return out;
}

// ---------- building ----------
const empty = (plate: PlateId, def: AreaDef, problems: string[]): BuiltArea => ({
  id: def.id, plate, edge: def.edge, path: '', bbox: [0, 0, 0, 0], label: null, size: 0, problems,
});

/** A smooth outline for a rough shape: its convex hull when that is a fair fit, else its main coastline, pushed out a little. */
function outlineOf(m: Multi): Ring {
  const big = Math.max(...m.map(polyArea));
  const parts = m.filter((p) => polyArea(p) >= big * 0.08);
  const h = hull(parts.flatMap((p) => p[0]));
  const solid = multiArea(m) / (ringArea(h) || 1);
  const ring = solid >= 0.6 ? reduceRing(h, 16) : reduceRing(parts.reduce((a, b) => (polyArea(b) > polyArea(a) ? b : a))[0], 18);
  return pushOut(ring, Math.min(6, Math.max(1.5, 0.02 * Math.sqrt(multiArea(m)))));
}
function pushOut(ring: Ring, by: number): Ring {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return ring.map(([x, y]): Pt => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * by, y + ((y - cy) / d) * by];
  });
}

/** Build every area that belongs on a plate. Areas of countries the plate does not show are left out. */
export function buildAreas(defs: AreaDef[], plateId: string, detail: Detail = 'normal'): BuiltArea[] {
  const p = getPlate(plateId);
  const mine = defs.filter((d) => p.countries.includes(d.country));
  const byId = new Map(mine.map((d) => [d.id, d]));
  const land = p.clip(detail);
  const done = new Map<string, { shape: Multi; built: BuiltArea }>();
  const busy: string[] = [];

  const projectGeometry = (g: Polygon | MultiPolygon): Multi => projectMulti(p.projection, fixWinding(g));

  function resolve(id: string): { shape: Multi; built: BuiltArea } {
    const hit = done.get(id);
    if (hit) return hit;
    const def = byId.get(id)!;
    let result: { shape: Multi; built: BuiltArea };
    if (busy.includes(id)) {
      return { shape: [], built: empty(p.id, def, [`It is part of a circle of areas that use each other: ${[...busy.slice(busy.indexOf(id)), id].join(' → ')}.`]) };
    }
    busy.push(id);
    try {
      result = make(def);
    } catch (e) {
      result = { shape: [], built: empty(p.id, def, [`Could not build this shape (${e instanceof Error ? e.message : String(e)}).`]) };
    }
    busy.pop();
    done.set(id, result);
    return result;
  }

  function make(def: AreaDef): { shape: Multi; built: BuiltArea } {
    const problems = checkDef(def);
    for (const ref of [...(def.of ?? []), ...(def.minus ?? [])]) {
      if (!byId.has(ref)) problems.push(defs.some((d) => d.id === ref) ? `It uses "${ref}", which belongs on a different map.` : `It uses "${ref}", which is not an area.${didYouMean(ref, defs.map((d) => d.id))}`);
    }
    if (problems.length) return { shape: [], built: empty(p.id, def, problems) };

    let flat: Multi = [];
    let loose: Ring | undefined;
    let clipped = true;
    if (def.units) {
      const g = unitGeometry(def.units.set, def.units.ids)!;
      flat = projectGeometry(g);
    } else if (def.drawn) {
      const rings = (def.drawn.type === 'Polygon' ? [def.drawn.coordinates] : def.drawn.coordinates).map((poly) => poly.map(closeRing));
      const g = fixWinding({ type: 'MultiPolygon', coordinates: rings } as MultiPolygon);
      flat = projectGeometry(g);
      const biggest = rings.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
      loose = biggest[0].map(([lon, lat]) => p.loose([lon, lat]) as Pt);
    } else if (def.around) {
      const { lat, lon, km } = def.around;
      flat = projectGeometry({ type: 'Polygon', coordinates: [circleRing(lat, lon, km)] });
      loose = circleRing(lat, lon, km, 20).slice(0, -1).map(([a, b]) => p.loose([a, b]) as Pt);
    } else {
      const parts = def.of!.map((id) => resolve(id));
      const bad = parts.flatMap((x) => (x.built.problems.length ? [x.built.id] : []));
      if (bad.length) return { shape: [], built: empty(p.id, def, [`It uses ${bad.map((b) => `"${b}"`).join(', ')}, which could not be built.`]) };
      let m = union(parts.map((x) => x.shape));
      if (def.minus?.length) {
        const cut = def.minus.map((id) => resolve(id));
        const bad2 = cut.flatMap((x) => (x.built.problems.length ? [x.built.id] : []));
        if (bad2.length) return { shape: [], built: empty(p.id, def, [`It takes away ${bad2.map((b) => `"${b}"`).join(', ')}, which could not be built.`]) };
        m = subtract(m, union(cut.map((x) => x.shape)));
      }
      flat = m;
      clipped = false;
    }

    const where = bboxOf(flat);
    if (!flat.length || where[2] < 0 || where[0] > p.width || where[3] < 0 || where[1] > p.height) {
      return { shape: [], built: empty(p.id, def, [`It lies outside the ${p.name} map.`]) };
    }
    const shape = tidy(clipped ? intersect(flat, land) : flat);
    if (!shape.length) {
      return { shape: [], built: empty(p.id, def, [def.of ? 'Nothing is left of it (the areas it uses cancel out).' : 'It is entirely over the sea, so no land is left of it.']) };
    }

    const built: BuiltArea = {
      id: def.id, plate: p.id, edge: def.edge, path: multiPath(shape), bbox: bboxOf(shape),
      label: labelPoint(shape), size: Math.round(multiArea(shape)), problems: [],
    };
    if (def.edge === 'rough') built.loop = loopPath(loose ? (def.drawn ? reduceRing(loose, 24) : loose) : outlineOf(shape));
    return { shape, built };
  }

  return mine.map((d) => resolve(d.id).built);
}
