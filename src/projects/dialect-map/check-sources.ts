// sources.yaml: where findings come from.
import { checkKey, entries, KEY, text, type Ctx } from './parse';
import type { DataFile, Source } from './types';

const year = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

export const sampleSources: Source[] = [
  {
    key: 'sample', short: 'Sample', citation: 'Made-up rows to show the layout. Not real data.',
    published: new Date().getFullYear(), data: [new Date().getFullYear(), new Date().getFullYear()],
    how: '', link: '', sample: true,
  },
  {
    key: 'sample-b', short: 'Sample B', citation: 'Made-up older rows to show sources disagreeing. Not real data.',
    published: 2000, data: [1990, 1995], how: '', link: '', sample: true,
  },
];

export function checkSources(ctx: Ctx, files: DataFile[]): Map<string, Source> {
  const out = new Map<string, Source>();
  for (const f of files) {
    for (const { at, o } of entries(ctx, f.file, f.text, ['key', 'short', 'citation', 'published', 'data', 'how', 'link'], 'key')) {
      const key = text(ctx, at, o, 'key');
      checkKey(ctx, at, key, 'key');
      if (key && KEY.test(key) && (out.has(key) || sampleSources.some((s) => s.key === key))) ctx.problem(at, `key "${key}" is used twice (or reserved).`);
      const published = o.published;
      if (!year(published)) ctx.problem(at, 'published should be a year, like 2006.');
      const [from, to] = Array.isArray(o.data) ? o.data : [];
      if (!Array.isArray(o.data) || o.data.length !== 2 || !year(from) || !year(to)) ctx.problem(at, 'data should be two years, like [1992, 1999].');
      else if (from > to) ctx.problem(at, `data years go backwards (${from} to ${to}).`);
      else if (year(published) && to > (published as number) + 1) ctx.problem(at, `data ends in ${to}, after it was published (${published}).`);
      const link = text(ctx, at, o, 'link', false);
      if (link) {
        try {
          new URL(link);
        } catch {
          ctx.problem(at, `link "${link}" isn't a web address.`);
        }
      }
      if (key) {
        out.set(key, {
          key, short: text(ctx, at, o, 'short'), citation: text(ctx, at, o, 'citation'), published: published as number,
          data: [from as number, to as number], how: text(ctx, at, o, 'how', false), link, sample: false,
        });
      }
    }
  }
  return out;
}
