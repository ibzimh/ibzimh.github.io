// What the browser needs, as one small JSON-able object. Build time only. map.ts reads the same shape.
import { modes, noneLabel, symbols, valueInfo, type DotSymbol } from './config';
import { cell, featureGroups, featureSources, findings, pageText, places, sourceById } from './load';
import type { Finding } from './load';

export type Sym = DotSymbol;
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
    places: places.map((p) => ({ id: p.id, n: p.name, r: p.region, rn: p.regionName, x: p.x, y: p.y })),
    features: feats.map((f) => ({ id: f.id, name: f.name, also: f.also, kind: f.kind, ex: f.examples, about: f.about })),
    first: firstId,
    kinds: Object.fromEntries(
      featureGroups.map(({ kind }) => [
        kind.id,
        {
          label: kind.label,
          plural: kind.plural,
          legend: [
            ...kind.values.map((v) => ({ l: valueInfo[v].label, s: valueInfo[v].symbol })),
            { l: noneLabel, s: 'none' as Sym },
          ].sort((a, b) => symbols.indexOf(a.s) - symbols.indexOf(b.s)),
        },
      ]),
    ),
    sources: srcKeys.map((k) => {
      const s = sourceById.get(k)!;
      return { short: s.short, yrs: yearsText(s.data) };
    }),
    findings: findings.map((f) => ({
      v: valueInfo[f.value].label,
      y: f.symbol,
      s: srcKeys.indexOf(f.source),
      p: pageText(f.page),
      m: f.mode ? modes[f.mode] : '',
      a: f.ages,
      n: f.note,
    })),
    cells: feats.map((f) =>
      places.map((p) => {
        const c = cell(p.id, f.id);
        return c.shown ? { h: fIdx.get(c.shown)!, f: c.all.map((x) => fIdx.get(x)!), d: c.differ ? 1 : 0, g: c.ageSplit ? 1 : 0 } : 0;
      }),
    ),
    fsrc: feats.map((f) => featureSources(f.id).map((x) => [srcKeys.indexOf(x.source.key), x.places] as [number, number])),
  };
}
