// Pure helpers: no content loading, safe to use anywhere.

/** Words in a Markdown/MDX body, ignoring code blocks, HTML/JSX tags and import/export lines. */
export function countWords(body: string): number {
  const text = body
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, ' ')
    .replace(/^\s*(import|export)\s.*$/gm, ' ')
    .replace(/^\[\^[^\]]+\]:/gm, ' ')
    .replace(/\]\([^)]*\)/g, '] ')
    .replace(/<[^>]*>/g, ' ');
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** 1400 -> "1,400 words". */
export function formatWords(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'word' : 'words'}`;
}

/** Date -> "2026-04-11" (UTC, so it matches the frontmatter). */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 1 -> "1 item", 6 -> "6 items". */
export function countLabel(n: number, singular = 'item', plural = 'items'): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "W-04" -> HTML with the dash wrapped in .d (for set:html). */
export function numberHtml(no: string): string {
  return no.replace('-', '<span class="d">-</span>');
}

/** "Web app" -> "web-app" (filter hash tokens). */
export function kindSlug(kind: string): string {
  return kind.toLowerCase().replace(/\s+/g, '-');
}
