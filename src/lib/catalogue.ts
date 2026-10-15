import { getCollection, render, type CollectionEntry } from 'astro:content';
import { collections, type CollectionDef } from '../catalogue';
import { countWords, formatDate } from './format';

export type Collection = (typeof collections)[number];

export interface Item {
  no: string; // "W-04"
  id: string; // "w-04"
  seq: number; // 4
  collection: Collection;
  title: string;
  date: Date;
  dateText: string; // "2026-04-11"
  year: string;
  kind: string;
  summary: string;
  status?: 'Active' | 'Done' | 'Paused';
  links: { label: string; href: string }[];
  custom: boolean;
  words: number;
  href: string; // "/w-04/"
  entry: CollectionEntry<'w'>;
}

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

// Hand-made pages: src/pages/p-05/index.astro or src/pages/p-05.astro.
const customPages = import.meta.glob('/src/pages/*-*{.astro,/index.astro}');
const customIds = new Set(
  Object.keys(customPages)
    .map((p) => /^\/src\/pages\/([a-z]-\d+)(?:\/index)?\.astro$/.exec(p)?.[1])
    .filter((id): id is string => !!id),
);

const byNewest = (a: Item, b: Item) => b.date.getTime() - a.date.getTime() || b.seq - a.seq;

export const collectionByLetter = (letter: string): Collection | undefined =>
  collections.find((c) => c.letter === letter);

export const collectionBySlug = (slug: string): Collection | undefined => collections.find((c) => c.slug === slug);

async function load(c: CollectionDef): Promise<Item[]> {
  const entries = (await getCollection(c.letter.toLowerCase() as 'w')) as CollectionEntry<'w'>[];
  const items: Item[] = [];
  for (const entry of entries) {
    const d = entry.data;
    if (d.draft && import.meta.env.PROD) continue;
    const seq = Number(entry.id.slice(2));
    if (d.custom && !customIds.has(entry.id)) {
      throw new Error(
        `${entry.id} has "custom: true" but there is no page for it. Create src/pages/${entry.id}/index.astro (or src/pages/${entry.id}.astro).`,
      );
    }
    items.push({
      no: entry.id.toUpperCase(),
      id: entry.id,
      seq,
      collection: c as Collection,
      title: d.title,
      date: d.date,
      dateText: formatDate(d.date),
      year: formatDate(d.date).slice(0, 4),
      kind: d.kind,
      summary: d.summary,
      status: d.status,
      links: d.links ?? [],
      custom: d.custom ?? false,
      words: countWords(entry.body ?? ''),
      href: `/${entry.id}/`,
      entry,
    });
  }
  return items;
}

/** Items of one collection, newest first. */
export async function getCollectionItems(letter: string): Promise<Item[]> {
  const c = collectionByLetter(letter);
  return c ? (await load(c)).sort(byNewest) : [];
}

/** Items of one collection in number order (1, 2, 3...): shelves, positions, neighbours. */
export async function getCollectionItemsByNumber(letter: string): Promise<Item[]> {
  return (await getCollectionItems(letter)).sort((a, b) => a.seq - b.seq);
}

/** Every published item, newest first. */
export async function getAllItems(): Promise<Item[]> {
  const lists = await Promise.all(collections.map(load));
  return lists.flat().sort(byNewest);
}

/** The N newest items across all collections. */
export async function getNewestItems(n: number): Promise<Item[]> {
  return (await getAllItems()).slice(0, n);
}

/** Look up by "W-04" or "w-04". */
export async function getItemByNumber(no: string): Promise<Item | undefined> {
  const id = no.toLowerCase();
  return (await getCollectionItems((id[0] ?? '').toUpperCase())).find((i) => i.id === id);
}

/** Position among the collection in number order, 1-based ("4 of 6"). */
export async function getPosition(item: Item): Promise<{ index: number; total: number }> {
  const list = await getCollectionItemsByNumber(item.collection.letter);
  return { index: list.findIndex((i) => i.id === item.id) + 1, total: list.length };
}

/** Previous and next by number order (gaps allowed). */
export async function getNeighbours(item: Item): Promise<{ prev?: Item; next?: Item }> {
  const list = await getCollectionItemsByNumber(item.collection.letter);
  const i = list.findIndex((x) => x.id === item.id);
  return { prev: list[i - 1], next: list[i + 1] };
}

/** Lowest and highest number present; null when the collection is empty. */
export async function getRange(letter: string): Promise<{ first: string; last: string } | null> {
  const list = await getCollectionItemsByNumber(letter);
  const first = list[0];
  const last = list[list.length - 1];
  return first && last ? { first: first.no, last: last.no } : null;
}

/** Per-collection counts, in registry order. */
export async function getCounts(): Promise<{ collection: Collection; count: number }[]> {
  return Promise.all(collections.map(async (c) => ({ collection: c, count: (await load(c)).length })));
}

export async function getTotalCount(): Promise<number> {
  return (await getAllItems()).length;
}

/** Earliest item year, or null if there are no items. */
export async function getFirstYear(): Promise<string | null> {
  const all = await getAllItems();
  return all.map((i) => i.year).sort()[0] ?? null;
}

/** Rendered Markdown plus its h2 headings (footnotes heading excluded). */
export async function renderItem(item: Item) {
  const { Content, headings } = await render(item.entry);
  const contents: Heading[] = headings
    .filter((h) => h.depth === 2 && h.slug !== 'footnote-label')
    .map((h) => ({ depth: h.depth, slug: h.slug, text: h.text }));
  return { Content, headings: contents };
}

