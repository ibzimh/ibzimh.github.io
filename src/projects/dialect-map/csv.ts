// Tiny RFC 4180 CSV parser: quoted fields, commas and newlines inside quotes, "" escapes, CRLF, BOM.
// A line starting with # is a comment.

export interface CsvRow {
  line: number; // 1-based line where the row starts
  cells: string[];
}

/** Rows of cells; blank and # lines are skipped. Throws on a quote that never closes. */
export function parseCsv(text: string): CsvRow[] {
  const src = text.replace(/^﻿/, '');
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (cells.length > 1 || cells[0] !== '') rows.push({ line: start, cells });
    cells = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        cell += c;
      }
    } else if (c === '#' && cell === '' && !cells.length) {
      while (i + 1 < src.length && src[i + 1] !== '\n' && src[i + 1] !== '\r') i++;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') endCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      start = line;
    } else cell += c;
  }
  if (quoted) throw new Error(`a quote opened on line ${start} never closes`);
  if (cell !== '' || cells.length) endRow();
  return rows;
}
