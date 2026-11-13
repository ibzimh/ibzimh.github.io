// places/*.csv: the dots.
import { countries } from './config';
import { checkKey, KEY, mean, NUM, splitBar, table, type Ctx } from './parse';
import type { DataFile, Geo, Place } from './types';

export function checkPlaces(ctx: Ctx, files: DataFile[], geo: Geo): Map<string, Place> {
  const out = new Map<string, Place>();
  const seen = new Map<string, string>();
  const noPlate = new Map<string, number>();
  for (const f of files) {
    for (const r of table(ctx, f.file, f.text, ['id', 'name', 'region', 'country', 'lat', 'lon'], ['also', 'rank', 'was'])) {
      const at = `${f.file} line ${r.line}`;
      if (r.bad) {
        ctx.problem(at, r.bad);
        continue;
      }
      for (const c of ['id', 'name', 'region', 'country']) if (!r[c]) ctx.problem(at, `needs ${c}.`);
      if (r.id && !KEY.test(r.id)) checkKey(ctx, at, r.id);
      else if (r.id && r.region && !r.id.endsWith(`-${r.region.toLowerCase()}`)) ctx.problem(at, `id "${r.id}" should end with "-${r.region.toLowerCase()}".`);
      if (seen.has(r.id)) ctx.problem(at, `id "${r.id}" is used twice (first at ${seen.get(r.id)}).`);
      else seen.set(r.id, at);

      const country = countries[r.country];
      if (r.country && !country) ctx.problem(at, `"${r.country}" isn't a country I know.${mean(r.country, Object.keys(countries))}`);
      if (country && r.region && !country.regions[r.region]) ctx.problem(at, `"${r.region}" isn't a ${country.name} region code.${mean(r.region, Object.keys(country.regions))}`);
      const lat = NUM.test(r.lat) ? Number(r.lat) : NaN;
      const lon = NUM.test(r.lon) ? Number(r.lon) : NaN;
      if (!(Math.abs(lat) <= 90)) ctx.problem(at, `lat "${r.lat}" should be a number from -90 to 90.`);
      if (!(Math.abs(lon) <= 180)) ctx.problem(at, `lon "${r.lon}" should be a number from -180 to 180.`);
      if (r.rank && !['1', '2', '3'].includes(r.rank)) ctx.problem(at, `rank "${r.rank}" should be 1, 2 or 3.`);

      let plate: string | null = null;
      let xy: { x: number; y: number } | null = null;
      if (country && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        plate = geo.plateForCountry(r.country);
        if (!plate) noPlate.set(r.country, (noPlate.get(r.country) ?? 0) + 1);
        else {
          xy = geo.project(plate, lat, lon);
          if (!xy) ctx.problem(at, `${r.name || r.id} (${r.lat}, ${r.lon}) falls outside the ${country.name} map.`);
        }
      }
      if (r.id) {
        out.set(r.id, {
          id: r.id, name: r.name, region: r.region, regionName: country?.regions[r.region] ?? r.region, country: r.country,
          lat, lon, also: splitBar(r.also), rank: (Number(r.rank || 2) as 1 | 2 | 3), was: splitBar(r.was),
          plate, x: xy?.x ?? null, y: xy?.y ?? null,
        });
      }
    }
  }
  for (const [c, n] of noPlate) ctx.warnings.push(`Dialect map: ${n} ${n === 1 ? 'place' : 'places'} in ${c} not drawn yet (no map for it).`);
  return out;
}
