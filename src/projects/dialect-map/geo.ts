// The default Geo: the US plate from basemap.ts. Countries with no plate yet return null.
import { baseMap } from './basemap';
import { mapForCountry } from './config';
import type { Geo } from './types';

export const defaultGeo: Geo = {
  plateForCountry: (country) => mapForCountry(country)?.id ?? null,
  project: (plateId, lat, lon) => (plateId === 'us' ? baseMap('us').project(lat, lon) : null),
  contains: {},
};
