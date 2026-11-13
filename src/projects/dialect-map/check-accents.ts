// accents/*.yaml: named ways of speaking, tied to places or to social groups.
import { countries } from './config';
import type { Index } from './ids';
import { checkKey, distance, entries, mean, orList, text, textList, validUrl, type Ctx } from './parse';
import type { Accent, DataFile, Listen } from './types';

const FIELDS = ['id', 'name', 'country', 'tie', 'where', 'core', 'wider', 'also', 'group', 'parent', 'who', 'about', 'listen', 'was'];
const TIES = ['place', 'social'];

export function parseAccents(ctx: Ctx, files: DataFile[]): Map<string, Accent> {
  const out = new Map<string, Accent>();
  for (const f of files) {
    for (const { at, o } of entries(ctx, f.file, f.text, FIELDS, 'id')) {
      const id = text(ctx, at, o, 'id');
      checkKey(ctx, at, id);
      if (id && out.has(id)) ctx.problem(at, `id "${id}" is used twice.`);
      const country = text(ctx, at, o, 'country');
      if (country && !countries[country]) ctx.problem(at, `"${country}" isn't a country I know.${mean(country, Object.keys(countries))}`);
      const tie = text(ctx, at, o, 'tie');
      if (tie && !TIES.includes(tie)) ctx.problem(at, `"${tie}" isn't a tie.${mean(tie, TIES)} Use ${orList(TIES)}.`);

      const listen: Listen[] = [];
      const rawListen = o.listen;
      if (rawListen !== undefined && rawListen !== null) {
        if (!Array.isArray(rawListen)) ctx.problem(at, 'listen should be a list of label and url.');
        else {
          rawListen.forEach((l, i) => {
            const here = `${at} listen ${i + 1}`;
            if (!l || typeof l !== 'object' || Array.isArray(l)) return ctx.problem(here, 'should have label and url.');
            const rec = l as Record<string, unknown>;
            for (const k of Object.keys(rec)) if (!['label', 'url'].includes(k)) ctx.problem(here, `unknown field "${k}".${mean(k, ['label', 'url'])}`);
            const label = text(ctx, here, rec, 'label');
            const url = text(ctx, here, rec, 'url');
            if (url && !validUrl(url)) ctx.problem(here, `url "${url}" isn't a web address (start it with https://).`);
            listen.push({ label, url });
          });
        }
      }
      const was = textList(ctx, at, o, 'was');
      for (const w of was) checkKey(ctx, at, w, 'old id');
      if (id) {
        out.set(id, {
          id, name: text(ctx, at, o, 'name'), country, tie: tie as Accent['tie'], where: text(ctx, at, o, 'where'),
          core: textList(ctx, at, o, 'core'), wider: textList(ctx, at, o, 'wider'), also: textList(ctx, at, o, 'also', true),
          group: text(ctx, at, o, 'group', false), parent: text(ctx, at, o, 'parent', false), who: text(ctx, at, o, 'who', false),
          about: text(ctx, at, o, 'about', false), listen, was,
        });
      }
    }
  }
  return out;
}

/** Resolve references, then check parents, place ties and group names. */
export function linkAccents(ctx: Ctx, accents: Map<string, Accent>, index: Index): void {
  for (const a of accents.values()) {
    const at = `accent ${a.id}`;
    for (const k of ['core', 'wider'] as const) {
      a[k] = a[k].map((r) => {
        const hit = index.resolve(['place', 'area'], r);
        if (hit) return hit.id;
        ctx.problem(at, `no place or area called "${r}" in ${k}.${index.didYouMean(['place', 'area'], r)}`);
        return r;
      });
    }
    if (a.tie === 'place' && !a.core.length && !a.wider.length) ctx.problem(at, 'tie place needs at least one place or area in core or wider.');
    if (a.parent) {
      const hit = index.resolve('accent', a.parent);
      if (hit) a.parent = hit.id;
      else ctx.problem(at, `no accent called "${a.parent}" as parent.${index.didYouMean('accent', a.parent)}`);
    }
  }
  const state = new Map<string, 1 | 2>();
  const walk = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) return ctx.problem(`accent ${id}`, `parents go round in a circle: ${[...path.slice(path.indexOf(id)), id].join(' → ')}.`);
    const p = accents.get(id)?.parent;
    state.set(id, 1);
    if (p && accents.has(p)) walk(p, [...path, id]);
    state.set(id, 2);
  };
  for (const id of accents.keys()) walk(id, []);

  // two group headings a letter or two apart are almost surely a typo
  const groups = [...new Set([...accents.values()].map((a) => a.group).filter(Boolean))];
  groups.forEach((g, i) => {
    for (const h of groups.slice(i + 1)) {
      const d = distance(g.toLowerCase(), h.toLowerCase());
      if (d <= 2 && Math.min(g.length, h.length) >= 5) ctx.problem(`accent group "${h}"`, `is almost the same as "${g}". Did you mean "${g}"?`);
    }
  });
}
