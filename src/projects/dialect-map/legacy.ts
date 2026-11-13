// Old wording for the old page (/p-06/): Merged / Near-merged / In progress / Distinct and Present / Partial / Absent.
// The new data says same / nearly / mixed / different and yes / mixed / no; this maps one to the other.
import { noneLabel, symbols, type DotSymbol } from './config';
import type { Feature } from './types';
import { valueDef } from './values';

export type LegacyKindId = 'merger' | 'shift' | 'sound';

export const legacyKinds = [
  { id: 'merger', label: 'Merger', plural: 'Mergers' },
  { id: 'shift', label: 'Vowel shift', plural: 'Vowel shifts' },
  { id: 'sound', label: 'Other sound', plural: 'Other sounds' },
] as const;

export type LegacyKind = (typeof legacyKinds)[number];

/** What each old label means, shown in the page's word list. */
export const legacyInfo: Record<string, { label: string; symbol: DotSymbol; meaning: string }> = {
  merged: { label: 'Merged', symbol: 'full', meaning: 'the two sounds are the same for people there.' },
  'near-merged': { label: 'Near-merged', symbol: 'near', meaning: "people make a tiny difference when they speak but can't hear it." },
  'in-progress': { label: 'In progress', symbol: 'half', meaning: "mixed; usually younger people have it and older people don't." },
  distinct: { label: 'Distinct', symbol: 'ring', meaning: 'the sounds are kept apart.' },
  present: { label: 'Present', symbol: 'full', meaning: 'the feature is there.' },
  partial: { label: 'Partial', symbol: 'half', meaning: 'the feature is partly there.' },
  absent: { label: 'Absent', symbol: 'ring', meaning: 'the feature is not there.' },
};

const oldName: Record<string, Record<string, string>> = {
  pair: { same: 'merged', nearly: 'near-merged', mixed: 'in-progress', different: 'distinct' },
  change: { yes: 'present', mixed: 'partial', no: 'absent' },
};

/** The old page groups a pair under Mergers, a change under Vowel shifts or Other sounds. */
export const legacyKindOf = (f: Feature): LegacyKindId => (f.scale === 'pair' ? 'merger' : f.group === 'shifts' ? 'shift' : 'sound');

/** Old label and symbol for a finding's value. Options use their own label. */
export function legacyValue(f: Feature, value: string): { label: string; symbol: DotSymbol } {
  const old = oldName[f.scale]?.[value];
  if (old) return legacyInfo[old];
  const def = valueDef(f, value);
  return { label: def?.label ?? value, symbol: def?.symbol ?? 'none' };
}

/** Legend for one feature in legend order, ending with "Nothing recorded". */
export function legacyLegend(f: Feature) {
  const values = f.scale === 'options' ? f.options.map((o) => o.id) : Object.keys(oldName[f.scale]);
  return [
    ...values.map((value) => ({ value: value as string | null, ...legacyValue(f, value) })),
    { value: null, label: noneLabel, symbol: 'none' as DotSymbol },
  ].sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));
}

/** Picker groups: kinds that have features, in the old order. */
export const legacyGroups = (features: Feature[]) =>
  legacyKinds.map((kind) => ({ kind, features: features.filter((f) => legacyKindOf(f) === kind.id) })).filter((g) => g.features.length);

/** Extra example text, or the words themselves when there is none. */
export const examplesOf = (f: Feature) =>
  f.examples.length ? f.examples : f.scale === 'pair' ? [f.words.join(' / ')] : f.scale === 'change' ? [`${f.from} → ${f.to}`] : [f.word];
