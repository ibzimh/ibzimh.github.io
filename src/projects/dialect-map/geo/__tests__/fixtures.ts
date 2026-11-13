import type { Polygon } from 'geojson';
import type { AreaDef } from '../areas';

export const closed = (...pts: number[][]): Polygon => ({ type: 'Polygon', coordinates: [[...pts, pts[0]]] });
export const reversed = (g: Polygon): Polygon => ({ type: 'Polygon', coordinates: [g.coordinates[0].slice().reverse()] });

// [lon, lat] corners of a loose shape around the West Midlands
export const westMidlands = closed([-2.45, 52.75], [-2.0, 52.82], [-1.6, 52.78], [-1.3, 52.62], [-1.25, 52.42], [-1.4, 52.25], [-1.8, 52.17], [-2.2, 52.22], [-2.5, 52.4], [-2.6, 52.6]);
export const northSea = closed([2.0, 55.0], [3.0, 55.0], [3.0, 56.0], [2.0, 56.0]);
export const farAtlantic = closed([-25, 50], [-22, 50], [-22, 52], [-25, 52]);
export const bowtie = closed([-2, 52], [-1, 53], [-1, 52], [-2, 53]);

const gb = { country: 'GB', edge: 'exact' } as const;

export const kinds: AreaDef[] = [
  { ...gb, id: 'units', name: 'North West', units: { set: 'gb-regions', ids: ['north-west'] } },
  { ...gb, id: 'drawn', name: 'West Midlands', drawn: westMidlands },
  { ...gb, id: 'around', name: 'Around Cardiff', around: { lat: 51.481, lon: -3.179, km: 25 } },
  { ...gb, id: 'of', name: 'Yorkshire and the North West', of: ['units', 'yorks'] },
  { ...gb, id: 'yorks', name: 'Yorkshire', units: { set: 'gb-regions', ids: ['yorkshire-and-the-humber'] } },
  { ...gb, id: 'rough-drawn', name: 'Rough drawn', edge: 'rough', drawn: westMidlands },
  { ...gb, id: 'rough-units', name: 'Rough units', edge: 'rough', units: { set: 'gb-regions', ids: ['south-west'] } },
];

export const cities = [
  { id: 'liverpool', lat: 53.408, lon: -2.992 },
  { id: 'manchester', lat: 53.481, lon: -2.243 },
];
