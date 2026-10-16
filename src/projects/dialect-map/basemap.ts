// Build-time map shapes and dot positions. Nothing here reaches the browser except the output.
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import states from 'us-atlas/states-10m.json';
import type { MapId } from './config';

const W = 975;
const H = 610;

export interface BaseMap {
  width: number;
  height: number;
  land: string; // SVG path d
  borders: string; // SVG path d, interior state lines
  /** Position of a lat/lon as percent of the box (for HTML dots), or null if it is off this map. */
  project(lat: number, lon: number): { x: number; y: number } | null;
}

const pct = (n: number, of: number) => Math.round((n / of) * 1e4) / 1e2;

function us(): BaseMap {
  const full = states as unknown as Topology<{ nation: GeometryCollection; states: GeometryCollection }>;
  // keep the biggest quarter of the detail: plenty at 960px wide, a third of the bytes
  const pre = presimplify(full);
  const topo = simplify(pre, quantile(pre, 0.25));
  const nation = feature(topo, topo.objects.nation);
  const projection = geoAlbersUsa().fitExtent([[10, 10], [W - 10, H - 10]], nation);
  const path = geoPath(projection).digits(1);
  return {
    width: W,
    height: H,
    land: path(nation) ?? '',
    borders: path(mesh(topo, topo.objects.states, (a, b) => a !== b)) ?? '',
    project(lat, lon) {
      const p = projection([lon, lat]);
      return p ? { x: pct(p[0], W), y: pct(p[1], H) } : null;
    },
  };
}

const builders: Record<MapId, () => BaseMap> = { us };
const built = new Map<MapId, BaseMap>();

export function baseMap(id: MapId): BaseMap {
  let m = built.get(id);
  if (!m) built.set(id, (m = builders[id]()));
  return m;
}
