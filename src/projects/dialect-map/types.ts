// Shapes of the checked data. Build time only.
import type { DotSymbol, Mode, ScaleId } from './config';
import type { AreaDef, BuiltArea } from './geo/areas';
import type { AreaOverlap } from './geo/relations';

export interface DataFile {
  file: string; // path under data/, used in messages
  text: string;
}

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

export interface SoundOption {
  id: string;
  label: string;
}

/** A "feature" in findings.csv. */
export interface Feature {
  id: string;
  name: string;
  also: string[];
  group: string | null;
  scale: ScaleId;
  words: string[]; // pair
  from: string; // change
  to: string;
  word: string; // options
  options: SoundOption[];
  examples: string[];
  about: string;
  was: string[];
}

export interface Place {
  id: string;
  name: string;
  region: string;
  regionName: string;
  country: string;
  lat: number;
  lon: number;
  also: string[];
  rank: 1 | 2 | 3;
  was: string[];
  plate: string | null; // null while the country's plate does not exist yet
  x: number | null; // percent of the plate box
  y: number | null;
}

export type AreaMade =
  | { kind: 'units'; set: string; ids: string[] }
  | { kind: 'drawn'; file: string }
  | { kind: 'around'; place: string; km: number }
  | { kind: 'of'; of: string[]; minus: string[] };

export interface Area {
  id: string;
  name: string;
  country: string;
  made: AreaMade;
  edge: 'exact' | 'rough';
  outlineFrom: string;
  closeup: string;
  also: string[];
  was: string[];
  shape: unknown; // parsed GeoJSON of a `drawn` area, else null
}

export interface Listen {
  label: string;
  url: string;
}

export interface Accent {
  id: string;
  name: string;
  country: string;
  tie: 'place' | 'social';
  where: string;
  core: string[];
  wider: string[];
  also: string[];
  group: string;
  parent: string;
  who: string;
  about: string;
  listen: Listen[];
  was: string[];
}

export interface GlossaryEntry {
  term: string;
  also: string[];
  plain: string;
}

export interface Subject {
  type: 'place' | 'accent'; // "place" is a dot or an area
  id: string;
}

export interface Finding {
  line: number; // line in the CSV (header = 1)
  file: string;
  subject: Subject;
  place: string; // '' when the finding is about an accent
  accent: string;
  feature: string;
  value: string; // a value id of the sound's scale
  symbol: DotSymbol;
  source: string;
  page: string;
  mode: Mode | null;
  ages: string;
  who: string;
  note: string;
  added: string; // YYYY-MM-DD
  checked: string; // '' for a draft
  draft: boolean;
}

export interface Cell {
  shown: Finding | null; // newest data wins
  all: Finding[]; // newest first
  differ: boolean; // more than one value from more than one source
  ageSplit: boolean; // one source gives different values for different ages
}

export type IdType = 'sound' | 'place' | 'area' | 'accent';
export type OldIds = Record<IdType, Record<string, string>>;

export interface Geo {
  /** Id of the plate that draws this country, or null while it has none. */
  plateForCountry(country: string): string | null;
  /** Position as percent of the plate box, or null if the point is off the plate. */
  project(plateId: string, lat: number, lon: number): { x: number; y: number } | null;
  /** Builds the shapes of areas and finds which dots fall inside them. Left out: no shapes, nothing contained. */
  areas?(defs: AreaDef[], dots: { id: string; lat: number; lon: number }[]): AreasResult;
}

export interface AreasResult {
  /** Plain-English problems, each starting `Area "id": ` when about one area. */
  problems: string[];
  built: Record<string, BuiltArea[]>; // by plate id
  contains: Record<string, string[]>; // dot ids, by area id
  overlaps: Record<string, AreaOverlap[]>; // by plate id
}

export interface RawInput {
  sources: DataFile[];
  features: DataFile[];
  places: DataFile[];
  areas: DataFile[];
  shapes: DataFile[];
  accents: DataFile[];
  findings: DataFile[];
  glossary: DataFile[];
  sample?: { findings: DataFile[]; areas: DataFile[]; accents: DataFile[]; shapes?: DataFile[] };
}

export interface BuildOpts {
  dev: boolean;
  today: string;
  geo?: Geo;
}
