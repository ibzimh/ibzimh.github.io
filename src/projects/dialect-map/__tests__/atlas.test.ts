// The data a plate's page sends to the browser: its shape, and that it agrees with the data layer.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../atlas';
import { buildData } from '../build';
import type { PlateId } from '../geo/plates';
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
const plates: PlateId[] = ['us', 'britain-ireland'];

describe('atlas data, dev', () => {
  it('has the plate, its places and areas, and every sound', () => {
    for (const id of plates) {
      const a = buildAtlas(dev, id);
      expect(a.sample).toBe(true);
      expect(a.plate.id).toBe(id);
      expect(a.plate.w).toBeGreaterThan(0);
      expect(a.plate.km).toBeGreaterThan(0);
      expect(a.plate.landFine.length).toBeGreaterThan(a.plate.land.length);
      expect(a.dots).toHaveLength(dev.places.filter((p) => p.plate === id).length);
      for (const p of a.dots) {
        expect(p.x, p.id).toBeGreaterThanOrEqual(0);
        expect(p.x, p.id).toBeLessThanOrEqual(a.plate.w);
        expect(p.y, p.id).toBeLessThanOrEqual(a.plate.h);
      }
      expect(a.areas).toHaveLength(dev.builtAreas(id).length);
      for (const r of a.areas) {
        expect(r.path.length, r.id).toBeGreaterThan(20);
        expect(r.size, r.id).toBeGreaterThan(0);
        if (r.edge === 'rough') expect(r.loop, r.id).toBeTruthy();
      }
      expect(a.sounds).toHaveLength(dev.features.length);
      expect(Object.keys(a.derived.sounds).sort()).toEqual(dev.features.map((f) => f.id).sort());
      expect(a.derived.accents).toHaveProperty(a.accents[0].id);
      for (const f of a.findings) expect(a.sources.some((s) => s.key === f.src), f.src).toBe(true);
    }
  });

  it('keeps only this plate\'s accents and findings', () => {
    const us = buildAtlas(dev, 'us'), bi = buildAtlas(dev, 'britain-ireland');
    expect(us.accents).toHaveLength(7);
    expect(bi.accents).toHaveLength(21);
    expect(us.findings.length + bi.findings.length).toBe(dev.findings.length);
    expect(bi.findings.some((f) => f.s === 'pittsburgh-pa')).toBe(false);
    expect(us.findings.some((f) => f.s === 'scouse')).toBe(false);
  });

  it('counts the same as the data layer', () => {
    for (const id of plates) {
      const a = buildAtlas(dev, id);
      const dots = dev.places.filter((p) => p.plate === id);
      for (const s of dev.features) {
        const one = a.derived.sounds[s.id];
        const want = dev.countsByPlate(s.id)[id] ?? {};
        const got = one.c.place;
        const { none = 0, ...recorded } = want;
        expect(got, `${id} ${s.id}`).toEqual(recorded);
        expect(Object.values(got).reduce((n, x) => n + x, 0) + none).toBe(dots.length);
        for (const p of dots) {
          const e = one.shown[`place:${p.id}`];
          const c = dev.placeCell(p.id, s.id);
          expect(e?.v, `${id} ${p.id} ${s.id}`).toBe(c.shown?.value);
          expect(!!e?.d).toBe(c.shown ? c.differ : false);
          expect(!!e?.a).toBe(c.shown ? c.ageSplit : false);
        }
      }
    }
  });

  it('uses newest data and flags where sources differ and where ages split', () => {
    const bi = buildAtlas(dev, 'britain-ireland').derived.sounds;
    expect(bi['foot-strut'].shown['place:sheffield-eng'].v).toBe('nearly');
    expect(bi['foot-strut'].shown['area:north-of-england'].v).toBe('same');
    expect(bi['cot-caught'].shown['place:sunderland-eng'].d).toBe(1);
    expect(bi['th-fronting'].shown['place:glasgow-sct'].a).toBe(1);
  });

  it('marks draft findings', () => {
    const a = buildAtlas(dev, 'britain-ireland'), b = buildAtlas(dev, 'us');
    expect(a.findings.filter((f) => f.d).length + b.findings.filter((f) => f.d).length).toBe(dev.drafts().length);
    expect(dev.drafts().length).toBeGreaterThan(0);
  });

  it('marks a sound with no data on a plate, and says where it has data', () => {
    const bi = buildAtlas(dev, 'britain-ireland').derived.sounds, us = buildAtlas(dev, 'us').derived.sounds;
    expect(bi['northern-cities'].n).toBe(0);
    expect(Object.keys(bi['northern-cities'].other)).toEqual(['us']);
    expect(us['th-fronting'].n).toBe(0);
    expect(Object.keys(us['th-fronting'].other)).toEqual(['britain-ireland']);
    expect(bi['cot-caught'].n).toBeGreaterThan(0);
    expect(Object.keys(bi['cot-caught'].other)).toEqual(['us']);
  });

  it('lists who covers each dot', () => {
    const a = buildAtlas(dev, 'britain-ireland').derived.dots;
    expect(a['liverpool-eng'].a).toContain('merseyside');
    expect(a['liverpool-eng'].c).toContain('scouse');
  });
});

describe('atlas data, not dev', () => {
  it('has no sample content or drafts, and still has places and every sound', () => {
    for (const id of plates) {
      const a = buildAtlas(live, id);
      expect(a.sample).toBe(false);
      expect(a.accents).toEqual([]);
      expect(a.areas).toEqual([]);
      expect(a.findings).toEqual([]);
      expect(a.sources).toEqual([]);
      expect(a.dots.length).toBeGreaterThanOrEqual(30);
      expect(a.sounds).toHaveLength(live.features.length);
      for (const s of Object.values(a.derived.sounds)) {
        expect(s.n).toBe(0);
        expect(s.other).toEqual({});
      }
    }
  });
});
