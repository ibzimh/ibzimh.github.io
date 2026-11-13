// findings/*.csv: what a source says, for a place (dot or area) or an accent. A row with no `checked` date is a draft.
import { modes, type Mode } from './config';
import type { Index } from './ids';
import { mean, orList, table, validDate, type Ctx } from './parse';
import { parseCsv } from './csv';
import type { DataFile, Feature, Finding, Source } from './types';
import { valueDef, valuesOf } from './values';

export const FINDING_REQUIRED = ['feature', 'value', 'source', 'page', 'added'];
export const FINDING_OPTIONAL = ['place', 'accent', 'checked', 'mode', 'ages', 'who', 'note'];

/** Data rows across files (headers and # lines not counted). */
export function countRows(files: DataFile[]): number {
  let n = 0;
  for (const f of files) {
    try {
      n += Math.max(0, parseCsv(f.text).length - 1);
    } catch {
      n += 1; // a broken file is reported by checkFindings
    }
  }
  return n;
}

interface Refs {
  sounds: Map<string, Feature>;
  sources: Map<string, Source>;
  index: Index;
  today: string;
}

export function checkFindings(ctx: Ctx, files: DataFile[], refs: Refs): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, string>();
  for (const f of files) {
    for (const r of table(ctx, f.file, f.text, [...FINDING_REQUIRED], FINDING_OPTIONAL)) {
      const at = `${f.file} line ${r.line}`;
      if (r.bad) {
        ctx.problem(at, r.bad);
        continue;
      }
      for (const c of FINDING_REQUIRED) if (!r[c]) ctx.problem(at, `needs ${c}.`);
      if (!r.place && !r.accent) ctx.problem(at, 'needs a place or an accent.');
      else if (r.place && r.accent) ctx.problem(at, 'has both a place and an accent. Fill in just one.');

      let place = r.place;
      let accent = r.accent;
      if (place) {
        const hit = refs.index.resolve(['place', 'area'], place);
        if (hit) place = hit.id;
        else ctx.problem(at, `no place called "${place}".${refs.index.didYouMean(['place', 'area'], place)}`);
      }
      if (accent) {
        const hit = refs.index.resolve('accent', accent);
        if (hit) accent = hit.id;
        else ctx.problem(at, `no accent called "${accent}".${refs.index.didYouMean('accent', accent)}`);
      }
      if (r.source && !refs.sources.has(r.source)) ctx.problem(at, `no source called "${r.source}".${mean(r.source, refs.sources.keys())}`);

      let feature = r.feature;
      const hit = feature ? refs.index.resolve('sound', feature) : undefined;
      if (hit) feature = hit.id;
      else if (feature) ctx.problem(at, `no feature called "${feature}".${refs.index.didYouMean('sound', feature)}`);
      const sound = hit && refs.sounds.get(hit.id);
      const def = sound && r.value ? valueDef(sound, r.value) : undefined;
      if (sound && r.value && !def) {
        const ids = valuesOf(sound).map((v) => v.id);
        ctx.problem(at, `"${r.value}" isn't a value for ${sound.id} (scale: ${sound.scale}).${mean(r.value, ids)} Use ${orList(ids)}.`);
      }
      if (r.mode && !(r.mode in modes)) ctx.problem(at, `"${r.mode}" isn't a mode.${mean(r.mode, Object.keys(modes))} Use ${orList(Object.keys(modes))}, or leave it empty.`);

      if (r.added) {
        const bad = validDate(r.added, refs.today);
        if (bad) ctx.problem(at, `added: ${bad}`);
      }
      if (r.checked) {
        const bad = validDate(r.checked, refs.today);
        if (bad) ctx.problem(at, `checked: ${bad}`);
        else if (r.added && r.checked < r.added) ctx.problem(at, `checked (${r.checked}) is before added (${r.added}).`);
      }

      const key = [place, accent, feature, r.source, r.mode, r.ages, r.who].join('|');
      if (seen.has(key)) ctx.problem(at, `same place or accent, feature, source, mode, ages and who as ${seen.get(key)}.`);
      else seen.set(key, at);

      out.push({
        line: r.line, file: f.file, subject: place ? { type: 'place', id: place } : { type: 'accent', id: accent },
        place, accent, feature, value: r.value, symbol: def?.symbol ?? 'none', source: r.source, page: r.page,
        mode: (r.mode || null) as Mode | null, ages: r.ages, who: r.who, note: r.note, added: r.added, checked: r.checked,
        draft: !r.checked,
      });
    }
  }
  return out;
}
