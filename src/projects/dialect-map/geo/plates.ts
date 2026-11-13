// Plates: the fixed drawings of land (a country or a few) that areas and dots are placed on. Built once, at build time.
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { geoAlbers, geoAlbersUsa, geoDistance, geoPath, type GeoProjection } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, GeometryObject, Topology } from 'topojson-specification';
import states from 'us-atlas/states-10m.json';
import { fixWinding, projectMulti, ringArea, simplifyRing, type Multi } from './geom';
import { didYouMean, setTopology } from './sets';

export type PlateId = 'us' | 'britain-ireland';
export type Detail = 'normal' | 'fine';

export interface Plate {
  id: PlateId;
  name: string;
  countries: string[];
  width: number;
  height: number;
  /** SVG path of all the land. */
  land: string;
  /** The same land with about 3x the points, for zooming in. */
  landFine: string;
  /** SVG path of the lines between nations/states only (no coastline). */
  borders: string;
  bordersFine: string;
  /** Where to write the nations' names. Empty when the plate has none. */
  nations: { text: string; x: number; y: number }[];
  /** A deliberately crude outline (about 60 straight points) for a small hand-drawn-looking picture. */
  sketch: string;
  /** Kilometres in one viewBox unit, measured near the middle of the plate. */
  kmPerUnit: number;
  /** Where a place sits on the plate, in viewBox units, or null when it is off the plate. */
  project(lat: number, lon: number): { x: number; y: number } | null;
  /** The land as flat polygons, for clipping areas to the coast. */
  clip(detail?: Detail): Multi;
  /** The projection with clipping (what draws the land), and one without it for loops that run out to sea. */
  projection: GeoProjection;
  loose: GeoProjection;
}

export const plates: readonly { id: PlateId; name: string; countries: string[]; width: number; height: number }[] = [
  { id: 'us', name: 'United States', countries: ['US'], width: 975, height: 610 },
  { id: 'britain-ireland', name: 'Britain & Ireland', countries: ['GB', 'IE', 'IM'], width: 640, height: 860 },
];

const r1 = (n: number) => Math.round(n * 10) / 10;

interface Parts {
  id: PlateId;
  projection: GeoProjection;
  loose: GeoProjection;
  levels: Record<Detail, { land: MultiPolygon; borders: string; landPath: string }>;
  nations: { text: string; lon: number; lat: number }[];
}

function build({ id, projection, loose, levels, nations }: Parts): Plate {
  const reg = plates.find((p) => p.id === id)!;
  const flat = new Map<Detail, Multi>();
  const clip = (detail: Detail = 'normal') => {
    let m = flat.get(detail);
    if (!m) flat.set(detail, (m = projectMulti(projection, fixWinding(levels[detail].land))));
    return m;
  };
  const project: Plate['project'] = (lat, lon) => {
    const p = projection([lon, lat]);
    if (!p || p[0] < 0 || p[0] > reg.width || p[1] < 0 || p[1] > reg.height) return null;
    return { x: r1(p[0]), y: r1(p[1]) };
  };
  const cx = reg.width / 2, cy = reg.height / 2;
  const a = projection.invert!([cx - 50, cy])!, b = projection.invert!([cx + 50, cy])!;
  return {
    id, name: reg.name, countries: reg.countries, width: reg.width, height: reg.height,
    land: levels.normal.landPath, landFine: levels.fine.landPath, borders: levels.normal.borders, bordersFine: levels.fine.borders,
    nations: nations.map((n) => ({ text: n.text, ...(project(n.lat, n.lon) ?? { x: 0, y: 0 }) })),
    sketch: sketchPath(clip('normal')),
    kmPerUnit: Math.round(((geoDistance(a, b) * 6371) / 100) * 1000) / 1000,
    project, clip, projection, loose,
  };
}

/** Biggest pieces only, cut down to about 60 straight points in total. */
function sketchPath(land: Multi, target = 60): string {
  const rings = land.map((p) => p[0]);
  const area = ringArea;
  const biggest = Math.max(...rings.map(area));
  const kept = rings.filter((r) => area(r) > biggest * 0.015);
  const total = (tol: number) => kept.reduce((s, r) => s + simplifyRing(r, tol).length, 0);
  let lo = 0, hi = 1;
  while (total(hi) > target) hi *= 2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > target) lo = mid; else hi = mid;
  }
  return kept.map((r) => 'M' + simplifyRing(r, hi).map(([x, y]) => `${r1(x)},${r1(y)}`).join('L') + 'Z').join('');
}

// ---------- United States: drawn exactly as the first map was ----------
function us(): Plate {
  const { width: W, height: H } = plates[0];
  const full = states as unknown as Topology<{ nation: GeometryCollection; states: GeometryCollection }>;
  const pre = presimplify(full);
  const level = (keep: number) => simplify(pre, quantile(pre, keep));
  const normal = level(0.25), fine = level(0.75);
  const nationOf = (t: typeof normal) => feature(t, t.objects.nation);
  const projection = geoAlbersUsa().fitExtent([[10, 10], [W - 10, H - 10]], nationOf(normal));
  // the lower 48 on their own, unclipped (the same numbers albersUsa uses), so loops can run out over the sea
  const loose = geoAlbers().rotate([96, 0]).center([-0.6, 38.7]).parallels([29.5, 45.5]).scale(projection.scale()).translate(projection.translate());
  const path = geoPath(projection).digits(1);
  const one = (t: typeof normal) => {
    const n = nationOf(t) as Feature | FeatureCollection;
    const features = n.type === 'FeatureCollection' ? n.features : [n];
    const polys = features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []));
    return {
      land: { type: 'MultiPolygon', coordinates: polys } as MultiPolygon,
      landPath: path(n) ?? '',
      borders: path(mesh(t, t.objects.states, (a, b) => a !== b)) ?? '',
    };
  };
  return build({ id: 'us', projection, loose, levels: { normal: one(normal), fine: one(fine) }, nations: [] });
}

// ---------- Britain & Ireland ----------
const BI_NATIONS = ['england', 'scotland', 'wales', 'northern-ireland', 'ireland', 'isle-of-man'];
const BI_LABELS = [
  { text: 'SCOTLAND', lon: -4.6, lat: 57.2 },
  { text: 'ENGLAND', lon: -1.9, lat: 52.4 },
  { text: 'WALES', lon: -3.85, lat: 52.35 },
  { text: 'IRELAND', lon: -8.0, lat: 53.0 },
  { text: 'N. IRELAND', lon: -6.7, lat: 54.65 },
];

function britainIreland(): Plate {
  const { width: W, height: H } = plates[1];
  const source = setTopology('bi-nations');
  if (!source) throw new Error('The bi-nations map data is missing. Run `npm run atlas:geo` once to make it.');
  const nations: GeometryCollection = { type: 'GeometryCollection', geometries: source.objects.units.geometries.filter((g) => BI_NATIONS.includes(String(g.id))) as GeometryObject[] };
  const fine = { ...source, objects: { nations } } as unknown as Topology<{ nations: GeometryCollection }>;
  const pre = presimplify(fine);
  const normal = simplify(pre, quantile(pre, 0.33));
  const fineLand = merge(fine, nations.geometries as never) as MultiPolygon;
  const projection = geoAlbers().rotate([4.4, 0]).center([0, 54.5]).parallels([50, 60]).fitExtent([[12, 12], [W - 12, H - 12]], fineLand);
  const path = geoPath(projection).digits(1);
  const one = (t: typeof fine) => {
    const land = merge(t, t.objects.nations.geometries as never) as MultiPolygon;
    return { land, landPath: path(land) ?? '', borders: path(mesh(t, t.objects.nations, (a, b) => a !== b)) ?? '' };
  };
  return build({ id: 'britain-ireland', projection, loose: projection, levels: { normal: one(normal), fine: one(fine) }, nations: BI_LABELS });
}

const builders: Record<PlateId, () => Plate> = { us, 'britain-ireland': britainIreland };
const built = new Map<PlateId, Plate>();

export function plate(id: string): Plate {
  if (!(id in builders)) throw new Error(`Unknown plate "${id}".${didYouMean(id, plates.map((p) => p.id))}`);
  let p = built.get(id as PlateId);
  if (!p) built.set(id as PlateId, (p = builders[id as PlateId]()));
  return p;
}

/** The plate that draws a country, by its two-letter code. */
export const plateForCountry = (code: string): Plate | undefined => {
  const hit = plates.find((p) => p.countries.includes(code.toUpperCase()));
  return hit && plate(hit.id);
};
