/*
 * Dialect map data: read, check, and derive. Build time only (never import from client code).
 *
 * Reading goes through `buildData(input, opts)`, a pure function (the tests call it with broken files).
 * The module then runs it once on the real files and re-exports the result:
 *
 *   places, features, sources, findings   parsed and checked lists. features keep features.yaml order.
 *   placeById, featureById, sourceById    lookups by id/key. Finding.place/.feature/.source are those ids.
 *   usingSamples                          true only in dev with an empty findings.csv (then `sources`
 *                                         holds the two built-in sample sources instead of the real ones)
 *   featureGroups                         [{ kind, features }] for the picker, kinds that have features only
 *   cell(placeId, featureId)              { shown, all (newest first), differ, ageSplit } for one dot
 *   symbolOf(placeId, featureId)          DotSymbol of the shown finding, or 'none'
 *   counts(featureId)                     { full, near, half, ring, none }, sums to places.length
 *   legend(kindId)                        [{ value, label, symbol }] in legend order, ends with "Nothing recorded"
 *   featureSources(featureId)             [{ source, places }] sources used by a feature, newest first
 *   differCount(featureId)                number of places where sources differ
 *   recent(n = 10)                        newest findings by `added`, then row order
 *   sourceStats                           [{ source, findings, features (ids), places }] one per source
 *   stats                                 { places, features, sources, lastAdded (string | null) }
 *
 * Finding.page is free text shown after the source; digits or a digit range ("61", "61-63") display as "p. 61" (see pageText). Optional fields are '' (or null for mode).
 * Place.x/y are percent of the basemap box. The map itself comes from basemap.ts (baseMap(place.map)).
 * Any problem in any file throws one Error listing all of them.
 */
import { parse as parseYaml } from 'yaml';
import { parseCsv, type CsvRow } from './csv';
import { baseMap } from './basemap';
import {
  kinds, modes, noneLabel, symbols, usStates, valueInfo, mapForCountry,
  type DotSymbol, type Kind, type KindId, type MapId, type Mode, type Value,
} from './config';
import sourcesRaw from './data/sources.yaml?raw';
import featuresRaw from './data/features.yaml?raw';
import placesRaw from './data/places.csv?raw';
import findingsRaw from './data/findings.csv?raw';
import samplesRaw from './data/samples.csv?raw';

export interface Source {
  key: string;
  short: string;
  citation: string;
  published: number;
  data: [number, number]; // years collected, from and to
  how: string;
  link: string;
  sample: boolean;
}

export interface Feature {
  id: string;
  name: string;
  also: string;
  kind: KindId;
  examples: string[];
  about: string;
}

export interface Place {
  id: string;
  name: string;
  region: string;
  regionName: string;
  country: string;
  lat: number;
  lon: number;
  map: MapId;
  x: number; // percent of the map box
  y: number;
}

export interface Finding {
  line: number; // line in the CSV (header = 1)
  place: string;
  feature: string;
  value: Value;
  symbol: DotSymbol;
  source: string;
  page: string;
  mode: Mode | null;
  ages: string;
  note: string;
  added: string; // YYYY-MM-DD
}

export interface Cell {
  shown: Finding | null; // newest data wins
  all: Finding[]; // newest first
  differ: boolean; // more than one value from more than one source
  ageSplit: boolean; // one source gives different values for different ages
}

export interface RawInput {
  sources: string;
  features: string;
  places: string;
  findings: string;
  samples: string;
}

const sampleSources: Source[] = [
  {
    key: 'sample', short: 'Sample', citation: 'Made-up rows to show the layout. Not real data.',
    published: new Date().getFullYear(), data: [new Date().getFullYear(), new Date().getFullYear()],
    how: '', link: '', sample: true,
  },
  {
    key: 'sample-b', short: 'Sample B', citation: 'Made-up older rows to show sources disagreeing. Not real data.',
    published: 2000, data: [1990, 1995], how: '', link: '', sample: true,
  },
];

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUM = /^-?\d+(\.\d+)?$/;
const kindById = new Map<string, Kind>(kinds.map((k) => [k.id, k]));

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** ` Did you mean "x"?` for the closest option within 3 edits, else ''. */
function mean(word: string, options: Iterable<string>): string {
  let best = '';
  let bestD = 4;
  for (const o of options) {
    const d = distance(word, o);
    if (d > 0 && d < bestD) [best, bestD] = [o, d];
  }
  return best ? ` Did you mean "${best}"?` : '';
}

/** "61" or "61-63" shows as "p. 61"; anything else ("map 8") shows as typed. */
export const pageText = (page: string) => (/^\d+(\s*[-–]\s*\d+)?$/.test(page) ? `p. ${page}` : page);

const orList = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

function validDate(s: string, today: string): string | null {
  if (!DATE.test(s)) return `"${s}" isn't a date. Use YYYY-MM-DD.`;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return `"${s}" isn't a real date.`;
  if (s > today) return `"${s}" is in the future.`;
  return null;
}

/** Newest data first: later data end year, then later publication, then later row. */
function newest(sources: Map<string, Source>) {
  return (a: Finding, b: Finding) => {
    const sa = sources.get(a.source)!;
    const sb = sources.get(b.source)!;
    return sb.data[1] - sa.data[1] || sb.published - sa.published || b.line - a.line;
  };
}

export function buildData(input: RawInput, opts: { dev: boolean; today: string }) {
  const problems: string[] = [];
  const problem = (where: string, msg: string) => problems.push(`  ${where}: ${msg}`);

  // CSV tables: exact header (order free), then rows keyed by column name.
  type Row = Record<string, string> & { line: number; bad?: string };
  function table(file: string, text: string, required: string[], optional: string[]): Row[] {
    let raw: CsvRow[];
    try {
      raw = parseCsv(text);
    } catch (e) {
      problem(file, (e as Error).message);
      return [];
    }
    if (!raw.length) {
      problem(file, 'is empty. It needs a header row.');
      return [];
    }
    const head = raw[0].cells.map((c) => c.trim());
    const known = [...required, ...optional];
    let bad = false;
    for (const c of required) {
      if (!head.includes(c)) problem(`${file} line 1`, `missing column "${c}".`), (bad = true);
    }
    head.forEach((c, i) => {
      if (!known.includes(c)) problem(`${file} line 1`, `unknown column "${c}".${mean(c, known)}`), (bad = true);
      else if (head.indexOf(c) !== i) problem(`${file} line 1`, `column "${c}" appears twice.`), (bad = true);
    });
    if (bad) return [];
    const rows: Row[] = [];
    for (const r of raw.slice(1)) {
      const row = { line: r.line } as Row;
      if (r.cells.length !== head.length) row.bad = `has ${r.cells.length} columns, expected ${head.length}. Quote any text that contains a comma.`;
      else head.forEach((c, i) => (row[c] = r.cells[i].trim()));
      rows.push(row);
    }
    return rows;
  }

  // YAML lists: array of plain objects, each labelled by its id/key or "entry N".
  function entries(file: string, text: string, fields: string[], idField: string) {
    let doc: unknown;
    try {
      doc = parseYaml(text) ?? [];
    } catch (e) {
      problem(file, (e as Error).message.split('\n')[0]);
      return [];
    }
    if (!Array.isArray(doc)) {
      problem(file, 'should be a list of entries, each starting with "- ".');
      return [];
    }
    const out: { at: string; o: Record<string, unknown> }[] = [];
    doc.forEach((o, i) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return problem(`${file} entry ${i + 1}`, 'should have named fields.');
      const rec = o as Record<string, unknown>;
      const id = rec[idField];
      const at = `${file} ${typeof id === 'string' && id ? id : `entry ${i + 1}`}`;
      for (const k of Object.keys(rec)) {
        if (!fields.includes(k)) problem(at, `unknown field "${k}".${mean(k, fields)}`);
      }
      out.push({ at, o: rec });
    });
    return out;
  }
  const text = (at: string, o: Record<string, unknown>, k: string, required = true): string => {
    const v = o[k];
    if (v === undefined || v === null || v === '') {
      if (required) problem(at, `needs ${k}.`);
      return '';
    }
    if (typeof v !== 'string') {
      problem(at, `${k} should be text.`);
      return '';
    }
    return v.trim();
  };
  const year = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

  // Sources
  const realSources = new Map<string, Source>();
  for (const { at, o } of entries('sources.yaml', input.sources, ['key', 'short', 'citation', 'published', 'data', 'how', 'link'], 'key')) {
    const key = text(at, o, 'key');
    if (key && !KEY.test(key)) problem(at, `key "${key}" should use lowercase letters, numbers and dashes.`);
    else if (key && (realSources.has(key) || sampleSources.some((s) => s.key === key))) problem(at, `key "${key}" is used twice (or reserved).`);
    const published = o.published;
    if (!year(published)) problem(at, 'published should be a year, like 2006.');
    const [from, to] = Array.isArray(o.data) ? o.data : [];
    if (!Array.isArray(o.data) || o.data.length !== 2 || !year(from) || !year(to)) problem(at, 'data should be two years, like [1992, 1999].');
    else if (from > to) problem(at, `data years go backwards (${from} to ${to}).`);
    else if (year(published) && to > (published as number) + 1) problem(at, `data ends in ${to}, after it was published (${published}).`);
    const link = text(at, o, 'link', false);
    if (link) {
      try {
        new URL(link);
      } catch {
        problem(at, `link "${link}" isn't a web address.`);
      }
    }
    if (key) {
      realSources.set(key, {
        key, short: text(at, o, 'short'), citation: text(at, o, 'citation'), published: published as number,
        data: [from as number, to as number], how: text(at, o, 'how', false), link, sample: false,
      });
    }
  }

  // Features
  const features = new Map<string, Feature>();
  for (const { at, o } of entries('features.yaml', input.features, ['id', 'name', 'also', 'kind', 'examples', 'about'], 'id')) {
    const id = text(at, o, 'id');
    if (id && !KEY.test(id)) problem(at, `id "${id}" should use lowercase letters, numbers and dashes.`);
    else if (features.has(id)) problem(at, `id "${id}" is used twice.`);
    const kind = text(at, o, 'kind');
    if (kind && !kindById.has(kind)) problem(at, `"${kind}" isn't a kind.${mean(kind, kindById.keys())} Use ${orList(kinds.map((k) => k.id))}.`);
    const ex = o.examples;
    if (!Array.isArray(ex) || !ex.length || ex.some((e) => typeof e !== 'string' || !e.trim())) problem(at, 'needs at least one example, as a list of text.');
    if (id) {
      features.set(id, {
        id, name: text(at, o, 'name'), also: text(at, o, 'also', false), kind: kind as KindId,
        examples: Array.isArray(ex) ? ex.map(String) : [], about: text(at, o, 'about'),
      });
    }
  }

  // Places
  const places = new Map<string, Place>();
  const placeLine = new Map<string, number>();
  for (const r of table('places.csv', input.places, ['id', 'name', 'region', 'country', 'lat', 'lon'], [])) {
    const at = `places.csv line ${r.line}`;
    if (r.bad) {
      problem(at, r.bad);
      continue;
    }
    for (const c of ['id', 'name', 'region', 'country']) if (!r[c]) problem(at, `needs ${c}.`);
    if (r.id && !KEY.test(r.id)) problem(at, `id "${r.id}" should use lowercase letters, numbers and dashes.`);
    else if (r.id && r.region && !r.id.endsWith(`-${r.region.toLowerCase()}`)) problem(at, `id "${r.id}" should end with "-${r.region.toLowerCase()}".`);
    if (placeLine.has(r.id)) problem(at, `id "${r.id}" is used twice (first on line ${placeLine.get(r.id)}).`);
    else placeLine.set(r.id, r.line);
    const map = r.country ? mapForCountry(r.country) : undefined;
    if (r.country && !map) problem(at, `no map covers country "${r.country}".`);
    if (r.country === 'US' && r.region && !usStates[r.region]) problem(at, `"${r.region}" isn't a US state code.${mean(r.region, Object.keys(usStates))}`);
    const lat = NUM.test(r.lat) ? Number(r.lat) : NaN;
    const lon = NUM.test(r.lon) ? Number(r.lon) : NaN;
    if (!(Math.abs(lat) <= 90)) problem(at, `lat "${r.lat}" should be a number from -90 to 90.`);
    if (!(Math.abs(lon) <= 180)) problem(at, `lon "${r.lon}" should be a number from -180 to 180.`);
    let xy = null;
    if (map && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      xy = baseMap(map.id).project(lat, lon);
      if (!xy) problem(at, `${r.name || r.id} (${r.lat}, ${r.lon}) falls outside the ${map.name} map.`);
    }
    if (r.id) {
      places.set(r.id, {
        id: r.id, name: r.name, region: r.region, regionName: usStates[r.region] ?? r.region, country: r.country,
        lat, lon, map: map?.id as MapId, x: xy?.x ?? 0, y: xy?.y ?? 0,
      });
    }
  }

  // Findings: the real file, or the samples in dev when the real file has no rows.
  const cols = ['place', 'feature', 'value', 'source', 'page', 'added'];
  const optCols = ['mode', 'ages', 'note'];
  let file = 'findings.csv';
  let rows = table(file, input.findings, cols, optCols);
  const usingSamples = opts.dev && !/\S/.test(input.findings.replace(/^[^\r\n]*/, ''));
  if (usingSamples) {
    file = 'samples.csv';
    rows = table(file, input.samples, cols, optCols);
  }
  const sources = new Map<string, Source>(usingSamples ? sampleSources.map((s) => [s.key, s]) : realSources);

  const findings: Finding[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    const at = `${file} line ${r.line}`;
    if (r.bad) {
      problem(at, r.bad);
      continue;
    }
    for (const c of cols) if (!r[c]) problem(at, `needs ${c}.`);
    if (r.place && !places.has(r.place)) problem(at, `no place called "${r.place}".${mean(r.place, places.keys())}`);
    if (r.source && !sources.has(r.source)) problem(at, `no source called "${r.source}".${mean(r.source, sources.keys())}`);
    const feat = features.get(r.feature);
    if (r.feature && !feat) problem(at, `no feature called "${r.feature}".${mean(r.feature, features.keys())}`);
    const kind = feat && kindById.get(feat.kind);
    if (r.value && kind && !(kind.values as readonly string[]).includes(r.value)) {
      problem(at, `"${r.value}" isn't a value for ${feat.id} (kind: ${kind.label.toLowerCase()}).${mean(r.value, kind.values)} Use ${orList(kind.values)}.`);
    }
    if (r.mode && !(r.mode in modes)) problem(at, `"${r.mode}" isn't a mode.${mean(r.mode, Object.keys(modes))} Use ${orList(Object.keys(modes))}, or leave it empty.`);
    if (r.added) {
      const bad = validDate(r.added, opts.today);
      if (bad) problem(at, `added: ${bad}`);
    }
    const key = [r.place, r.feature, r.source, r.mode, r.ages].join('|');
    if (seen.has(key)) problem(at, `same place, feature, source, mode and ages as line ${seen.get(key)}.`);
    else seen.set(key, r.line);
    const info = valueInfo[r.value as Value];
    findings.push({
      line: r.line, place: r.place, feature: r.feature, value: r.value as Value, symbol: info?.symbol ?? 'none',
      source: r.source, page: r.page, mode: (r.mode || null) as Mode | null, ages: r.ages, note: r.note, added: r.added,
    });
  }

  // Warnings: dev only, never fail.
  if (opts.dev && !usingSamples) {
    const used = new Set(findings.map((f) => f.source));
    for (const s of realSources.values()) if (!used.has(s.key)) console.warn(`Dialect map: source "${s.key}" has no findings.`);
  }

  if (problems.length) {
    throw new Error(`Dialect map data has ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}:\n${problems.join('\n')}`);
  }

  // Derived data (all inputs are valid from here)
  const placeList = [...places.values()];
  const featureList = [...features.values()];
  const sourceList = [...sources.values()];
  const cmp = newest(sources);
  const byCell = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = `${f.place}|${f.feature}`;
    byCell.set(k, [...(byCell.get(k) ?? []), f]);
  }

  const cells = new Map<string, Cell>();
  function cell(placeId: string, featureId: string): Cell {
    const k = `${placeId}|${featureId}`;
    let c = cells.get(k);
    if (c) return c;
    const all = [...(byCell.get(k) ?? [])].sort(cmp);
    let shown: Finding | null = null;
    if (all.length) {
      const top = all.filter((f) => f.source === all[0].source).sort((a, b) => a.line - b.line);
      shown = top.find((f) => !f.ages) ?? top[0];
    }
    const bySource = Map.groupBy(all, (f) => f.source);
    c = {
      shown,
      all,
      differ: new Set(all.map((f) => f.value)).size > 1 && bySource.size > 1,
      ageSplit: [...bySource.values()].some((g) => new Set(g.map((f) => f.value)).size > 1 && new Set(g.map((f) => f.ages)).size > 1),
    };
    cells.set(k, c);
    return c;
  }

  const symbolOf = (placeId: string, featureId: string): DotSymbol => cell(placeId, featureId).shown?.symbol ?? 'none';

  function counts(featureId: string): Record<DotSymbol, number> {
    const n: Record<DotSymbol, number> = { full: 0, near: 0, half: 0, ring: 0, none: 0 };
    for (const p of placeList) n[symbolOf(p.id, featureId)]++;
    return n;
  }

  function legend(kindId: KindId) {
    const kind = kindById.get(kindId)!;
    return [
      ...kind.values.map((value) => ({ value: value as Value | null, label: valueInfo[value].label, symbol: valueInfo[value].symbol })),
      { value: null, label: noneLabel, symbol: 'none' as DotSymbol },
    ].sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));
  }

  const used = (pred: (f: Finding) => boolean) => findings.filter(pred);
  function featureSources(featureId: string) {
    const rowsOf = used((f) => f.feature === featureId);
    return sourceList
      .filter((s) => rowsOf.some((f) => f.source === s.key))
      .sort((a, b) => b.data[1] - a.data[1] || b.published - a.published)
      .map((source) => ({ source, places: new Set(rowsOf.filter((f) => f.source === source.key).map((f) => f.place)).size }));
  }

  const differCount = (featureId: string) => placeList.filter((p) => cell(p.id, featureId).differ).length;

  const recent = (n = 10) =>
    [...findings].sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : b.line - a.line)).slice(0, n);

  const sourceStats = sourceList.map((source) => {
    const rowsOf = used((f) => f.source === source.key);
    const ids = new Set(rowsOf.map((f) => f.feature));
    return {
      source,
      findings: rowsOf.length,
      features: featureList.filter((f) => ids.has(f.id)).map((f) => f.id),
      places: new Set(rowsOf.map((f) => f.place)).size,
    };
  });

  const featureGroups = kinds
    .map((kind) => ({ kind, features: featureList.filter((f) => f.kind === kind.id) }))
    .filter((g) => g.features.length);

  const stats = {
    places: placeList.length,
    features: featureList.length,
    sources: usingSamples ? 1 : realSources.size,
    lastAdded: findings.reduce<string | null>((m, f) => (!m || f.added > m ? f.added : m), null),
  };

  return {
    places: placeList, features: featureList, sources: sourceList, findings, usingSamples,
    placeById: places, featureById: features, sourceById: sources,
    featureGroups, cell, symbolOf, counts, legend, featureSources, differCount, recent, sourceStats, stats,
  };
}

const data = buildData(
  { sources: sourcesRaw, features: featuresRaw, places: placesRaw, findings: findingsRaw, samples: samplesRaw },
  { dev: import.meta.env.DEV, today: new Date().toISOString().slice(0, 10) },
);

export const {
  places, features, sources, findings, usingSamples, placeById, featureById, sourceById,
  featureGroups, cell, symbolOf, counts, legend, featureSources, differCount, recent, sourceStats, stats,
} = data;
