// The data one atlas page needs in the browser: one small object per plate. Build time only.
import type { buildData } from './build';
import { plate as getPlate, plates, type PlateId } from './geo/plates';
import type { Feature, Finding } from './types';

type Built = ReturnType<typeof buildData>;

export interface AtlasShown {
  v: string; // the shown value (newest data wins)
  i: number[]; // indexes into findings, newest first
  d?: 1; // sources differ
  a?: 1; // one source splits by age
  dr?: 1; // the shown finding is a draft
}

export interface AtlasSound {
  id: string;
  name: string;
  also: string;
  scale: 'pair' | 'change' | 'options';
  words?: string[];
  from?: string;
  to?: string;
  word?: string;
  options?: { id: string; label: string }[];
  about: string;
}

export interface AtlasDerivedSound {
  n: number; // subjects with a finding on this plate; 0 means no data here
  c: Record<'place' | 'area' | 'accent', Record<string, number>>;
  shown: Record<string, AtlasShown>; // key is "place:id", "area:id" or "accent:id"
  other: Record<string, number>; // other plates with data -> places with a finding there
}

export interface Atlas {
  sample: boolean;
  plate: {
    id: string; name: string; title: string; w: number; h: number; km: number;
    land: string; landFine: string; borders: string; bordersFine: string;
    nations: { text: string; x: number; y: number }[];
  };
  dots: { id: string; name: string; region: string; x: number; y: number; rank: 1 | 2 | 3 }[];
  areas: {
    id: string; name: string; path: string; loop?: string; x: number; y: number; size: number;
    edge: 'exact' | 'rough'; contains: string[]; closeup: boolean;
  }[];
  sounds: AtlasSound[];
  accents: {
    id: string; name: string; also: string; group: string; tie: 'place' | 'social'; parent: string;
    core: string[]; wider: string[]; where: string;
  }[];
  findings: { t: 'place' | 'area' | 'accent'; s: string; f: string; v: string; src: string; ag?: string; n?: string; d?: 1 }[];
  sources: { key: string; short: string; citation: string; years: string }[];
  derived: {
    sounds: Record<string, AtlasDerivedSound>;
    accents: Record<string, number[]>; // accent id -> indexes into findings
    dots: Record<string, { a: string[]; c: string[]; w: string[] }>; // areas containing it, accents that are core / wider here
  };
  /** Names on the other plates, so search can send you there. */
  elsewhere: { id: string; name: string; accents: [string, string, string][]; places: [string, string][] }[];
}

/** A sound as the browser sees it: only the fields its scale uses. */
export const toAtlasSound = (s: Feature): AtlasSound => ({
  id: s.id, name: s.name, also: s.also.join(', '), scale: s.scale, about: s.about,
  ...(s.scale === 'pair' ? { words: s.words } : s.scale === 'change' ? { from: s.from, to: s.to } : { word: s.word, options: s.options }),
});

const r1 = (n: number) => Math.round(n * 10) / 10;
const years = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

export function buildAtlas(d: Built, plateId: PlateId): Atlas {
  const pl = getPlate(plateId);
  const dots = d.places.filter((p) => p.plate === plateId && p.x !== null && p.y !== null);
  const dotIds = new Set(dots.map((p) => p.id));
  const built = d.builtAreas(plateId).filter((b) => b.path);
  const areaIds = new Set(built.map((b) => b.id));
  const plateOfCountry = (c: string) => plates.find((p) => p.countries.includes(c))?.id;
  const accents = d.accents.filter((a) => plateOfCountry(a.country) === plateId);
  const accentIds = new Set(accents.map((a) => a.id));

  const subjectKey = (f: Finding) => `${f.subject.type === 'accent' ? 'accent' : areaIds.has(f.subject.id) ? 'area' : 'place'}:${f.subject.id}`;
  const onPlate = (f: Finding) => (f.subject.type === 'accent' ? accentIds.has(f.subject.id) : dotIds.has(f.subject.id) || areaIds.has(f.subject.id));
  const findings = d.findings.filter(onPlate);
  const index = new Map(findings.map((f, i) => [f, i]));
  const usedSources = new Set(findings.map((f) => f.source));

  const subjects = [
    ...dots.map((p) => ({ type: 'place' as const, key: `place:${p.id}`, subject: { type: 'place' as const, id: p.id } })),
    ...built.map((b) => ({ type: 'area' as const, key: `area:${b.id}`, subject: { type: 'place' as const, id: b.id } })),
    ...accents.map((a) => ({ type: 'accent' as const, key: `accent:${a.id}`, subject: { type: 'accent' as const, id: a.id } })),
  ];

  const sounds: Record<string, AtlasDerivedSound> = {};
  for (const s of d.features) {
    const one: AtlasDerivedSound = { n: 0, c: { place: {}, area: {}, accent: {} }, shown: {}, other: {} };
    for (const sub of subjects) {
      const c = d.cell(sub.subject, s.id);
      if (!c.shown) continue;
      const e: AtlasShown = { v: c.shown.value, i: c.all.map((f) => index.get(f)).filter((i): i is number => i !== undefined) };
      if (c.differ) e.d = 1;
      if (c.ageSplit) e.a = 1;
      if (c.shown.draft) e.dr = 1;
      one.shown[sub.key] = e;
      one.n++;
      one.c[sub.type][e.v] = (one.c[sub.type][e.v] ?? 0) + 1;
    }
    for (const other of plates) {
      if (other.id === plateId) continue;
      const n = d.places.filter((p) => p.plate === other.id && d.placeCell(p.id, s.id).shown).length;
      if (n) one.other[other.id] = n;
    }
    sounds[s.id] = one;
  }

  const insideOf = new Map<string, string[]>();
  for (const p of dots) insideOf.set(p.id, d.areasOfDot(p.id).map((a) => a.id).filter((id) => areaIds.has(id)));
  const containsOf = new Map(built.map((b) => [b.id, dots.filter((p) => insideOf.get(p.id)!.includes(b.id)).map((p) => p.id)]));

  const sourceKeys = d.sources.filter((s) => usedSources.has(s.key));

  return {
    sample: d.usingSamples,
    plate: {
      id: plateId, name: pl.name, title: `Accents of ${plateId === 'us' ? 'the ' : ''}${pl.name}`, w: pl.width, h: pl.height, km: pl.kmPerUnit,
      land: pl.land, landFine: pl.landFine, borders: pl.borders, bordersFine: pl.bordersFine,
      nations: pl.nations.map((n) => ({ text: n.text, x: r1(n.x), y: r1(n.y) })),
    },
    dots: dots.map((p) => ({ id: p.id, name: p.name, region: p.regionName, x: r1((p.x! * pl.width) / 100), y: r1((p.y! * pl.height) / 100), rank: p.rank })),
    areas: built.map((b) => {
      const a = d.areaById.get(b.id)!;
      const [x0, y0, x1, y1] = b.bbox;
      const at = b.label ?? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      return {
        id: b.id, name: a.name, path: b.path, ...(b.loop ? { loop: b.loop } : {}), x: r1(at.x), y: r1(at.y), size: Math.round(b.size),
        edge: b.edge, contains: containsOf.get(b.id)!, closeup: !!a.closeup,
      };
    }),
    sounds: d.features.map(toAtlasSound),
    accents: accents.map((a) => ({
      id: a.id, name: a.name, also: a.also.join(', '), group: a.group, tie: a.tie, parent: a.parent,
      core: a.core.filter((id) => dotIds.has(id) || areaIds.has(id)), wider: a.wider.filter((id) => dotIds.has(id) || areaIds.has(id)), where: a.where,
    })),
    findings: findings.map((f) => ({
      t: f.subject.type === 'accent' ? 'accent' : areaIds.has(f.subject.id) ? 'area' : 'place', s: f.subject.id, f: f.feature, v: f.value, src: f.source,
      ...(f.ages ? { ag: f.ages } : {}), ...(f.note ? { n: f.note } : {}), ...(f.draft ? { d: 1 as const } : {}),
    })),
    sources: sourceKeys.map((s) => ({ key: s.key, short: s.short, citation: s.citation, years: years(s.data) })),
    derived: {
      sounds,
      accents: Object.fromEntries(accents.map((a) => [a.id, findings.flatMap((f, i) => (subjectKey(f) === `accent:${a.id}` ? [i] : []))])),
      dots: Object.fromEntries(dots.map((p) => {
        const here = d.accentsAtDot(p.id).filter((x) => accentIds.has(x.accent.id));
        return [p.id, {
          a: insideOf.get(p.id)!,
          c: here.filter((x) => x.tier === 'core').map((x) => x.accent.id),
          w: here.filter((x) => x.tier === 'wider').map((x) => x.accent.id),
        }];
      })),
    },
    elsewhere: plates.filter((p) => p.id !== plateId).map((p) => ({
      id: p.id, name: p.name,
      accents: d.accents.filter((a) => plateOfCountry(a.country) === p.id).map((a): [string, string, string] => [a.id, a.name, a.also.join(', ')]),
      places: d.places.filter((x) => x.plate === p.id).map((x): [string, string] => [x.id, x.name]),
    })),
  };
}
