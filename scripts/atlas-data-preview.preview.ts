// Draws both plates from the real data folder in dev mode. Run with `npm run atlas:data-preview`; not part of `npm test`.
import fs from 'node:fs';
import { it } from 'vitest';
import { buildData } from '../src/projects/dialect-map/build';
import { plate } from '../src/projects/dialect-map/geo/plates';
import type { DataFile, RawInput } from '../src/projects/dialect-map/types';

const base = decodeURIComponent(new URL('../', import.meta.url).pathname);
const root = `${base}src/projects/dialect-map/data/`;
const files = (dir: string, ext: string): DataFile[] => {
  const full = root + dir;
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((n: string) => n.endsWith(ext)).sort().map((n: string) => ({ file: `${dir}/${n}`, text: fs.readFileSync(`${full}/${n}`, 'utf8') }));
};
const input: RawInput = {
  sources: files('.', 'sources.yaml'), features: files('features', '.yaml'), places: files('places', '.csv'),
  areas: files('areas', '.yaml'), shapes: files('areas/shapes', '.geojson'), accents: files('accents', '.yaml'),
  findings: files('findings', '.csv'), glossary: files('.', 'glossary.yaml'),
  sample: { findings: files('sample/findings', '.csv'), areas: files('sample/areas', '.yaml'), shapes: files('sample/areas/shapes', '.geojson'), accents: files('sample/accents', '.yaml') },
};

const colours = ['#c0504d', '#4f81bd', '#9bbb59', '#8064a2', '#f79646', '#2c9fa8', '#b5651d', '#7a8f2a', '#cc4c8a', '#5b7fa6'];

it('writes the data preview', () => {
  const data = buildData(input, { dev: true, today: new Date().toISOString().slice(0, 10) });
  let svgs = '';
  for (const [id, tag] of [['britain-ireland', 'bi'], ['us', 'us']] as const) {
    const p = plate(id);
    const areas = data.builtAreas(id);
    const shapes = areas.map((a, i) => {
      const c = colours[i % colours.length];
      return `<path d="${a.path}" fill="${c}" fill-opacity="0.22" stroke="${a.loop ? 'none' : c}" stroke-width="1.2"/>` + (a.loop ? `<path d="${a.loop}" fill="none" stroke="${c}" stroke-width="1.4" stroke-dasharray="5 3"/>` : '');
    }).join('');
    const labels = areas.map((a) => {
      const name = data.areaById.get(a.id)?.name ?? a.id;
      return a.label ? `<text x="${a.label.x}" y="${a.label.y}" text-anchor="middle" font-size="9" font-weight="bold" fill="#222" paint-order="stroke" stroke="#fff" stroke-width="2.5">${name}</text>` : '';
    }).join('');
    const dots = data.places.filter((d) => d.plate === id && d.x !== null).map((d) => {
      const x = ((d.x as number) / 100) * p.width;
      const y = ((d.y as number) / 100) * p.height;
      return `<circle cx="${x}" cy="${y}" r="2.5" fill="#000"/><text x="${x + 4}" y="${y + 3}" font-size="7.5" fill="#000" paint-order="stroke" stroke="#fff" stroke-width="2">${d.name}</text>`;
    }).join('');
    const nations = p.nations.map((n) => `<text x="${n.x}" y="${n.y}" text-anchor="middle" font-size="12" fill="#999" letter-spacing="2">${n.text}</text>`).join('');
    svgs += `<section id="${tag}"><h2>${p.name}</h2><svg viewBox="0 0 ${p.width} ${p.height}" style="background:#dfe9f0"><path d="${p.land}" fill="#f4f1ea" fill-rule="evenodd"/><path d="${p.borders}" fill="none" stroke="#999" stroke-width="0.8"/>${nations}${shapes}${labels}${dots}</svg></section>`;
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Data preview</title><style>body{margin:0;font:14px sans-serif;display:flex;gap:16px;padding:8px}section{flex:1}h2{margin:0 0 4px;font-size:14px}svg{height:calc(100vh - 40px);width:100%}</style>${svgs}<script>const h=location.hash.slice(1);if(h)for(const s of document.querySelectorAll('section'))if(s.id!==h)s.remove()</script>`;
  const dir = `${base}node_modules/.cache/atlas-geo`;
  const out = `${dir}/data-preview.html`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`wrote ${out}`);
});
