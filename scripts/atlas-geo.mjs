// One-off: downloads boundary data, simplifies it, and writes small TopoJSON files for the atlas maps.
// Run with `npm run atlas:geo`. The site build never needs the network; it only reads the committed results.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea } from 'd3-geo';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { feature, quantize } from 'topojson-client';
import * as shapefile from 'shapefile';
import { unzipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, 'node_modules/.cache/atlas-geo/raw');
const OUT = path.join(root, 'src/projects/dialect-map/geo/data');
const META = path.join(CACHE, 'fetched.json');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {};
const saveMeta = () => fs.writeFileSync(META, JSON.stringify(meta, null, 1));
const today = () => new Date().toISOString().slice(0, 10);
const refresh = process.argv.includes('--refresh');

// ---------- downloading (everything lands in the cache folder and is only ever read as data) ----------
async function download(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(900_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw new Error(`could not fetch ${url}: ${e.message}`);
      console.log(`  retrying (${e.message})`);
    }
  }
}
async function cached(name, url) {
  const file = path.join(CACHE, name);
  if (refresh || !fs.existsSync(file)) {
    console.log(`  downloading ${name}`);
    fs.writeFileSync(file, await download(url));
    meta[name] = today();
    saveMeta();
  }
  return file;
}
// ArcGIS FeatureServer layers come down in pages and are joined into one GeoJSON file.
async function cachedArcgis(name, layerUrl, page = 20) {
  const file = path.join(CACHE, name);
  if (refresh || !fs.existsSync(file)) {
    console.log(`  downloading ${name}`);
    const features = [];
    for (let offset = 0; ; offset += page) {
      const q = `where=1%3D1&outFields=*&outSR=4326&geometryPrecision=5&resultOffset=${offset}&resultRecordCount=${page}&f=geojson`;
      const gj = JSON.parse((await download(`${layerUrl}/query?${q}`)).toString('utf8'));
      if (!gj.features) throw new Error('unexpected reply from ' + layerUrl);
      features.push(...gj.features);
      if (gj.features.length < page && !gj.exceededTransferLimit) break;
      if (!gj.features.length) break;
    }
    fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features }));
    meta[name] = today();
    saveMeta();
  }
  return file;
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// ---------- cleaning ----------
const R2 = 6371 * 6371;
const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const snap = (p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
const sphereArea = (ring) => geoArea({ type: 'Polygon', coordinates: [ring] });
const cleanRing = (ring) => {
  const out = [];
  for (const p of ring.map(snap)) if (!out.length || p[0] !== out.at(-1)[0] || p[1] !== out.at(-1)[1]) out.push(p);
  if (out.length > 1 && (out[0][0] !== out.at(-1)[0] || out[0][1] !== out.at(-1)[1])) out.push(out[0]);
  return out.length >= 4 ? out : null;
};
// d3-geo wants clockwise outer rings and counter-clockwise holes; a wrong ring reads as "the whole world minus the shape"
function cleanPolygon(rings, minKm2) {
  const ring0 = cleanRing(rings[0]);
  if (!ring0) return null;
  if (sphereArea(ring0) > 2 * Math.PI) ring0.reverse();
  if (sphereArea(ring0) * R2 < minKm2) return null;
  const holes = [];
  for (const h of rings.slice(1)) {
    const r = cleanRing(h);
    if (!r) continue;
    if (sphereArea(r) < 2 * Math.PI) r.reverse();
    if ((4 * Math.PI - sphereArea(r)) * R2 >= minKm2) holes.push(r);
  }
  return [ring0, ...holes];
}
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

// US county names are left out of the file when they can be read back from the id (see sets.ts)
const countyDefault = (id) => id.replace(/^[a-z]{2}-/, '').replace(/-\d{5}$/, '').replace(/-/g, ' ').replace(/(^| )([a-z])/g, (_, a, b) => a + b.toUpperCase());

function unitsFrom(items, minKm2, omitNames) {
  const seen = new Set();
  const units = [];
  for (const { id, name, geometries } of items) {
    if (seen.has(id)) throw new Error('duplicate unit id ' + id);
    seen.add(id);
    const all = geometries.flatMap(polygonsOf);
    let polys = all.map((p) => cleanPolygon(p, minKm2)).filter(Boolean);
    if (!polys.length) polys = all.map((p) => cleanPolygon(p, 0)).filter(Boolean); // tiny units keep their shape
    if (!polys.length) {
      console.log(`  skipping ${id}: the source has no usable shape for it`);
      continue;
    }
    units.push({ type: 'Feature', id, properties: omitNames && countyDefault(id) === name ? {} : { name }, geometry: { type: 'MultiPolygon', coordinates: polys } });
  }
  return units.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// Keep as much detail as fits the size budget (quantile(p) keeps the biggest p share of points), then round to a grid.
function encode(features, { maxBytes, grid }) {
  const topo = topology({ units: { type: 'FeatureCollection', features } });
  const pre = presimplify(topo);
  const at = (keep) => JSON.stringify(quantize(simplify(pre, quantile(pre, keep)), grid));
  let lo = 0.0001, hi = 1;
  if (at(1).length <= maxBytes) lo = 1;
  else while (hi - lo > 0.002) {
    const mid = (lo + hi) / 2;
    if (at(mid).length <= maxBytes) lo = mid; else hi = mid;
  }
  const out = quantize(simplify(pre, quantile(pre, lo)), grid);
  return { json: JSON.stringify(out), kept: lo };
}

// ---------- the sets ----------
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_subunits.geojson';
const ONS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';
const ONS_CREDITS = [
  'Source: Office for National Statistics licensed under the Open Government Licence v.3.0',
  'Contains OS data © Crown copyright and database right 2026',
];
const FIPS_STATE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA',
  '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA',
  '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY',
  '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX',
  '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR',
};
const nameField = (props, suffix = 'NM') => {
  const key = Object.keys(props).find((k) => k.endsWith(suffix) && !/NMW$/.test(k));
  if (!key) throw new Error('no name field in ' + Object.keys(props).join(','));
  return props[key];
};
const tidyOns = (n) => n.replace(/, (County|City) of$/, '').replace(/^City of /, '');

const SETS = [
  {
    id: 'bi-nations', maxBytes: 120_000, grid: 40_000, minKm2: 2,
    info: {
      name: 'Nations of Britain and Ireland', publisher: 'Natural Earth', url: 'https://www.naturalearthdata.com/', licence: 'Public domain',
      credits: ['Made with Natural Earth'],
    },
    async load() {
      const file = await cached('ne_subunits.geojson', NE_URL);
      const gj = readJson(file);
      const want = { England: 'england', Scotland: 'scotland', Wales: 'wales', 'Northern Ireland': 'northern-ireland', Ireland: 'ireland', 'Isle of Man': 'isle-of-man', Jersey: 'jersey', Guernsey: 'guernsey', Alderney: 'guernsey', Sark: 'guernsey', Herm: 'guernsey' };
      const names = { england: 'England', scotland: 'Scotland', wales: 'Wales', 'northern-ireland': 'Northern Ireland', ireland: 'Ireland', 'isle-of-man': 'Isle of Man', jersey: 'Jersey', guernsey: 'Guernsey' };
      const groups = new Map();
      for (const f of gj.features) {
        const id = want[f.properties.SUBUNIT];
        if (!id || !['GBR', 'IRL', 'IMN', 'JEY', 'GGY'].includes(f.properties.ADM0_A3)) continue;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(f.geometry);
      }
      for (const id of Object.values(want)) if (!groups.has(id)) throw new Error('missing in Natural Earth: ' + id);
      return { items: [...groups].map(([id, geometries]) => ({ id, name: names[id], geometries })), file };
    },
  },
  {
    id: 'gb-regions', maxBytes: 40_000, grid: 20_000, minKm2: 1,
    info: { name: 'Regions of England', publisher: 'Office for National Statistics, Open Geography Portal', url: 'https://geoportal.statistics.gov.uk/', licence: 'Open Government Licence v3.0', credits: ONS_CREDITS },
    async load() {
      const file = await cachedArcgis('ons_regions.geojson', `${ONS}/Regions_December_2025_Boundaries_EN_BGC/FeatureServer/0`);
      const items = readJson(file).features.map((f) => {
        const name = nameField(f.properties);
        return { id: slug(name), name, geometries: [f.geometry] };
      });
      if (items.length !== 9) throw new Error('expected 9 regions, got ' + items.length);
      return { items, file };
    },
  },
  {
    id: 'gb-counties', maxBytes: 120_000, grid: 30_000, minKm2: 1,
    info: { name: 'Counties and unitary authorities of the UK', publisher: 'Office for National Statistics, Open Geography Portal', url: 'https://geoportal.statistics.gov.uk/', licence: 'Open Government Licence v3.0', credits: ONS_CREDITS },
    async load() {
      const file = await cachedArcgis('ons_counties.geojson', `${ONS}/Counties_and_Unitary_Authorities_December_2025_Boundaries_UK_BGC/FeatureServer/0`);
      const items = readJson(file).features.map((f) => {
        const name = tidyOns(nameField(f.properties));
        return { id: slug(name), name, geometries: [f.geometry] };
      });
      return { items, file };
    },
  },
  {
    id: 'gb-historic-counties', maxBytes: 100_000, grid: 30_000, minKm2: 2,
    info: {
      name: 'Historic counties of the UK (Definition A)', publisher: 'Historic Counties Trust, Historic County Borders Project', url: 'https://www.county-borders.co.uk/',
      licence: 'Free for any use with acknowledgement', credits: ['Made use of data provided by the Historic County Borders Project (county-borders.co.uk)'],
    },
    async load() {
      const zip = await cached('hcb_definition_a_simplified.zip', 'https://www.county-borders.co.uk/UKDefinitionA_WG84_Simplified.zip');
      const files = unzipSync(new Uint8Array(fs.readFileSync(zip)));
      const find = (ext) => Object.entries(files).find(([n]) => n.toLowerCase().endsWith(ext))?.[1];
      const shp = find('.shp'), dbf = find('.dbf');
      if (!shp || !dbf) throw new Error('shapefile parts missing in zip');
      const { features } = await shapefile.read(shp, dbf);
      const items = features.map((f) => ({ id: slug(f.properties.NAME), name: f.properties.NAME, geometries: [f.geometry] }));
      return { items, file: zip };
    },
  },
  {
    id: 'ie-counties', maxBytes: 70_000, grid: 30_000, minKm2: 2,
    info: {
      name: 'Counties of Ireland', publisher: 'Tailte Éireann (Ordnance Survey Ireland), via data.gov.ie', url: 'https://data.gov.ie/dataset/counties-national-statutory-boundaries-2019',
      licence: 'CC BY 4.0', credits: ['Contains Tailte Éireann data licensed under CC BY 4.0'],
    },
    async load() {
      const layer = 'https://services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/arcgis/rest/services/Counties___OSi_National_Statutory_Boundaries/FeatureServer/0';
      const file = await cachedArcgis('tailte_counties.geojson', layer, 30);
      const items = readJson(file).features.map((f) => {
        const name = titleCase(f.properties.ENGLISH);
        return { id: slug(name), name, geometries: [f.geometry] };
      });
      if (items.length !== 26) throw new Error('expected 26 counties, got ' + items.length);
      return { items, file };
    },
  },
  {
    id: 'us-states', maxBytes: 50_000, grid: 100_000, minKm2: 5,
    info: { name: 'States of the United States', publisher: 'US Census Bureau, via the us-atlas package', url: 'https://github.com/topojson/us-atlas', licence: 'Public domain (US government work); package ISC', credits: [] },
    async load() {
      const file = path.join(root, 'node_modules/us-atlas/states-10m.json');
      const topo = readJson(file);
      const items = feature(topo, topo.objects.states).features.filter((f) => FIPS_STATE[f.id]).map((f) => ({ id: FIPS_STATE[f.id], name: f.properties.name, geometries: [f.geometry] }));
      
      return { items, file, packaged: true };
    },
  },
  {
    id: 'us-counties', maxBytes: 200_000, grid: 20_000, minKm2: 15,
    info: { name: 'Counties of the United States', publisher: 'US Census Bureau, via the us-atlas package', url: 'https://github.com/topojson/us-atlas', licence: 'Public domain (US government work); package ISC', credits: [] },
    async load() {
      const file = path.join(root, 'node_modules/us-atlas/counties-10m.json');
      const topo = readJson(file);
      const feats = feature(topo, topo.objects.counties).features.filter((f) => FIPS_STATE[f.id.slice(0, 2)]);
      const base = feats.map((f) => ({ f, id: `${FIPS_STATE[f.id.slice(0, 2)]?.toLowerCase()}-${slug(f.properties.name)}` }));
      const count = new Map();
      for (const b of base) count.set(b.id, (count.get(b.id) ?? 0) + 1);
      const items = base.map(({ f, id }) => ({ id: count.get(id) > 1 ? `${id}-${f.id}` : id, name: f.properties.name, geometries: [f.geometry] }));
      for (const i of items) if (i.id.startsWith('undefined')) throw new Error('county without state: ' + i.name);
      return { items, file, packaged: true };
    },
  },
];

// ---------- run ----------
const creditsFile = path.join(OUT, 'credits.json');
const credits = fs.existsSync(creditsFile) ? readJson(creditsFile) : {};
const pkgVersion = readJson(path.join(root, 'node_modules/us-atlas/package.json')).version;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const failed = [];

for (const set of SETS) {
  if (only.length && !only.includes(set.id)) continue;
  console.log(set.id);
  try {
    const { items, file, packaged } = await set.load();
    const features = unitsFrom(items, set.minKm2, set.id === 'us-counties');
    const { json, kept } = encode(features, set);
    fs.writeFileSync(path.join(OUT, `${set.id}.topo.json`), json);
    const fetchedAt = packaged ? `from npm package us-atlas ${pkgVersion}` : meta[path.basename(file)] ?? today();
    credits[set.id] = { ...set.info, fetched: fetchedAt, units: features.length };
    console.log(`  ${features.length} units, ${(json.length / 1000).toFixed(1)} KB (kept ${(kept * 100).toFixed(0)}% of points)`);
  } catch (e) {
    failed.push(set.id);
    console.log(`  FAILED: ${e.message}`);
  }
}
const sorted = Object.fromEntries(Object.entries(credits).filter(([id]) => fs.existsSync(path.join(OUT, `${id}.topo.json`))).sort(([a], [b]) => (a < b ? -1 : 1)));
fs.writeFileSync(creditsFile, JSON.stringify(sorted, null, 1) + '\n');
if (failed.length) console.log('\nfailed sets: ' + failed.join(', '));
