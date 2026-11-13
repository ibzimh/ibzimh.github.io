// Sets of named boundary units (regions, counties...) read from the small TopoJSON files made by `npm run atlas:geo`.
import type { MultiPolygon } from 'geojson';
import { merge } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { fixWinding } from './geom';

type Props = { name?: string };
type SetTopology = Topology<{ units: GeometryCollection<Props> }>;

const files = import.meta.glob('./data/*.topo.json', { eager: true, import: 'default' }) as Record<string, SetTopology>;
const topologies = new Map<string, SetTopology>(Object.entries(files).map(([path, t]) => [path.replace(/^.*\/(.*)\.topo\.json$/, '$1'), t]));

export const hasSet = (setId: string) => topologies.has(setId);
export const setIds = () => [...topologies.keys()].sort();
export const setTopology = (setId: string) => topologies.get(setId);

const geometries = (setId: string) => topologies.get(setId)?.objects.units.geometries ?? [];

export const unitIds = (setId: string): string[] => geometries(setId).map((g) => String(g.id));

// the file leaves out US county names that can be read straight back from the id
const countyName = (id: string) => id.replace(/^[a-z]{2}-/, '').replace(/-\d{5}$/, '').replace(/-/g, ' ').replace(/(^| )([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function unitName(setId: string, unitId: string): string | undefined {
  const g = geometries(setId).find((x) => String(x.id) === unitId);
  if (!g) return undefined;
  return (g.properties as Props | undefined)?.name ?? (setId === 'us-counties' ? countyName(unitId) : unitId);
}

const mergedCache = new Map<string, MultiPolygon>();

/** The outline of some units joined into one shape (no lines between neighbours), or null if any id is unknown. */
export function unitGeometry(setId: string, ids: string[]): MultiPolygon | null {
  const topo = topologies.get(setId);
  if (!topo) return null;
  const key = `${setId}:${[...ids].sort().join('|')}`;
  const hit = mergedCache.get(key);
  if (hit) return hit;
  const want = new Set(ids);
  const picked = geometries(setId).filter((g) => want.has(String(g.id)));
  if (picked.length !== want.size) return null;
  const joined = fixWinding(merge(topo, picked as never) as MultiPolygon);
  mergedCache.set(key, joined);
  return joined;
}

// ---------- "did you mean" ----------
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The closest known name, if any is close enough to be a likely typo. */
export function closest(word: string, options: string[]): string | undefined {
  const w = flat(word);
  let best: string | undefined;
  let bestScore = Infinity;
  for (const o of options) {
    const f = flat(o);
    const score = f.includes(w) && w.length >= 3 ? 0.5 : distance(w, f);
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best !== undefined && bestScore <= Math.max(2, Math.floor(w.length / 3)) ? best : undefined;
}
export const didYouMean = (word: string, options: string[]) => {
  const c = closest(word, options);
  return c ? ` Did you mean "${c}"?` : '';
};
