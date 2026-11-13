// Everything computed from checked data: cells, counts, lookups. Pure; nothing here reads files.
import type { DotSymbol } from './config';
import type { AreaOverlap } from './geo/relations';
import type { BuiltArea } from './geo/areas';
import type { Accent, Area, Cell, Feature, Finding, GlossaryEntry, Geo, OldIds, Place, Source, Subject } from './types';

export interface Data {
  sources: Map<string, Source>;
  realSourceCount: number;
  sounds: Map<string, Feature>;
  places: Map<string, Place>;
  areas: Map<string, Area>;
  accents: Map<string, Accent>;
  findings: Finding[];
  glossary: GlossaryEntry[];
  usingSamples: boolean;
  oldIds: OldIds;
  geo: Geo;
  built: Record<string, BuiltArea[]>;
  contains: Record<string, string[]>;
  overlaps: Record<string, AreaOverlap[]>;
}

export function derive(d: Data) {
  const placeList = [...d.places.values()];
  const mapPlaces = placeList.filter((p) => p.x !== null);
  const featureList = [...d.sounds.values()];
  const sourceList = [...d.sources.values()];
  const { findings } = d;

  // Newest data first: later data end year, then later publication, then later row.
  const cmp = (a: Finding, b: Finding) => {
    const sa = d.sources.get(a.source)!;
    const sb = d.sources.get(b.source)!;
    return sb.data[1] - sa.data[1] || sb.published - sa.published || b.line - a.line;
  };

  const keyOf = (s: Subject, featureId: string) => `${s.type}|${s.id}|${featureId}`;
  const byCell = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = keyOf(f.subject, f.feature);
    byCell.set(k, [...(byCell.get(k) ?? []), f]);
  }

  const cells = new Map<string, Cell>();
  function cell(subject: Subject, featureId: string): Cell {
    const k = keyOf(subject, featureId);
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

  const placeCell = (placeId: string, featureId: string) => cell({ type: 'place', id: placeId }, featureId);
  const symbolOf = (placeId: string, featureId: string): DotSymbol => placeCell(placeId, featureId).shown?.symbol ?? 'none';

  /** Dots on the old single map, by symbol. Sums to mapPlaces.length. */
  function counts(featureId: string): Record<DotSymbol, number> {
    const n = { full: 0, near: 0, half: 0, ring: 0, none: 0, opt0: 0, opt1: 0, opt2: 0, opt3: 0, opt4: 0, opt5: 0 } satisfies Record<DotSymbol, number>;
    for (const p of mapPlaces) n[symbolOf(p.id, featureId)]++;
    return n;
  }

  /** Dots per plate per value id ("none" when nothing is recorded). */
  function countsByPlate(featureId: string): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const p of placeList) {
      if (!p.plate) continue;
      const v = placeCell(p.id, featureId).shown?.value ?? 'none';
      out[p.plate] ??= {};
      out[p.plate][v] = (out[p.plate][v] ?? 0) + 1;
    }
    return out;
  }

  const plateOf = (s: Subject): string | null => {
    if (s.type === 'place') {
      const hit = d.places.get(s.id) ?? d.areas.get(s.id);
      return hit ? (('plate' in hit ? hit.plate : d.geo.plateForCountry(hit.country)) ?? null) : null;
    }
    const a = d.accents.get(s.id);
    return a ? d.geo.plateForCountry(a.country) : null;
  };

  /** Plates that have at least one finding for this feature. */
  const featurePlates = (featureId: string): string[] => [
    ...new Set(findings.filter((f) => f.feature === featureId).map((f) => plateOf(f.subject)).filter((x): x is string => !!x)),
  ].sort();

  const used = (pred: (f: Finding) => boolean) => findings.filter(pred);
  const subjectKey = (f: Finding) => `${f.subject.type}:${f.subject.id}`;

  function featureSources(featureId: string) {
    const rowsOf = used((f) => f.feature === featureId);
    return sourceList
      .filter((s) => rowsOf.some((f) => f.source === s.key))
      .sort((a, b) => b.data[1] - a.data[1] || b.published - a.published)
      .map((source) => ({ source, places: new Set(rowsOf.filter((f) => f.source === source.key).map(subjectKey)).size }));
  }

  const differCount = (featureId: string) => mapPlaces.filter((p) => placeCell(p.id, featureId).differ).length;

  const recent = (n = 10) =>
    [...findings].sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : b.line - a.line)).slice(0, n);

  const sourceStats = sourceList.map((source) => {
    const rowsOf = used((f) => f.source === source.key);
    const ids = new Set(rowsOf.map((f) => f.feature));
    return {
      source,
      findings: rowsOf.length,
      features: featureList.filter((f) => ids.has(f.id)).map((f) => f.id),
      places: new Set(rowsOf.map(subjectKey)).size,
    };
  });

  const stats = {
    places: placeList.length,
    features: featureList.length,
    sources: d.usingSamples ? 1 : d.realSourceCount,
    lastAdded: findings.reduce<string | null>((m, f) => (!m || f.added > m ? f.added : m), null),
  };

  /** An accent's findings per sound, in sounds order; sounds with nothing recorded are left out. */
  const accentProfile = (accentId: string) =>
    featureList.flatMap((feature) => {
      const c = cell({ type: 'accent', id: accentId }, feature.id);
      return c.shown ? [{ feature, cell: c }] : [];
    });

  // dot id -> ids of the areas that contain it, in area order
  const inAreas = new Map<string, string[]>();
  for (const areaId of d.areas.keys()) for (const dot of d.contains[areaId] ?? []) inAreas.set(dot, [...(inAreas.get(dot) ?? []), areaId]);

  /** Areas that contain a dot. */
  const areasOfDot = (dotId: string): Area[] => (inAreas.get(dotId) ?? []).map((id) => d.areas.get(id)!);

  /** The built shapes on a plate, for drawing. */
  const builtAreas = (plateId: string): BuiltArea[] => d.built[plateId] ?? [];
  /** Pairs of areas on a plate that overlap or sit inside each other. */
  const areaOverlaps = (plateId: string): AreaOverlap[] => d.overlaps[plateId] ?? [];

  /** Accents whose core or wider names the dot or an area containing it. */
  const accentsAtDot = (dotId: string) => {
    const here = new Set([dotId, ...areasOfDot(dotId).map((a) => a.id)]);
    return [...d.accents.values()].flatMap((accent): { accent: Accent; tier: 'core' | 'wider' }[] => {
      if (accent.core.some((r) => here.has(r))) return [{ accent, tier: 'core' as const }];
      if (accent.wider.some((r) => here.has(r))) return [{ accent, tier: 'wider' as const }];
      return [];
    });
  };

  const drafts = () => findings.filter((f) => f.draft);

  /** Accents by sounds: the shown value id, or null. */
  const coverage = () => ({
    sounds: featureList,
    rows: [...d.accents.values()].map((accent) => ({
      accent,
      values: featureList.map((f) => cell({ type: 'accent', id: accent.id }, f.id).shown?.value ?? null),
    })),
  });

  /** Display name of whatever a finding is about. */
  const nameOf = (s: Subject) => (s.type === 'accent' ? d.accents.get(s.id)?.name : (d.places.get(s.id) ?? d.areas.get(s.id))?.name) ?? s.id;

  return {
    places: placeList, mapPlaces, features: featureList, areas: [...d.areas.values()], accents: [...d.accents.values()],
    sources: sourceList, findings, glossary: d.glossary, usingSamples: d.usingSamples,
    placeById: d.places, featureById: d.sounds, areaById: d.areas, accentById: d.accents, sourceById: d.sources,
    oldIds: d.oldIds,
    cell, placeCell, symbolOf, counts, countsByPlate, featurePlates, featureSources, differCount, recent, sourceStats, stats,
    accentProfile, areasOfDot, accentsAtDot, drafts, coverage, nameOf, builtAreas, areaOverlaps,
  };
}
