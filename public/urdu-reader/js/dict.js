// The real dictionary will replace dict/sample.json; if it gets large it can be
// split by first letter without changing lookup().
import { lookupKey } from './text.js';
import { guessRoman } from './roman.js';

let index = new Map(); // key -> [{ entry, form }]
let loaded = false;
let name = '';

const RULES = [['وں', ''], ['یں', ''], ['یاں', 'ی'], ['ے', 'ا'], ['ے', 'ہ'], ['ی', 'ا'], ['یں', 'ی']];

function add(key, item) {
  const list = index.get(key);
  if (list) list.push(item);
  else index.set(key, [item]);
}

export function buildIndex(data) {
  index = new Map();
  name = data.name || '';
  for (const entry of data.entries || []) {
    add(lookupKey(entry.ur), { entry, form: null });
    for (const form of entry.forms || []) add(lookupKey(form.ur), { entry, form });
  }
  loaded = true;
}

export async function loadDictionary(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dictionary request failed: ${res.status}`);
  buildIndex(await res.json());
}

export const isLoaded = () => loaded;
export const dictionaryName = () => name;

// Homographs (e.g. میں main / mein): an entry's optional `context` ({ next: [words], start: true })
// says which neighbours suggest that reading. Matched context beats no context beats unmatched context.
function score(entry, ctx) {
  const c = entry.context;
  if (!c) return 0.5;
  let n = 0;
  if (c.next && ctx.next && c.next.some((w) => lookupKey(w) === ctx.next)) n += 2;
  if (c.start && ctx.start) n += 1;
  return n;
}

function byContext(matches, ctx) {
  if (matches.length < 2 || !ctx) return matches;
  return matches.map((m, i) => ({ m, i, s: score(m.entry, ctx) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.m);
}

// ctx (optional): { next: lookup key of the following word, start: at sentence start }
export function lookup(word, ctx) {
  const key = lookupKey(word);
  const hits = index.get(key) || [];
  const exact = hits.filter((h) => !h.form);
  if (exact.length) return { matches: byContext(exact.map(({ entry }) => ({ entry, form: null })), ctx), via: 'exact' };
  if (hits.length) return { matches: hits.map(({ entry, form }) => ({ entry, form })), via: 'form' };
  for (const [from, to] of RULES) {
    if (!key.endsWith(from) || key.length - from.length < 2) continue;
    const stem = lookupKey(key.slice(0, key.length - from.length) + to);
    const found = (index.get(stem) || []).filter((h) => !h.form);
    if (found.length) {
      return { matches: found.map(({ entry }) => ({ entry, form: null })), via: 'guess', guessedFrom: found[0].entry.ur };
    }
  }
  return { matches: [], via: null };
}

// What to show as the Roman spelling; guessed = not from the dictionary.
export function romanFor(word, ctx) {
  const r = lookup(word, ctx);
  if (r.via === 'exact') return { roman: r.matches[0].entry.roman, guessed: false };
  if (r.via === 'form') {
    const m = r.matches[0];
    return { roman: m.form.roman || m.entry.roman, guessed: false };
  }
  return { roman: guessRoman(word), guessed: true };
}
