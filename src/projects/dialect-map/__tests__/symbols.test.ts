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
    expect(expected).toHaveLength(places.length * features.length);
    for (const [key, symbol] of expected) {
      const [place, feature] = key.split('|');
      const want = feature === 'canadian-raising' ? (swapped[symbol] ?? symbol) : symbol;
      expect(symbolOf(place, feature), key).toBe(want);
    }
  });
});
