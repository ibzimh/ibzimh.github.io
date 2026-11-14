import { describe, expect, it } from 'vitest';
import { usingSamples } from '../load';

describe('sample dots', () => {
  it('are used in dev tests', () => {
    expect(usingSamples).toBe(true);
  });
});
