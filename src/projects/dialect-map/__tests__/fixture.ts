// A small valid data set, and helpers to break it.
import { buildData } from '../build';
import type { BuildOpts, DataFile, Geo, RawInput } from '../types';

export const geo: Geo = {
  plateForCountry: (c) => (c === 'US' ? 'us' : null),
  project: (plate) => (plate === 'us' ? { x: 50, y: 50 } : null),
  areas: () => ({ problems: [], built: {}, contains: { 'north-of-england': ['leeds-eng', 'liverpool-eng'] }, overlaps: {} }),
};

export const f = (file: string, text: string): DataFile => ({ file, text });

const sources = `
- key: s1
  short: S1
  citation: A book.
  published: 2006
  data: [1992, 1999]
- key: s2
  short: S2
  citation: Another book.
  published: 2015
  data: [2010, 2014]
`;

const sounds = `
- id: cot-caught
  name: cot–caught merger
  scale: pair
  words: [cot, caught]
  group: mergers-and-splits
  also: LOT–THOUGHT merger
  about: Whether cot and caught sound the same.
- id: dropping-r
  name: dropping r
  scale: change
  from: car
  to: cah
  about: Leaving out the r.
  was: [r-less]
- id: bath
  name: BATH vowel
  scale: options
  word: bath
  options:
    - {id: short, label: "short, like trap"}
    - {id: long, label: "long, like palm"}
  about: Which vowel is in bath.
`;

const places = `# a comment
id,name,region,country,lat,lon,also,rank,was
boston-ma,Boston,MA,US,42.36,-71.06,,1,boston-mass-ma
leeds-eng,Leeds,ENG,GB,53.8,-1.55,,,
liverpool-eng,Liverpool,ENG,GB,53.4,-2.99,Scouseland|The Pool,3,
`;

const areas = `
- id: pa-oh
  name: Pennsylvania and Ohio
  country: US
  units: {set: us-states, ids: [PA, OH]}
- id: north-of-england
  name: North of England
  country: GB
  drawn: north.geojson
- id: merseyside
  name: Merseyside
  country: GB
  around: {place: liverpool-eng, km: 15}
  was: [mersey]
- id: north-not-mersey
  name: North without Merseyside
  country: GB
  of: [north-of-england]
  minus: [mersey]
`;

const accents = `
- id: scouse
  name: Scouse
  country: GB
  tie: place
  where: Liverpool and around.
  core: [merseyside]
  wider: [north-of-england]
  group: Northern England
  parent: northern-english
  listen:
    - {label: A clip, url: "https://example.com/clip"}
- id: northern-english
  name: Northern English
  country: GB
  tie: place
  where: The north.
  core: [north-of-england]
  group: Northern England
- id: rp
  name: RP
  country: GB
  tie: social
  where: Among some educated speakers.
  also: Received Pronunciation
`;

const findings = `# comment
place,accent,feature,value,source,page,added,checked,mode,ages,who,note
boston-ma,,cot-caught,same,s1,61,2026-01-01,2026-01-02,,,,
boston-ma,,cot-caught,different,s2,12,2026-02-01,2026-02-02,,,,
boston-ma,,bath,short,s1,3,2026-01-01,2026-01-02,,,,
leeds-eng,,dropping-r,yes,s1,5,2026-01-01,2026-01-02,,,,
,scouse,dropping-r,yes,s1,5,2026-01-01,2026-01-02,,,,
north-of-england,,bath,short,s1,9,2026-01-01,2026-01-02,,,,
boston-ma,,dropping-r,yes,s1,5,2026-01-01,,,,,
`;

export const SHAPE = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });

export function valid(): RawInput {
  return {
    sources: [f('sources.yaml', sources)],
    features: [f('features/sounds.yaml', sounds)],
    places: [f('places/places.csv', places)],
    areas: [f('areas/areas.yaml', areas)],
    shapes: [f('areas/shapes/north.geojson', SHAPE)],
    accents: [f('accents/accents.yaml', accents)],
    findings: [f('findings/findings.csv', findings)],
    glossary: [f('glossary.yaml', '- term: merger\n  also: [merge]\n  plain: Two sounds that became one.\n')],
  };
}

export const opts: BuildOpts = { dev: false, today: '2026-06-01', geo };

export const build = (input: RawInput, o: Partial<BuildOpts> = {}) => buildData(input, { ...opts, ...o });

/** The error message from building `input`, or '' when it builds. */
export function fail(input: RawInput, o: Partial<BuildOpts> = {}): string {
  try {
    build(input, o);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
}

/** valid() with one folder's files replaced by a single file. */
export function with_(folder: keyof Omit<RawInput, 'sample'>, file: string, text: string): RawInput {
  return { ...valid(), [folder]: [f(file, text)] };
}

/** valid() with one text snippet swapped inside a folder's first file. */
export function edit(folder: keyof Omit<RawInput, 'sample'>, from: string | RegExp, to: string): RawInput {
  const base = valid();
  const [first, ...rest] = base[folder];
  const found = typeof from === 'string' ? first.text.includes(from) : from.test(first.text);
  if (!found) throw new Error(`fixture has no ${from}`);
  return { ...base, [folder]: [{ ...first, text: first.text.replace(from, () => to) }, ...rest] };
}
