// Shared reading helpers: collect problems, read CSV tables and YAML lists, suggest fixes.
import { parse as parseYaml } from 'yaml';
import { parseCsv, type CsvRow } from './csv';

export const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const NUM = /^-?\d+(\.\d+)?$/;

export interface Ctx {
  problems: string[];
  warnings: string[];
  problem(where: string, msg: string): void;
}

export function newCtx(): Ctx {
  const problems: string[] = [];
  return { problems, warnings: [], problem: (where, msg) => void problems.push(`  ${where}: ${msg}`) };
}

export function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** ` Did you mean "x"?` for the closest option within 3 edits, else ''. */
export function mean(word: string, options: Iterable<string>): string {
  let best = '';
  let bestD = 4;
  for (const o of options) {
    const d = distance(word, o);
    if (d > 0 && d < bestD) [best, bestD] = [o, d];
  }
  return best ? ` Did you mean "${best}"?` : '';
}

export const orList = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

export function validDate(s: string, today: string): string | null {
  if (!DATE.test(s)) return `"${s}" isn't a date. Use YYYY-MM-DD.`;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return `"${s}" isn't a real date.`;
  if (s > today) return `"${s}" is in the future.`;
  return null;
}

export function validUrl(s: string): boolean {
  try {
    return /^https?:$/.test(new URL(s).protocol);
  } catch {
    return false;
  }
}

export type Row = Record<string, string> & { line: number; bad?: string };

/** CSV table: header (order free) then rows keyed by column name. Problems go to ctx. */
export function table(ctx: Ctx, file: string, text: string, required: string[], optional: string[]): Row[] {
  let raw: CsvRow[];
  try {
    raw = parseCsv(text);
  } catch (e) {
    ctx.problem(file, (e as Error).message);
    return [];
  }
  if (!raw.length) {
    ctx.problem(file, 'is empty. It needs a header row.');
    return [];
  }
  const head = raw[0].cells.map((c) => c.trim());
  const known = [...required, ...optional];
  let bad = false;
  for (const c of required) {
    if (!head.includes(c)) ctx.problem(`${file} line ${raw[0].line}`, `missing column "${c}".`), (bad = true);
  }
  head.forEach((c, i) => {
    if (!known.includes(c)) ctx.problem(`${file} line ${raw[0].line}`, `unknown column "${c}".${mean(c, known)}`), (bad = true);
    else if (head.indexOf(c) !== i) ctx.problem(`${file} line ${raw[0].line}`, `column "${c}" appears twice.`), (bad = true);
  });
  if (bad) return [];
  const rows: Row[] = [];
  for (const r of raw.slice(1)) {
    const row = { line: r.line } as Row;
    if (r.cells.length !== head.length) row.bad = `has ${r.cells.length} columns, expected ${head.length}. Quote any text that contains a comma.`;
    else head.forEach((c, i) => (row[c] = r.cells[i].trim()));
    for (const c of known) row[c] ??= '';
    rows.push(row);
  }
  return rows;
}

export interface Entry {
  at: string; // "file id" for messages
  o: Record<string, unknown>;
}

/** YAML list of plain objects, each labelled by its id or "entry N". Unknown fields are reported. */
export function entries(ctx: Ctx, file: string, text: string, fields: string[], idField: string): Entry[] {
  let doc: unknown;
  try {
    doc = parseYaml(text) ?? [];
  } catch (e) {
    ctx.problem(file, (e as Error).message.split('\n')[0]);
    return [];
  }
  if (!Array.isArray(doc)) {
    ctx.problem(file, 'should be a list of entries, each starting with "- ".');
    return [];
  }
  const out: Entry[] = [];
  doc.forEach((o, i) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return ctx.problem(`${file} entry ${i + 1}`, 'should have named fields.');
    const rec = o as Record<string, unknown>;
    const id = rec[idField];
    const at = `${file} ${typeof id === 'string' && id ? id : `entry ${i + 1}`}`;
    for (const k of Object.keys(rec)) {
      if (!fields.includes(k)) ctx.problem(at, `unknown field "${k}".${mean(k, fields)}`);
    }
    out.push({ at, o: rec });
  });
  return out;
}

/** Text field. Empty string when missing or not text (a problem is reported). */
export function text(ctx: Ctx, at: string, o: Record<string, unknown>, k: string, required = true): string {
  const v = o[k];
  if (v === undefined || v === null || v === '') {
    if (required) ctx.problem(at, `needs ${k}.`);
    return '';
  }
  if (typeof v !== 'string') {
    ctx.problem(at, `${k} should be text.`);
    return '';
  }
  return v.trim();
}

/** List of text. A plain string counts as a one-item list when `allowString` is set. */
export function textList(ctx: Ctx, at: string, o: Record<string, unknown>, k: string, allowString = false): string[] {
  const v = o[k];
  if (v === undefined || v === null) return [];
  if (typeof v === 'string' && allowString) return v.trim() ? [v.trim()] : [];
  if (!Array.isArray(v) || v.some((e) => typeof e !== 'string' || !e.trim())) {
    ctx.problem(at, `${k} should be a list of text.`);
    return [];
  }
  return v.map((e: string) => e.trim());
}

/** Check an id's format; reports when bad. */
export function checkKey(ctx: Ctx, at: string, id: string, what = 'id'): void {
  if (id && !KEY.test(id)) ctx.problem(at, `${what} "${id}" should use lowercase letters, numbers and dashes.`);
}

/** "61" or "61-63" shows as "p. 61"; anything else ("map 8") shows as typed. */
export const pageText = (page: string) => (/^\d+(\s*[-–]\s*\d+)?$/.test(page) ? `p. ${page}` : page);

export const splitBar = (s: string) => s.split('|').map((x) => x.trim()).filter(Boolean);
