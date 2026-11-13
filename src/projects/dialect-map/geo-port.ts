// The default Geo, built on geo/ (plates, areas, relations). Countries with no plate return null.
import { buildAreas, checkAreas, type AreaDef, type BuiltArea } from './geo/areas';
import { plate, plateForCountry, plates } from './geo/plates';
import { areaOverlaps, dotsInAreas } from './geo/relations';
import type { Geo } from './types';

const pct = (n: number, of: number) => Math.round((n / of) * 1e4) / 1e2;

export const defaultGeo: Geo = {
  plateForCountry: (country) => plateForCountry(country)?.id ?? null,
  project(plateId, lat, lon) {
    const p = plate(plateId);
    const xy = p.project(lat, lon);
    return xy && { x: pct(xy.x, p.width), y: pct(xy.y, p.height) };
  },
  areas(defs: AreaDef[], dots) {
    const problems = checkAreas(defs);
    const built: Record<string, BuiltArea[]> = {};
    const contains: Record<string, string[]> = {};
    const overlaps: Record<string, ReturnType<typeof areaOverlaps>> = {};
    // building would repeat these problems, so stop here
    if (problems.length) return { problems, built, contains, overlaps };
    for (const p of plates) {
      if (!defs.some((d) => p.countries.includes(d.country))) continue;
      const list = buildAreas(defs, p.id);
      built[p.id] = list;
      overlaps[p.id] = areaOverlaps(list);
      Object.assign(contains, dotsInAreas(dots, list));
      for (const a of list) for (const m of a.problems) problems.push(`Area "${a.id}": ${m}`);
    }
    return { problems, built, contains, overlaps };
  },
};
