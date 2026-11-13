import { describe, expect, it } from 'vitest';
import { buildAreas, checkAreas, type AreaDef } from '../areas';
import { inMulti, parsePath } from '../geom';
import { plate, plateForCountry, plates } from '../plates';
import { areaOverlaps, dotsInAreas } from '../relations';
import { hasSet, unitGeometry, unitIds, unitName } from '../sets';
import { bowtie, cities, farAtlantic, kinds, northSea, reversed, westMidlands } from './fixtures';

const BI = 'britain-ireland';
const one = (def: AreaDef, plateId = BI) => buildAreas([def], plateId)[0];

describe('sets', () => {
  it('has every set with ids and names', () => {
    for (const s of ['bi-nations', 'gb-regions', 'gb-counties', 'gb-historic-counties', 'ie-counties', 'us-states', 'us-counties']) expect(hasSet(s), s).toBe(true);
    expect(unitIds('gb-regions')).toHaveLength(9);
    expect(unitIds('gb-regions')).toContain('yorkshire-and-the-humber');
    expect(unitIds('gb-historic-counties')).toEqual(expect.arrayContaining(['yorkshire', 'lancashire']));
    expect(unitIds('ie-counties')).toEqual(expect.arrayContaining(['cork', 'donegal']));
    expect(unitName('us-states', 'PA')).toBe('Pennsylvania');
    expect(unitName('us-counties', 'pa-philadelphia')).toBe('Philadelphia');
    expect(unitName('gb-regions', 'north-west')).toBe('North West');
    expect(hasSet('nope')).toBe(false);
  });
});

describe('plates', () => {
  it('draws land paths that are not empty or huge', () => {
    for (const { id } of plates) {
      const p = plate(id);
      expect(p.land.length).toBeGreaterThan(1000);
      expect(p.land.length).toBeLessThan(150_000);
      expect(p.landFine.length).toBeGreaterThan(p.land.length * 2);
      expect(p.landFine.length).toBeLessThan(250_000);
      expect(p.borders.length).toBeGreaterThan(100);
      expect(p.kmPerUnit).toBeGreaterThan(0.5);
      const points = (p.sketch.match(/[ML]/g) ?? []).length;
      expect(points).toBeGreaterThan(30);
      expect(points).toBeLessThan(80);
    }
    expect(plate('us').nations).toEqual([]);
    expect(plate(BI).nations.map((n) => n.text)).toEqual(['SCOTLAND', 'ENGLAND', 'WALES', 'IRELAND', 'N. IRELAND']);
  });

  it('puts places on the right plate', () => {
    const p = plate(BI);
    const inside = (q: { x: number; y: number } | null) => q && q.x > 0 && q.x < p.width && q.y > 0 && q.y < p.height;
    expect(inside(p.project(51.507, -0.128))).toBeTruthy();
    expect(inside(p.project(60.155, -1.145))).toBeTruthy();
    expect(plate('us').project(40.71, -74.0)).not.toBeNull();
    expect(p.project(40.71, -74.0)).toBeNull();
    expect(plate('us').project(51.5, -0.12)).toBeNull();
    expect(plateForCountry('IE')?.id).toBe(BI);
    expect(plateForCountry('US')?.id).toBe('us');
    expect(plateForCountry('FR')).toBeUndefined();
  });
});

describe('areas', () => {
  it('builds every kind of area', () => {
    for (const a of buildAreas(kinds, BI)) {
      expect(a.problems, a.id).toEqual([]);
      expect(a.path, a.id).not.toBe('');
      expect(a.size, a.id).toBeGreaterThan(0);
      expect(a.label, a.id).not.toBeNull();
      expect(inMulti([a.label!.x, a.label!.y], parsePath(a.path)), `${a.id} label is inside`).toBe(true);
      expect(!!a.loop, a.id).toBe(kinds.find((d) => d.id === a.id)!.edge === 'rough');
    }
  });

  it('fixes a drawn shape whose ring runs the wrong way', () => {
    const right = one({ country: 'GB', edge: 'exact', id: 'r', name: 'r', drawn: westMidlands });
    const wrong = one({ country: 'GB', edge: 'exact', id: 'w', name: 'w', drawn: reversed(westMidlands) });
    expect(wrong.problems).toEqual([]);
    expect(wrong.size).toBeGreaterThan(0);
    expect(wrong.size).toBeLessThan(plate(BI).width * plate(BI).height * 0.05);
    expect(Math.abs(wrong.size - right.size) / right.size).toBeLessThan(0.01);
  });

  it('reports shapes in the sea and off the plate', () => {
    const sea = one({ country: 'GB', edge: 'exact', id: 's', name: 's', drawn: northSea });
    expect(sea.path).toBe('');
    expect(sea.problems.join(' ')).toMatch(/over the sea/);
    const far = one({ country: 'GB', edge: 'exact', id: 'f', name: 'f', drawn: farAtlantic });
    expect(far.problems.join(' ')).toMatch(/outside/);
    const us = one({ country: 'GB', edge: 'exact', id: 'u', name: 'u', units: { set: 'us-states', ids: ['PA'] } });
    expect(us.problems.join(' ')).toMatch(/outside/);
  });

  it('reports a shape that crosses itself or is empty', () => {
    expect(checkAreas([{ country: 'GB', edge: 'exact', id: 'b', name: 'b', drawn: bowtie }]).join(' ')).toMatch(/crosses itself/);
    expect(checkAreas([{ country: 'GB', edge: 'exact', id: 'e', name: 'e', drawn: { type: 'Polygon', coordinates: [] } }]).join(' ')).toMatch(/empty/);
    expect(one({ country: 'GB', edge: 'exact', id: 'b', name: 'b', drawn: bowtie }).path).toBe('');
  });

  it('suggests the right name for a mistyped unit or set', () => {
    const typo: AreaDef = { country: 'GB', edge: 'exact', id: 't', name: 't', units: { set: 'gb-historic-counties', ids: ['lancashir'] } };
    expect(checkAreas([typo]).join(' ')).toContain('Did you mean "lancashire"?');
    expect(one(typo).problems.join(' ')).toContain('Did you mean "lancashire"?');
    const badSet: AreaDef = { country: 'GB', edge: 'exact', id: 't', name: 't', units: { set: 'gb-region', ids: ['north-west'] } };
    expect(checkAreas([badSet]).join(' ')).toContain('Did you mean "gb-regions"?');
  });

  it('spots areas that use each other in a circle, and missing ones', () => {
    const defs: AreaDef[] = [
      { country: 'GB', edge: 'exact', id: 'a', name: 'a', of: ['b'] },
      { country: 'GB', edge: 'exact', id: 'b', name: 'b', of: ['a'] },
      { country: 'GB', edge: 'exact', id: 'c', name: 'c', of: ['nothing'] },
    ];
    const text = checkAreas(defs).join('\n');
    expect(text).toMatch(/in a circle: (a → b → a|b → a → b)/);
    expect(text).toMatch(/"nothing", which is not an area/);
    const built = buildAreas(defs, BI);
    expect(built.every((a) => a.problems.length > 0 && a.path === '')).toBe(true);
  });

  it('joins units with no line between them', () => {
    const a = unitGeometry('gb-regions', ['north-west'])!;
    const b = unitGeometry('gb-regions', ['yorkshire-and-the-humber'])!;
    const both = unitGeometry('gb-regions', ['north-west', 'yorkshire-and-the-humber'])!;
    expect(both.coordinates.length).toBeLessThan(a.coordinates.length + b.coordinates.length);
    const big = (path: string) => parsePath(path).filter((poly) => poly[0].length > 40).length;
    const separate = big(one({ country: 'GB', edge: 'exact', id: 'x', name: 'x', units: { set: 'gb-regions', ids: ['north-west'] } }).path) + big(one({ country: 'GB', edge: 'exact', id: 'y', name: 'y', units: { set: 'gb-regions', ids: ['yorkshire-and-the-humber'] } }).path);
    const joined = big(one({ country: 'GB', edge: 'exact', id: 'xy', name: 'xy', units: { set: 'gb-regions', ids: ['north-west', 'yorkshire-and-the-humber'] } }).path);
    expect(joined).toBeLessThan(separate);
  });

  it('builds an area across a country border (Ulster)', () => {
    const defs: AreaDef[] = [
      { country: 'GB', edge: 'exact', id: 'ni', name: 'NI', units: { set: 'bi-nations', ids: ['northern-ireland'] } },
      { country: 'IE', edge: 'exact', id: 'three', name: 'Three', units: { set: 'ie-counties', ids: ['donegal', 'cavan', 'monaghan'] } },
      { country: 'IE', edge: 'rough', id: 'ulster', name: 'Ulster', of: ['ni', 'three'] },
    ];
    const [ni, three, ulster] = buildAreas(defs, BI);
    expect(ulster.problems).toEqual([]);
    expect(ulster.size).toBeGreaterThan(ni.size + three.size * 0.9);
    expect(ulster.loop).toBeTruthy();
    const dots = [{ id: 'belfast', lat: 54.597, lon: -5.93 }, { id: 'cork', lat: 51.898, lon: -8.47 }];
    expect(dotsInAreas(dots, [ulster]).ulster).toEqual(['belfast']);
  });

  it('works on the US plate, including Alaska', () => {
    const us = buildAreas(
      [
        { country: 'US', edge: 'exact', id: 'pa', name: 'PA', units: { set: 'us-states', ids: ['PA'] } },
        { country: 'US', edge: 'exact', id: 'ak', name: 'AK', units: { set: 'us-states', ids: ['AK'] } },
        { country: 'US', edge: 'rough', id: 'chi', name: 'Chicago', around: { lat: 41.88, lon: -87.63, km: 100 } },
        { country: 'GB', edge: 'exact', id: 'skipped', name: 'x', around: { lat: 51, lon: 0, km: 10 } },
      ],
      'us',
    );
    expect(us.map((a) => a.id)).toEqual(['pa', 'ak', 'chi']);
    for (const a of us) expect(a.problems, a.id).toEqual([]);
  });
});

describe('relations', () => {
  const around: AreaDef = { country: 'GB', edge: 'exact', id: 'liv', name: 'Liverpool', around: { lat: 53.408, lon: -2.992, km: 15 } };

  it('finds the dots in an area', () => {
    for (const edge of ['exact', 'rough'] as const) {
      const built = buildAreas([{ ...around, edge }], BI);
      expect(built[0].problems).toEqual([]);
      const found = dotsInAreas(cities, built).liv;
      expect(found).toContain('liverpool');
      expect(found).not.toContain('manchester');
    }
  });

  it('says which area holds which', () => {
    const built = buildAreas(
      [
        { country: 'GB', edge: 'exact', id: 'nw', name: 'NW', units: { set: 'gb-regions', ids: ['north-west'] } },
        { country: 'GB', edge: 'exact', id: 'liv', name: 'Liv', around: { lat: 53.408, lon: -2.992, km: 12 } },
        { country: 'GB', edge: 'exact', id: 'yk', name: 'Yorks', units: { set: 'gb-regions', ids: ['yorkshire-and-the-humber'] } },
        { country: 'GB', edge: 'exact', id: 'sw', name: 'SW', units: { set: 'gb-regions', ids: ['south-west'] } },
      ],
      BI,
    );
    const rels = areaOverlaps(built);
    expect(rels.find((r) => r.a === 'nw' && r.b === 'liv')?.relation).toBe('a-contains-b');
    expect(rels.find((r) => r.a === 'nw' && r.b === 'yk')).toBeUndefined(); // neighbours only touch
    expect(rels.some((r) => [r.a, r.b].includes('sw'))).toBe(false);
  });
});
