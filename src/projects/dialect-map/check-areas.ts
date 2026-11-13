// areas/*.yaml: regions. Each is made from exactly one of units, drawn, around or of.
import { countries } from './config';
import type { Index } from './ids';
import { checkKey, entries, mean, orList, text, textList, type Ctx } from './parse';
import type { Area, AreaMade, DataFile } from './types';

const FIELDS = ['id', 'name', 'country', 'units', 'drawn', 'around', 'of', 'minus', 'edge', 'outline_from', 'closeup', 'also', 'was'];
const MADE = ['units', 'drawn', 'around', 'of'];
const EDGES = ['exact', 'rough'];

/** Why a GeoJSON value is not a Polygon or MultiPolygon, or null when it is. */
export function shapeProblem(json: unknown): string | null {
  const geoms: unknown[] = [];
  const j = json as { type?: string; features?: { geometry?: unknown }[]; geometry?: unknown } | null;
  if (j?.type === 'FeatureCollection' && Array.isArray(j.features)) geoms.push(...j.features.map((f) => f?.geometry));
  else if (j?.type === 'Feature') geoms.push(j.geometry);
  else geoms.push(j);
  if (!geoms.length) return 'has no shapes in it.';
  for (const g of geoms as ({ type?: string; coordinates?: unknown } | null)[]) {
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return `has ${g?.type ?? 'something'} in it; only Polygon or MultiPolygon work.`;
    if (!Array.isArray(g.coordinates) || !g.coordinates.length) return `has a ${g.type} with no coordinates.`;
  }
  return null;
}

export function parseAreas(ctx: Ctx, files: DataFile[], shapes: DataFile[]): Map<string, Area> {
  const out = new Map<string, Area>();
  const shapeNames = shapes.map((s) => s.file.split('/').pop() as string);
  for (const f of files) {
    for (const { at, o } of entries(ctx, f.file, f.text, FIELDS, 'id')) {
      const id = text(ctx, at, o, 'id');
      checkKey(ctx, at, id);
      if (id && out.has(id)) ctx.problem(at, `id "${id}" is used twice.`);
      const country = text(ctx, at, o, 'country');
      if (country && !countries[country]) ctx.problem(at, `"${country}" isn't a country I know.${mean(country, Object.keys(countries))}`);

      const given = MADE.filter((k) => o[k] !== undefined && o[k] !== null);
      if (given.length !== 1) ctx.problem(at, `needs exactly one of ${orList(MADE)}${given.length ? ` (found ${given.join(' and ')})` : ''}.`);
      if (o.minus !== undefined && !given.includes('of')) ctx.problem(at, 'minus only works together with of.');

      let made: AreaMade = { kind: 'of', of: [], minus: [] };
      let shape: unknown = null;
      const sub = (k: string, fields: string[]): Record<string, unknown> | null => {
        const v = o[k];
        if (!v || typeof v !== 'object' || Array.isArray(v)) {
          ctx.problem(at, `${k} should have ${orList(fields)}.`);
          return null;
        }
        for (const x of Object.keys(v)) if (!fields.includes(x)) ctx.problem(at, `${k} has unknown field "${x}".${mean(x, fields)}`);
        return v as Record<string, unknown>;
      };
      if (given[0] === 'units') {
        const u = sub('units', ['set', 'ids']);
        const ids = u ? textList(ctx, at, u, 'ids') : [];
        if (u && !ids.length) ctx.problem(at, 'units needs ids, like [PA, OH].');
        made = { kind: 'units', set: u ? text(ctx, at, u, 'set') : '', ids };
      } else if (given[0] === 'drawn') {
        const file = text(ctx, at, o, 'drawn');
        const hit = shapes.find((s) => s.file.split('/').pop() === file);
        if (file && !hit) ctx.problem(at, `drawn file "${file}" isn't in areas/shapes.${mean(file, shapeNames)}`);
        else if (hit) {
          try {
            shape = JSON.parse(hit.text);
            const bad = shapeProblem(shape);
            if (bad) ctx.problem(at, `drawn file "${file}" ${bad}`);
          } catch {
            ctx.problem(at, `drawn file "${file}" isn't valid JSON.`);
          }
        }
        made = { kind: 'drawn', file };
      } else if (given[0] === 'around') {
        const a = sub('around', ['place', 'km']);
        const km = a?.km;
        if (a && !(typeof km === 'number' && km > 0)) ctx.problem(at, `around km should be a number above 0 (got ${JSON.stringify(km) ?? 'nothing'}).`);
        made = { kind: 'around', place: a ? text(ctx, at, a, 'place') : '', km: typeof km === 'number' ? km : 0 };
      } else if (given[0] === 'of') {
        const of = textList(ctx, at, o, 'of');
        if (!of.length) ctx.problem(at, 'of needs at least one area id.');
        made = { kind: 'of', of, minus: textList(ctx, at, o, 'minus') };
      }

      const edge = text(ctx, at, o, 'edge', false);
      if (edge && !EDGES.includes(edge)) ctx.problem(at, `"${edge}" isn't an edge.${mean(edge, EDGES)} Use ${orList(EDGES)}.`);
      const was = textList(ctx, at, o, 'was');
      for (const w of was) checkKey(ctx, at, w, 'old id');
      if (id) {
        out.set(id, {
          id, name: text(ctx, at, o, 'name'), country, made,
          edge: (EDGES.includes(edge) ? edge : made.kind === 'units' ? 'exact' : 'rough') as Area['edge'],
          outlineFrom: text(ctx, at, o, 'outline_from', false), closeup: text(ctx, at, o, 'closeup', false),
          also: textList(ctx, at, o, 'also', true), was, shape,
        });
      }
    }
  }
  return out;
}

/** Resolve references (old ids become new ones) and check they exist and don't loop. */
export function linkAreas(ctx: Ctx, areas: Map<string, Area>, index: Index): void {
  for (const a of areas.values()) {
    const at = `area ${a.id}`;
    const m = a.made;
    if (m.kind === 'around') {
      const hit = m.place ? index.resolve('place', m.place) : undefined;
      if (m.place && !hit) {
        const isArea = index.resolve('area', m.place);
        ctx.problem(at, isArea ? `around place "${m.place}" is an area; it needs a dot.` : `no place called "${m.place}".${index.didYouMean('place', m.place)}`);
      } else if (hit) m.place = hit.id;
    }
    if (m.kind === 'of') {
      for (const k of ['of', 'minus'] as const) {
        m[k] = m[k].map((r) => {
          const hit = index.resolve('area', r);
          if (hit) return hit.id;
          ctx.problem(at, index.resolve('place', r) ? `${k} "${r}" is a place; it needs an area.` : `no area called "${r}" in ${k}.${index.didYouMean('area', r)}`);
          return r;
        });
      }
    }
  }
  // cycles through of/minus
  const state = new Map<string, 1 | 2>();
  const walk = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) return ctx.problem(`area ${id}`, `goes round in a circle: ${[...path.slice(path.indexOf(id)), id].join(' → ')}.`);
    const a = areas.get(id);
    if (!a || a.made.kind !== 'of') return;
    state.set(id, 1);
    for (const n of [...a.made.of, ...a.made.minus]) walk(n, [...path, id]);
    state.set(id, 2);
  };
  for (const id of areas.keys()) walk(id, []);
}
