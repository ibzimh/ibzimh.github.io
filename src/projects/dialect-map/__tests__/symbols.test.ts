// The migrated sample data must draw the same dots as the old code did (old-symbols.json came from the old code).
import { describe, expect, it } from 'vitest';
import { features, places, symbolOf, usingSamples } from '../load';
import old from './fixtures/old-symbols.json';

// Canadian raising became a pair (writer, rider). "Present" now reads "different" and "absent" reads "same", so full and ring swap.
const swapped: Record<string, string> = { full: 'ring', ring: 'full' };

describe('sample dots', () => {
  it('are used in dev tests', () => {
    expect(usingSamples).toBe(true);
  });
  it('look the same as before the migration', () => {
    const expected = Object.entries(old as Record<string, string>);
    // the old data was the US only; Britain and Ireland came later
    const usPlaces = places.filter((p) => p.country === 'US');
    const old8 = new Set(expected.map(([k]) => k.split('|')[1]));
    expect(expected).toHaveLength(usPlaces.length * old8.size);
    expect(features.filter((f) => old8.has(f.id))).toHaveLength(old8.size);
    for (const [key, symbol] of expected) {
      const [place, feature] = key.split('|');
      const want = feature === 'canadian-raising' ? (swapped[symbol] ?? symbol) : symbol;
      expect(symbolOf(place, feature), key).toBe(want);
    }
  });
});
