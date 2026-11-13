// glossary.yaml: plain-English meanings of the terms the map uses.
import { entries, text, textList, type Ctx } from './parse';
import type { DataFile, GlossaryEntry } from './types';

export function checkGlossary(ctx: Ctx, files: DataFile[]): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const { at, o } of entries(ctx, f.file, f.text, ['term', 'also', 'plain'], 'term')) {
      const term = text(ctx, at, o, 'term');
      if (term && seen.has(term.toLowerCase())) ctx.problem(at, `term "${term}" is used twice.`);
      seen.add(term.toLowerCase());
      out.push({ term, also: textList(ctx, at, o, 'also', true), plain: text(ctx, at, o, 'plain') });
    }
  }
  return out;
}
