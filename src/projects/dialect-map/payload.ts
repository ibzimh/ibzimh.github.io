// What the browser needs, as one small JSON-able object. Build time only. map.ts reads the same shape.
import { modes, type DotSymbol } from './config';
import { featureById, featureGroups, featureSources, findings, legend, legacyValue, mapPlaces, pageText, placeCell, sourceById } from './load';
import type { Finding } from './load';
import { examplesOf, legacyKindOf } from './legacy';

/** The five looks the old page draws. */
export type Sym = Exclude<DotSymbol, `opt${number}`>;
export interface Payload {
  places: { id: string; n: string; r: string; rn: string; x: number; y: number }[];
  /** Picker order. */
  features: { id: string; name: string; also: string; kind: string; ex: string[]; about: string }[];
  /** Id of the feature shown first (the first in features.yaml). */
  first: string;
  kinds: Record<string, { label: string; plural: string; legend: { l: string; s: Sym }[] }>;
  sources: { short: string; yrs: string }[];
  findings: { v: string; y: Sym; s: number; p: string; m: string; a: string; n: string }[];
  /** [feature][place]: 0 = nothing recorded, else h = shown finding, f = all findings newest first, d = sources differ, g = split by age. */
  cells: (0 | { h: number; f: number[]; d: 0 | 1; g: 0 | 1 })[][];
  /** Per feature: [source index, number of places]. */
  fsrc: [number, number][][];
}

export const yearsText = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

export function buildPayload(firstId: string): Payload {
  const feats = featureGroups.flatMap((g) => g.features);
  const srcKeys = [...sourceById.keys()];
  const fIdx = new Map<Finding, number>(findings.map((f, i) => [f, i]));
  return {
    places: mapPlaces.map((p) => ({ id: p.id, n: p.name, r: p.region, rn: p.regionName, x: p.x!, y: p.y! })),
    features: feats.map((f) => ({ id: f.id, name: f.name, also: f.also.join(' · '), kind: legacyKindOf(f), ex: examplesOf(f), about: f.about })),
    first: firstId,
    kinds: Object.fromEntries(
      featureGroups.map(({ kind, features }) => [
        kind.id,
        {
          label: kind.label,
          plural: kind.plural,
          // the legend comes from the kind's first feature (the old page has no options sounds)
          legend: legend(features[0]).map((l) => ({ l: l.label, s: l.symbol as Sym })),
        },
      ]),
    ),
    sources: srcKeys.map((k) => {
      const s = sourceById.get(k)!;
      return { short: s.short, yrs: yearsText(s.data) };
    }),
    findings: findings.map((f) => ({
      v: legacyValue(featureById.get(f.feature)!, f.value).label,
      y: f.symbol as Sym,
      s: srcKeys.indexOf(f.source),
      p: pageText(f.page),
      m: f.mode ? modes[f.mode] : '',
      a: f.ages,
      n: f.note,
    })),
    cells: feats.map((f) =>
      mapPlaces.map((p) => {
        const c = placeCell(p.id, f.id);
        return c.shown ? { h: fIdx.get(c.shown)!, f: c.all.map((x) => fIdx.get(x)!), d: c.differ ? 1 : 0, g: c.ageSplit ? 1 : 0 } : 0;
      }),
    ),
    fsrc: feats.map((f) => featureSources(f.id).map((x) => [srcKeys.indexOf(x.source.key), x.places] as [number, number])),
  };
}
