// features/*.yaml: the sounds. Each has a scale that decides its question and its answers.
import { scaleIds, soundGroups, type ScaleId } from './config';
import { checkKey, entries, KEY, mean, orList, text, textList, type Ctx } from './parse';
import type { DataFile, Feature, SoundOption } from './types';

const FIELDS = ['id', 'name', 'also', 'scale', 'group', 'words', 'from', 'to', 'word', 'options', 'examples', 'about', 'was'];
const OWN: Record<ScaleId, string[]> = { pair: ['words'], change: ['from', 'to'], options: ['word', 'options'] };

export function checkSounds(ctx: Ctx, files: DataFile[]): Map<string, Feature> {
  const out = new Map<string, Feature>();
  const groupIds = soundGroups.map((g) => g.id);
  for (const f of files) {
    for (const { at, o } of entries(ctx, f.file, f.text, FIELDS, 'id')) {
      const id = text(ctx, at, o, 'id');
      checkKey(ctx, at, id);
      if (id && out.has(id)) ctx.problem(at, `id "${id}" is used twice.`);

      const scale = text(ctx, at, o, 'scale');
      const known = (scaleIds as string[]).includes(scale);
      if (scale && !known) ctx.problem(at, `"${scale}" isn't a scale.${mean(scale, scaleIds)} Use ${orList(scaleIds)}.`);
      const group = text(ctx, at, o, 'group', false);
      if (group && !groupIds.includes(group as never)) ctx.problem(at, `"${group}" isn't a group.${mean(group, groupIds)} Use ${orList(groupIds)}.`);
      if (known) {
        for (const [s, fields] of Object.entries(OWN)) {
          if (s === scale) continue;
          for (const k of fields) if (o[k] !== undefined) ctx.problem(at, `${k} doesn't belong to scale "${scale}" (it is for ${s}).`);
        }
      }

      let words: string[] = [];
      let from = '';
      let to = '';
      let word = '';
      const options: SoundOption[] = [];
      if (scale === 'pair') {
        words = textList(ctx, at, o, 'words');
        if (words.length < 2 || words.length > 3) ctx.problem(at, 'words should be 2 or 3 words, like [cot, caught].');
      } else if (scale === 'change') {
        from = text(ctx, at, o, 'from');
        to = text(ctx, at, o, 'to');
      } else if (scale === 'options') {
        word = text(ctx, at, o, 'word');
        const raw = o.options;
        if (!Array.isArray(raw) || raw.length < 2 || raw.length > 6) ctx.problem(at, 'options should be a list of 2 to 6 choices, each with id and label.');
        else {
          raw.forEach((opt, i) => {
            const here = `${at} option ${i + 1}`;
            if (!opt || typeof opt !== 'object' || Array.isArray(opt)) return ctx.problem(here, 'should have id and label.');
            const rec = opt as Record<string, unknown>;
            for (const k of Object.keys(rec)) if (!['id', 'label'].includes(k)) ctx.problem(here, `unknown field "${k}".${mean(k, ['id', 'label'])}`);
            const oid = text(ctx, here, rec, 'id');
            const label = text(ctx, here, rec, 'label');
            if (oid && !KEY.test(oid)) ctx.problem(here, `id "${oid}" should use lowercase letters, numbers and dashes.`);
            else if (oid === 'mixed') ctx.problem(here, 'id "mixed" is kept for "for some".');
            else if (options.some((x) => x.id === oid)) ctx.problem(here, `id "${oid}" is used twice.`);
            options.push({ id: oid, label });
          });
        }
      }

      const examples = textList(ctx, at, o, 'examples');
      const was = textList(ctx, at, o, 'was');
      for (const w of was) checkKey(ctx, at, w, 'old id');
      if (id) {
        out.set(id, {
          id, name: text(ctx, at, o, 'name'), also: textList(ctx, at, o, 'also', true), group: group || null,
          scale: scale as ScaleId, words, from, to, word, options, examples, about: text(ctx, at, o, 'about'), was,
        });
      }
    }
  }
  return out;
}
