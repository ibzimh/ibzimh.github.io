// Draws both plates with one test area of every kind, to look at by eye. Run with `npm run atlas:geo-preview`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'node_modules/.cache/atlas-geo/preview.html');
fs.mkdirSync(path.dirname(out), { recursive: true });

const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null } });
let html;
try {
  const geo = (f) => server.ssrLoadModule(`/src/projects/dialect-map/geo/${f}.ts`);
  const { plate } = await geo('plates');
  const { buildAreas, checkAreas } = await geo('areas');
  const { dotsInAreas, areaOverlaps } = await geo('relations');

  const poly = (...pts) => ({ type: 'Polygon', coordinates: [[...pts, pts[0]]] });
  const WESTMID = poly([-2.45, 52.75], [-2.0, 52.82], [-1.6, 52.78], [-1.3, 52.62], [-1.25, 52.42], [-1.4, 52.25], [-1.8, 52.17], [-2.2, 52.22], [-2.5, 52.4], [-2.6, 52.6]);
  const NORTH = poly([-3.2, 53.45], [-3.25, 53.85], [-3.35, 54.1], [-3.75, 54.55], [-3.5, 54.92], [-2.95, 55.02], [-2.3, 55.35], [-1.85, 55.85], [-1.4, 55.35], [-1.3, 55.0], [-0.95, 54.7], [-0.45, 54.55], [0.1, 54.15], [0.25, 53.62], [-0.55, 53.62], [-1.4, 53.3], [-2.1, 53.27], [-2.85, 53.33]);
  const INLAND_NORTH = poly([-91.1, 46.6], [-88.2, 47.2], [-84.7, 46.8], [-83.2, 45.6], [-82.5, 43.5], [-78.9, 43.5], [-76.4, 43.8], [-75.0, 44.6], [-73.6, 44.0], [-73.8, 42.9], [-76.0, 41.9], [-79.8, 41.8], [-82.5, 40.9], [-86.0, 41.1], [-89.0, 41.3], [-90.4, 42.3], [-91.2, 43.9]);
  const SOUTH = poly([-100, 36.4], [-82, 38.0], [-78.5, 37.8], [-75.3, 36.9], [-75.2, 35.2], [-77.2, 33.8], [-79.8, 32.4], [-81.0, 30.3], [-79.9, 25.6], [-81.0, 24.6], [-83.0, 27.0], [-86.5, 29.7], [-89.2, 28.9], [-93.5, 29.3], [-97.1, 25.9], [-99.2, 26.5], [-101.8, 30.5], [-101.0, 34.5]);
  const reversed = (g) => ({ type: 'Polygon', coordinates: [g.coordinates[0].slice().reverse()] });

  const defsBI = [
    { id: 'north-west', name: 'North West', country: 'GB', edge: 'exact', units: { set: 'gb-regions', ids: ['north-west'] } },
    { id: 'yorkshire', name: 'Yorkshire (historic)', country: 'GB', edge: 'exact', units: { set: 'gb-historic-counties', ids: ['yorkshire'] } },
    { id: 'highlands', name: 'Highland council area', country: 'GB', edge: 'rough', units: { set: 'gb-counties', ids: ['highland'] } },
    { id: 'north-of-england', name: 'North of England (drawn, backwards)', country: 'GB', edge: 'rough', drawn: reversed(NORTH) },
    { id: 'west-midlands', name: 'West Midlands (drawn)', country: 'GB', edge: 'exact', drawn: WESTMID },
    { id: 'liverpool', name: 'Around Liverpool', country: 'GB', edge: 'rough', around: { lat: 53.408, lon: -2.992, km: 15 } },
    { id: 'cardiff', name: 'Around Cardiff', country: 'GB', edge: 'exact', around: { lat: 51.481, lon: -3.179, km: 25 } },
    { id: 'cork', name: 'Cork', country: 'IE', edge: 'exact', units: { set: 'ie-counties', ids: ['cork'] } },
    { id: 'ni', name: 'Northern Ireland', country: 'GB', edge: 'exact', units: { set: 'bi-nations', ids: ['northern-ireland'] } },
    { id: 'ulster-south', name: 'Three Ulster counties', country: 'IE', edge: 'exact', units: { set: 'ie-counties', ids: ['donegal', 'cavan', 'monaghan'] } },
    { id: 'ulster', name: 'Ulster', country: 'IE', edge: 'rough', of: ['ni', 'ulster-south'] },
    { id: 'south-east', name: 'South East', country: 'GB', edge: 'exact', units: { set: 'gb-regions', ids: ['south-east'] } },
    { id: 'london', name: 'London', country: 'GB', edge: 'exact', units: { set: 'gb-regions', ids: ['london'] } },
    { id: 'south-east-all', name: 'South East with London', country: 'GB', edge: 'exact', of: ['south-east', 'london'] },
    { id: 'home-counties', name: 'South East ring around London', country: 'GB', edge: 'rough', of: ['south-east-all'], minus: ['london'] },
    { id: 'orkney-shetland', name: 'Orkney and Shetland', country: 'GB', edge: 'rough', units: { set: 'gb-historic-counties', ids: ['orkney', 'shetland'] } },
  ];
  const defsUS = [
    { id: 'pennsylvania', name: 'Pennsylvania', country: 'US', edge: 'exact', units: { set: 'us-states', ids: ['PA'] } },
    { id: 'new-england', name: 'New England', country: 'US', edge: 'rough', units: { set: 'us-states', ids: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT'] } },
    { id: 'massachusetts', name: 'Massachusetts', country: 'US', edge: 'exact', units: { set: 'us-states', ids: ['MA'] } },
    { id: 'ne-less-ma', name: 'New England without MA', country: 'US', edge: 'exact', of: ['new-england'], minus: ['massachusetts'] },
    { id: 'inland-north', name: 'Inland North (drawn, backwards)', country: 'US', edge: 'rough', drawn: reversed(INLAND_NORTH) },
    { id: 'the-south', name: 'The South (drawn)', country: 'US', edge: 'rough', drawn: SOUTH },
    { id: 'chicago', name: 'Around Chicago', country: 'US', edge: 'rough', around: { lat: 41.88, lon: -87.63, km: 150 } },
    { id: 'bay-counties', name: 'Counties by the Bay', country: 'US', edge: 'rough', units: { set: 'us-counties', ids: ['ca-san-francisco', 'ca-alameda', 'ca-san-mateo', 'ca-marin', 'ca-santa-clara', 'ca-contra-costa'] } },
    { id: 'alaska', name: 'Alaska', country: 'US', edge: 'exact', units: { set: 'us-states', ids: ['AK'] } },
  ];

  const bad = checkAreas([...defsBI, ...defsUS]);
  if (bad.length) console.log('checkAreas:', bad);

  const cities = {
    'britain-ireland': [['London', 51.507, -0.128], ['Manchester', 53.481, -2.243], ['Liverpool', 53.408, -2.992], ['Leeds', 53.801, -1.549], ['Birmingham', 52.486, -1.89], ['Cardiff', 51.481, -3.179], ['Glasgow', 55.864, -4.252], ['Edinburgh', 55.953, -3.188], ['Inverness', 57.478, -4.225], ['Lerwick', 60.155, -1.145], ['Belfast', 54.597, -5.93], ['Dublin', 53.35, -6.26], ['Cork', 51.898, -8.47], ['Galway', 53.271, -9.057], ['Newcastle', 54.978, -1.618], ['Plymouth', 50.375, -4.143], ['Douglas', 54.152, -4.482]],
    us: [['New York', 40.71, -74.0], ['Chicago', 41.88, -87.63], ['Los Angeles', 34.05, -118.24], ['Houston', 29.76, -95.37], ['Boston', 42.36, -71.06], ['Pittsburgh', 40.44, -80.0], ['Seattle', 47.61, -122.33], ['Atlanta', 33.75, -84.39], ['Miami', 25.76, -80.19], ['Denver', 39.74, -104.99], ['San Francisco', 37.77, -122.42], ['Anchorage', 61.22, -149.9], ['Honolulu', 21.31, -157.86], ['London', 51.5, -0.12]],
  };
  const hue = (i) => (i * 47) % 360;

  // ZOOM="x,y,w,h" looks closer at one patch of each plate; FINE=1 uses the zoom-level detail
  const zoom = process.env.ZOOM?.split(',').map(Number);
  const fine = !!process.env.FINE;
  const section = (plateId, defs, key) => {
    const p = plate(plateId);
    const areas = buildAreas(defs, plateId, fine ? 'fine' : 'normal');
    const dots = cities[plateId].map(([name, lat, lon], i) => ({ id: name, lat, lon, i }));
    const inside = dotsInAreas(dots, areas);
    const overlaps = areaOverlaps(areas);
    const svgAreas = areas.map((a, i) => {
      if (!a.path) return '';
      const c = `hsl(${hue(i)} 70% 45%)`;
      return `<g><path d="${a.path}" fill="${c}" fill-opacity=".30" stroke="${c}" stroke-width="1"/>` +
        (a.loop ? `<path d="${a.loop}" fill="none" stroke="${c}" stroke-width="1.6" stroke-dasharray="5 3"/>` : '') +
        (a.label ? `<circle cx="${a.label.x}" cy="${a.label.y}" r="2.2" fill="#111"/><text x="${a.label.x + 4}" y="${a.label.y - 3}" font-size="9" fill="#111" paint-order="stroke" stroke="#fff" stroke-width="2">${a.id}</text>` : '') + '</g>';
    }).join('');
    const svgDots = dots.map((d) => {
      const q = p.project(d.lat, d.lon);
      return q ? `<circle cx="${q.x}" cy="${q.y}" r="2.4" fill="#c00"/><text x="${q.x + 4}" y="${q.y + 8}" font-size="8" fill="#900">${d.id}</text>` : '';
    }).join('');
    const nations = p.nations.map((n) => `<text x="${n.x}" y="${n.y}" font-size="12" letter-spacing="2" fill="#555" text-anchor="middle">${n.text}</text>`).join('');
    const scaleBar = `<g transform="translate(20 ${p.height - 22})"><path d="M0,0h${(100 / p.kmPerUnit).toFixed(1)}" stroke="#000" stroke-width="2"/><text y="-4" font-size="10">100 km</text></g>`;
    const k = key === 'us' ? 1.12 : 1.1;
    const notes = areas.map((a) => `<tr><td>${a.id}</td><td>${a.size}</td><td>${a.problems.join(' ') || 'ok'}</td><td>${(Object.entries(inside).find(([id]) => id === a.id)?.[1] ?? []).join(', ')}</td></tr>`).join('');
    const lap = overlaps.map((o) => `${o.a} / ${o.b}: ${o.relation} (${o.shareOfA}, ${o.shareOfB})`).join('<br>');
    console.log(`${plateId}: land ${p.land.length}b fine ${p.landFine.length}b borders ${p.borders.length}b sketch ${p.sketch.length}b km/unit ${p.kmPerUnit}`);
    for (const a of areas) console.log(`  ${a.id.padEnd(18)} size ${String(a.size).padStart(7)} path ${String(a.path.length).padStart(6)}b loop ${a.loop ? a.loop.length : '-'} ${a.problems.join(' ')}`);
    return `<section id="${key}"><div class="row">
      <svg viewBox="${zoom ? zoom.join(' ') : `0 0 ${p.width} ${p.height}`}" width="${zoom ? 900 : p.width * k}" height="${zoom ? (900 * zoom[3]) / zoom[2] : p.height * k}" style="background:#f4f1ea">
        <path d="${fine ? p.landFine : p.land}" fill="#fff" stroke="#999" stroke-width=".6"/><path d="${fine ? p.bordersFine : p.borders}" fill="none" stroke="#777" stroke-width=".8"/>
        ${svgAreas}${nations}${svgDots}${scaleBar}</svg>
      <div class="side"><svg viewBox="0 0 ${p.width} ${p.height}" width="${Math.min(300, p.width * 0.4)}" style="background:#f4f1ea"><path d="${p.sketch}" fill="#e8e2d4" stroke="#333" stroke-width="2" stroke-linejoin="round"/></svg>
      <table>${notes}</table><p>${lap}</p></div></div></section>`;
  };

  html = `<!doctype html><meta charset="utf-8"><title>atlas geo preview</title><style>
    body{font:12px system-ui;margin:8px}section{display:none}section:target,body:not(:has(section:target)) section:first-of-type{display:block}
    .row{display:flex;gap:14px;align-items:flex-start}.side{width:330px}table{border-collapse:collapse;font-size:10px}td{border-bottom:1px solid #ddd;padding:1px 4px}</style>
    <nav><a href="#us">us</a> <a href="#bi">britain-ireland</a></nav>
    ${section('us', defsUS, 'us')}${section('britain-ireland', defsBI, 'bi')}`;
} finally {
  await server.close();
}
fs.writeFileSync(out, html);
console.log('wrote ' + out);
