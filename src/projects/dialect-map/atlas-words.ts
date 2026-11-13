// Sounds as words people can say, and the dot symbols. Pure; used on the server and in the browser.
import type { AtlasSound } from './atlas';

export type Kind = 'yes' | 'nearly' | 'mixed' | 'no' | 'none' | `opt${number}`;

export const wordOf = (s: AtlasSound) => s.id.split('-')[0];

export function kindOf(s: AtlasSound, val: string): Kind {
  if (s.scale === 'options') {
    if (val === 'mixed') return 'mixed';
    return `opt${Math.max(0, s.options!.findIndex((o) => o.id === val))}`;
  }
  if (s.scale === 'pair') return ({ same: 'yes', nearly: 'nearly', mixed: 'mixed', different: 'no' } as Record<string, Kind>)[val];
  return val as Kind;
}

export function notation(s: AtlasSound, val: string): string {
  if (s.scale === 'pair') {
    const w = s.words!;
    if (val === 'different') return w.join(' ≠ ');
    if (val === 'nearly') return w.join(' ≈ ');
    return w.join(' = ') + (val === 'mixed' ? ' for some' : '');
  }
  if (s.scale === 'change') {
    if (val === 'yes') return `${s.from} → ${s.to}`;
    if (val === 'mixed') return `${s.from} → ${s.to} for some`;
    return `${s.from} stays ${s.from}`;
  }
  if (val === 'mixed') return `${wordOf(s)}, sources differ`;
  const o = s.options!.find((x) => x.id === val);
  return `${wordOf(s)}, ${o ? o.label.replace(/^[^,]*,\s*/, '') : val}`;
}

export function rowLabel(s: AtlasSound): string {
  if (s.scale === 'pair') return s.words!.join(' · ');
  if (s.scale === 'change') return `${s.from} → ${s.to}`;
  return wordOf(s);
}

export const backLabel = (s: AtlasSound) => (s.scale === 'pair' ? s.words!.join(' = ') : s.scale === 'change' ? `${s.from} → ${s.to}` : wordOf(s));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The big question, as HTML with the example words in italics. */
export function question(s: AtlasSound): string {
  const em = (x: string) => `<em>${esc(x)}</em>`;
  if (s.scale === 'pair') {
    const w = s.words!;
    return `Do ${w.length === 2 ? `${em(w[0])} and ${em(w[1])}` : `${em(w[0])}, ${em(w[1])} and ${em(w[2])}`} sound the same?`;
  }
  if (s.scale === 'change') return `Does ${em(s.from!)} become ${em(s.to!)}?`;
  return `How is ${em(wordOf(s))} said?`;
}

/** Every answer a sound can get, in key order. */
export function answers(s: AtlasSound): { val: string; kind: Kind; text: string }[] {
  const vals = s.scale === 'pair' ? ['same', 'nearly', 'mixed', 'different'] : s.scale === 'change' ? ['yes', 'mixed', 'no'] : [...s.options!.map((o) => o.id), 'mixed'];
  return vals.map((val) => ({ val, kind: kindOf(s, val), text: notation(s, val) }));
}

export function symInner(k: string): string {
  switch (k) {
    case 'yes': case 'opt0': return '<circle class="s-red" cx="6" cy="6" r="4.6"/>';
    case 'opt1': return '<rect class="s-red" x="1.8" y="1.8" width="8.4" height="8.4"/>';
    case 'opt2': return '<path class="s-red" d="M6 1.2L10.9 10.4H1.1Z"/>';
    case 'opt3': return '<path class="s-red" d="M6 .9L11.1 6L6 11.1L.9 6Z"/>';
    case 'opt4': return '<rect class="s-ring" x="1.8" y="1.8" width="8.4" height="8.4"/>';
    case 'opt5': return '<path class="s-redline" d="M6 1.2V10.8M1.2 6H10.8"/>';
    case 'mixed': return '<circle class="s-ring" cx="6" cy="6" r="4.6"/><path class="s-red" d="M6 1.4A4.6 4.6 0 0 0 6 10.6Z"/>';
    case 'nearly': return '<circle class="s-ring" cx="6" cy="6" r="4.6"/><circle class="s-red" cx="6" cy="6" r="1.9"/>';
    case 'no': return '<circle class="s-ring" cx="6" cy="6" r="4.6"/>';
    default: return '<circle class="s-grey" cx="6" cy="6" r="1.8"/>';
  }
}

export const sym = (k: string) => `<svg class="sym" viewBox="0 0 12 12" aria-hidden="true">${symInner(k)}</svg>`;
