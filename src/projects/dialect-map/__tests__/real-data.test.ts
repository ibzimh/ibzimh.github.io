// Loads the real data folder from disk and builds it with the real geo adapter.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildData } from '../build';
import type { DataFile, RawInput } from '../types';

const root = decodeURIComponent(new URL('../data/', import.meta.url).pathname);
const files = (dir: string, ext: string): DataFile[] => {
  const full = root + dir;
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((n: string) => n.endsWith(ext)).sort().map((n: string) => ({ file: `${dir}/${n}`, text: fs.readFileSync(`${full}/${n}`, 'utf8') }));
};

const input = (): RawInput => ({
  sources: files('.', 'sources.yaml'),
  features: files('features', '.yaml'),
  places: files('places', '.csv'),
  areas: files('areas', '.yaml'),
  shapes: files('areas/shapes', '.geojson'),
  accents: files('accents', '.yaml'),
  findings: files('findings', '.csv'),
  glossary: files('.', 'glossary.yaml'),
  sample: {
    findings: files('sample/findings', '.csv'),
    areas: files('sample/areas', '.yaml'),
    shapes: files('sample/areas/shapes', '.geojson'),
    accents: files('sample/accents', '.yaml'),
  },
});

const today = new Date().toISOString().slice(0, 10);
const dev = buildData(input(), { dev: true, today });
const live = buildData(input(), { dev: false, today });

describe('real data, dev', () => {
  it('has no problems or warnings about shapes', () => {
    expect(dev.usingSamples).toBe(true);
    expect(dev.warnings.filter((w) => /not drawn/.test(w))).toEqual([]);
  });

  it('builds areas on both plates', () => {
    const bi = dev.builtAreas('britain-ireland');
    const us = dev.builtAreas('us');
    expect(bi.length).toBeGreaterThan(20);
    expect(us.length).toBe(8);
    expect(bi.length + us.length).toBe(dev.areas.length);
  });

  it('gives every area a path, and rough ones a loop', () => {
    const built = [...dev.builtAreas('britain-ireland'), ...dev.builtAreas('us')];
    for (const b of built) {
      expect(b.problems, b.id).toEqual([]);
      expect(b.path.length, `${b.id} path`).toBeGreaterThan(20);
      expect(b.label, `${b.id} label`).not.toBeNull();
      if (b.edge === 'rough') expect(b.loop, `${b.id} loop`).toBeTruthy();
      else expect(b.loop, `${b.id} loop`).toBeUndefined();
    }
  });

  it('uses all four kinds of area and both edges', () => {
    const kinds = new Set(dev.areas.map((a) => a.made.kind));
    expect([...kinds].sort()).toEqual(['around', 'drawn', 'of', 'units']);
    expect(new Set(dev.areas.map((a) => a.edge))).toEqual(new Set(['exact', 'rough']));
  });

  it('puts dots inside the right areas', () => {
    const inside = (dot: string) => dev.areasOfDot(dot).map((a) => a.id);
    expect(inside('liverpool-eng')).toContain('merseyside');
    expect(inside('belfast-nir')).toContain('ulster');
    expect(inside('derry-nir')).toContain('ulster');
    expect(inside('dublin-ie')).toContain('leinster-east');
    expect(inside('cork-ie')).toContain('munster');
    expect(inside('leeds-eng')).toEqual(expect.arrayContaining(['yorkshire', 'north-of-england', 'england']));
    expect(inside('pittsburgh-pa')).toEqual(expect.arrayContaining(['pennsylvania', 'western-pennsylvania']));
  });

  it('has the expected counts', () => {
    expect(dev.places.filter((p) => p.plate === 'britain-ireland')).toHaveLength(40);
    expect(dev.places.filter((p) => p.plate === 'us')).toHaveLength(54);
    expect(dev.features).toHaveLength(18);
    expect(dev.areas).toHaveLength(32);
    expect(dev.accents).toHaveLength(28);
    const kind = (k: string) => dev.areas.filter((a) => a.made.kind === k).length;
    expect([kind('units'), kind('drawn'), kind('around'), kind('of')]).toEqual([13, 14, 3, 2]);
    expect(dev.findings).toHaveLength(1015);
    expect(dev.drafts()).toHaveLength(12);
  });

  it('keeps the special cases alive', () => {
    const f = (type: 'place' | 'accent', id: string, feature: string) => dev.cell({ type, id }, feature);
    expect(f('place', 'sheffield-eng', 'foot-strut').shown?.value).toBe('nearly');
    expect(f('place', 'north-of-england', 'foot-strut').shown?.value).toBe('same');
    expect(f('place', 'sunderland-eng', 'cot-caught').differ).toBe(true);
    expect(f('place', 'glasgow-sct', 'th-fronting').ageSplit).toBe(true);
    for (const a of ['highland', 'mackem']) expect(dev.findings.filter((x) => x.accent === a)).toHaveLength(1);
    expect(dev.findings.some((x) => x.draft && x.accent === 'highland')).toBe(false);
    // both plates, and a sound with nothing on Britain and Ireland
    expect(dev.featurePlates('cot-caught')).toEqual(['britain-ireland', 'us']);
    expect(dev.featurePlates('northern-cities')).toEqual(['us']);
    expect(dev.featurePlates('th-fronting')).toEqual(['britain-ireland']);
    for (const t of ['place', 'accent'] as const) expect(dev.findings.some((x) => x.subject.type === t)).toBe(true);
    expect(dev.findings.some((x) => dev.areaById.has(x.place))).toBe(true);
  });
});

describe('real data, not dev', () => {
  it('shows the sample content while findings/ is empty, with no drafts', () => {
    expect(live.usingSamples).toBe(true);
    expect(live.findings.length).toBeGreaterThan(0);
    expect(live.drafts()).toHaveLength(0);
    expect(live.places.filter((p) => p.plate === 'britain-ireland')).toHaveLength(40);
  });
});
