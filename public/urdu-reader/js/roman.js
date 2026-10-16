// Rough letter-by-letter Roman Urdu for words the dictionary doesn't know.

const CONS = {
  'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't', 'ث': 's', 'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ڈ': 'd', 'ذ': 'z', 'ر': 'r', 'ڑ': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ک': 'k', 'گ': 'g',
  'ل': 'l', 'م': 'm', 'ن': 'n', 'ں': 'n', 'ہ': 'h', 'ۃ': 'h', 'ع': '', 'ء': '',
};
const VOWEL_LETTERS = new Set(['ا', 'آ', 'و', 'ی', 'ے', 'ئ', 'ؤ', 'أ']);
const MARK_VOWEL = { 'َ': 'a', 'ِ': 'i', 'ُ': 'u', 'ٰ': 'aa' };

export function guessRoman(word) {
  const clean = String(word).replace(/[\u200C\u200D\u0640]/g, '').replace(/([\u064E\u0650\u064F])\u0651/g, '\u0651$1'); // shadda before vowel
  const chars = [...clean];
  let out = '';
  let lastCons = ''; // last consonant sound, for shadda
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const first = i === 0;
    const last = i === chars.length - 1 || chars.slice(i + 1).every((x) => /[ً-ٰٟ]/.test(x));
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (MARK_VOWEL[c]) { if (!(c === '\u064E' && next === 'ا')) out += MARK_VOWEL[c]; continue; } // fatha + alif is one long vowel
    if (c === 'ّ') { out += lastCons; continue; }
    if (/[ً-ٟۖ-ۭ]/.test(c)) continue;
    if (c === 'ھ') { out += 'h'; continue; }
    if (c === 'ا') {
      const hasMark = next && MARK_VOWEL[next] && MARK_VOWEL[next] !== 'aa';
      out += first ? (hasMark ? '' : 'a') : 'aa';
    } else if (c === 'آ') out += 'aa';
    else if (c === 'و') out += first ? 'w' : 'o';
    else if (c === 'ی') out += first ? 'y' : last ? 'i' : 'e';
    else if (c === 'ے') out += 'e';
    else if (c === 'ئ') out += 'e';
    else if (c === 'ؤ') out += 'o';
    else if (c === 'أ') out += 'a';
    else if (c === 'ہ') out += last && prev && !VOWEL_LETTERS.has(prev) ? 'a' : 'h';
    else if (c in CONS) {
      out += CONS[c];
      if (CONS[c]) lastCons = CONS[c];
    } else out += c;
  }
  return out;
}
