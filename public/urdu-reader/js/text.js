// Normalising, tokenising and look-up keys for Urdu text.

const MARKS = '\\u064B-\\u065F\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED';
const LETTER_RE = /[ء-غف-يٮٯٱ-ۓەۺ-ۿݐ-ݿ]/;
const MARK_RE = new RegExp(`[${MARKS}]`);
const DIGIT_RE = /[0-9٠-٩۰-۹]/;
const LATIN_RE = /[A-Za-zÀ-ɏ]/;
const JOINER_RE = /[\u200C\u200D]/;

const LETTER_MAP = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ه': 'ہ' };
const mapLetters = (s) => s.replace(/[يىكه]/g, (c) => LETTER_MAP[c]);

export function cleanForDisplay(raw) {
  let s = String(raw ?? '').replace(/\r\n?/g, '\n');
  s = mapLetters(s);
  s = s.replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 0x06F0));
  s = s.replace(/[ \t ]+/g, ' ');
  s = s.replace(/ ?\n ?/g, '\n'); // no stray spaces around line breaks
  s = s.trim().replace(/\n{3,}/g, '\n\n');
  return s;
}

export function lookupKey(word) {
  const stripped = String(word).replace(new RegExp(`[${MARKS}\\u0640\\u200C\\u200D]`, 'g'), '');
  return mapLetters(stripped);
}

const isWordPart = (c) => c !== undefined && (LETTER_RE.test(c) || MARK_RE.test(c) || c === '\u0640');

function tokenizeLine(line) {
  const out = [];
  let i = 0;
  const n = line.length;
  const push = (type, start, end) => out.push({ type, text: line.slice(start, end) });
  while (i < n) {
    const c = line[i];
    const start = i;
    if (LETTER_RE.test(c)) {
      i++;
      while (i < n) {
        if (isWordPart(line[i])) i++;
        else if (JOINER_RE.test(line[i]) && isWordPart(line[i + 1])) i += 2;
        else break;
      }
      push('word', start, i);
    } else if (DIGIT_RE.test(c)) {
      i++;
      while (i < n && (DIGIT_RE.test(line[i]) || (/[.,٫٬]/.test(line[i]) && DIGIT_RE.test(line[i + 1] ?? '')))) i++;
      push('num', start, i);
    } else if (LATIN_RE.test(c)) {
      i++;
      while (i < n && (LATIN_RE.test(line[i]) || (/['’]/.test(line[i]) && LATIN_RE.test(line[i + 1] ?? '')))) i++;
      push('latin', start, i);
    } else if (/[ \t ]/.test(c)) {
      while (i < n && /[ \t ]/.test(line[i])) i++;
      push('space', start, i);
    } else {
      i++;
      while (i < n && !LETTER_RE.test(line[i]) && !DIGIT_RE.test(line[i]) && !LATIN_RE.test(line[i]) && !/[ \t ]/.test(line[i])) i++;
      push('punct', start, i);
    }
  }
  return out;
}

// text -> paragraphs -> lines -> tokens
export function tokenize(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!t.trim()) return [];
  return t.split(/\n{2,}/).filter((p) => p.trim()).map((p) => p.split('\n').map(tokenizeLine));
}
