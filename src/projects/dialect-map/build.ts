// buildData: file contents in, checked and derived data out. Pure: no imports of files or env.
// Every problem in every file is collected and thrown as one Error.
import { linkAccents, parseAccents } from './check-accents';
import { linkAreas, parseAreas } from './check-areas';
import { checkFindings, countRows } from './check-findings';
import { checkGlossary } from './check-glossary';
import { checkPlaces } from './check-places';
import { checkSounds } from './check-sounds';
import { checkSources, sampleSources } from './check-sources';
import { derive, type Data } from './derive';
import { defaultGeo } from './geo-port';
import { buildIndex } from './ids';
import { newCtx } from './parse';
import type { AreaDef } from './geo/areas';
import type { Area, AreasResult, BuildOpts, Place, RawInput } from './types';

/** One Polygon/MultiPolygon out of a parsed GeoJSON file (geometry, feature or collection). */
function geometryOf(json: unknown): AreaDef['drawn'] {
  const j = json as { type?: string; features?: { geometry: unknown }[]; geometry?: unknown; coordinates?: unknown };
  const geoms = (j.type === 'FeatureCollection' ? (j.features ?? []).map((f) => f.geometry) : j.type === 'Feature' ? [j.geometry] : [j]) as { type: string; coordinates: never }[];
  const polys = geoms.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates as never[]));
  return geoms.length === 1 && geoms[0].type === 'Polygon' ? (geoms[0] as never) : ({ type: 'MultiPolygon', coordinates: polys } as never);
}

function areaDef(a: Area, places: Map<string, Place>): AreaDef {
  const def: AreaDef = { id: a.id, name: a.name, country: a.country, edge: a.edge };
  const m = a.made;
  if (m.kind === 'units') def.units = { set: m.set, ids: m.ids };
  else if (m.kind === 'drawn') def.drawn = geometryOf(a.shape);
  else if (m.kind === 'around') {
    const p = places.get(m.place)!;
    def.around = { lat: p.lat, lon: p.lon, km: m.km };
  } else {
    def.of = m.of;
    if (m.minus.length) def.minus = m.minus;
  }
  return def;
}

const ids = <T extends { id: string; was: string[] }>(m: Map<string, T>) => [...m.values()].map(({ id, was }) => ({ id, was }));

export function buildData(input: RawInput, opts: BuildOpts) {
  const ctx = newCtx();
  const geo = opts.geo ?? defaultGeo;

  // Samples: dev only, and only while the real findings have no rows.
  const usingSamples = opts.dev && !!input.sample && countRows(input.findings) === 0;
  const sample = usingSamples ? input.sample! : { findings: [], areas: [], accents: [], shapes: [] };
  const realSources = checkSources(ctx, input.sources);
  const sources = usingSamples ? new Map(sampleSources.map((s) => [s.key, s])) : realSources;

  const sounds = checkSounds(ctx, input.features);
  const places = checkPlaces(ctx, input.places, geo);
  const areas = parseAreas(ctx, [...input.areas, ...sample.areas], [...input.shapes, ...(sample.shapes ?? [])]);
  const accents = parseAccents(ctx, [...input.accents, ...sample.accents]);
  const index = buildIndex(ctx, { sound: ids(sounds), place: ids(places), area: ids(areas), accent: ids(accents) });
  linkAreas(ctx, areas, index);
  linkAccents(ctx, accents, index);
  let shapes: AreasResult = { problems: [], built: {}, contains: {}, overlaps: {} };
  // shapes can only be built once every area and place reference is sound
  if (geo.areas && !ctx.problems.length) {
    const dots = [...places.values()].map(({ id, lat, lon }) => ({ id, lat, lon }));
    shapes = geo.areas([...areas.values()].map((a) => areaDef(a, places)), dots);
    const files = new Map([...areas.values()].map((a) => [a.id, a]));
    for (const m of shapes.problems) {
      const hit = /^Area "([^"]+)": ([\s\S]*)$/.exec(m);
      if (hit && files.has(hit[1])) ctx.problem(`area ${hit[1]}`, hit[2]);
      else ctx.problem('areas', m);
    }
  }
  const glossary = checkGlossary(ctx, input.glossary);

  const rows = usingSamples ? sample.findings : input.findings;
  const checked = checkFindings(ctx, rows, { sounds, sources, index, today: opts.today });
  const findings = opts.dev ? checked : checked.filter((f) => !f.draft);

  if (opts.dev && !usingSamples) {
    const used = new Set(findings.map((f) => f.source));
    for (const s of realSources.values()) if (!used.has(s.key)) ctx.warnings.push(`Dialect map: source "${s.key}" has no findings.`);
  }

  if (ctx.problems.length) {
    throw new Error(`Dialect map data has ${ctx.problems.length} ${ctx.problems.length === 1 ? 'problem' : 'problems'}:\n${ctx.problems.join('\n')}`);
  }

  const data: Data = {
    sources, realSourceCount: realSources.size, sounds, places, areas, accents, findings, glossary, usingSamples,
    oldIds: index.old, geo, built: shapes.built, contains: shapes.contains, overlaps: shapes.overlaps,
  };
  return { ...derive(data), warnings: ctx.warnings };
}
