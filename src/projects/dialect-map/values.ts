// The answers a sound can have, with plain labels and dot symbols.
import { mixedValue, optionSymbols, scales, type ValueDef } from './config';
import type { Feature } from './types';

export function valuesOf(f: Pick<Feature, 'scale' | 'options'>): ValueDef[] {
  if (f.scale === 'options') return [...f.options.map((o, i) => ({ id: o.id, label: o.label, symbol: optionSymbols[i] })), mixedValue];
  return [...(scales[f.scale]?.values ?? [])];
}

export const valueDef = (f: Pick<Feature, 'scale' | 'options'>, id: string): ValueDef | undefined => valuesOf(f).find((v) => v.id === id);
