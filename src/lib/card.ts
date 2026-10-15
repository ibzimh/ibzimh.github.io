import { collections } from '../catalogue';
import {
  collectionByLetter,
  getCollectionItemsByNumber,
  getRange,
  type Collection,
  type Item,
} from './catalogue';
import { countLabel, formatWords } from './format';
import { sketches } from './sketches';

// What the catalogue card shows. Every previewable element carries one of these as data- attributes.
export interface CardState {
  num: string;
  label: string;
  title: string;
  meta: string;
  line: string;
  sketch: string; // project kind, or ''
}

export interface ShelfCell {
  no: string;
  title: string;
  href: string;
  state: CardState;
}

export interface Shelf {
  collection: Collection;
  cells: ShelfCell[];
}

export interface NavLink {
  no: string;
  title: string;
  href: string;
}

export interface CardProps {
  state: CardState;
  shelves?: Shelf[];
  cur?: string; // number of the shelf cell to mark
  previews?: boolean; // list pages: the script swaps the card on hover/focus
  links?: { label: string; href: string }[];
  toc?: { slug: string; text: string }[];
  nav?: { prev?: NavLink; next?: NavLink };
}

export const itemMeta = (item: Item): string =>
  item.collection.show === 'writing'
    ? `${item.kind} · ${item.dateText} · ${formatWords(item.words)}`
    : [item.kind, item.year, item.status].filter(Boolean).join(' · ');

export const itemState = (item: Item, label: string): CardState => ({
  num: item.no,
  label,
  title: item.title,
  meta: itemMeta(item),
  line: item.summary,
  sketch: item.collection.show === 'project' && sketches[item.kind] ? item.kind : '',
});

/** "Writing · 4 of 6" */
export const positionLabel = (c: Collection, index: number, total: number) => `${c.name} · ${index} of ${total}`;

/** Card states for the given items, labelled with their place in their collection. */
export async function itemStates(items: Item[]): Promise<Map<string, CardState>> {
  const lists = new Map<string, Item[]>();
  const map = new Map<string, CardState>();
  for (const item of items) {
    const letter = item.collection.letter;
    if (!lists.has(letter)) lists.set(letter, await getCollectionItemsByNumber(letter));
    const list = lists.get(letter) ?? [];
    map.set(
      item.id,
      itemState(item, positionLabel(item.collection, list.findIndex((i) => i.id === item.id) + 1, list.length)),
    );
  }
  return map;
}

/** What a collection row shows: the letter alone, huge. */
export async function collectionState(c: Collection): Promise<CardState> {
  const n = (await getCollectionItemsByNumber(c.letter)).length;
  const range = await getRange(c.letter);
  return {
    num: c.letter,
    label: 'Collection',
    title: c.name,
    meta: range ? `${countLabel(n)} · ${range.first} to ${range.last}` : countLabel(n),
    line: '',
    sketch: '',
  };
}

/** Shelves (one small number cell per item) for the given collections. */
export async function getShelves(letters: string[]): Promise<Shelf[]> {
  const shelves: Shelf[] = [];
  for (const letter of letters) {
    const collection = collectionByLetter(letter);
    if (!collection) continue;
    const items = await getCollectionItemsByNumber(letter);
    const states = await itemStates(items);
    shelves.push({
      collection,
      cells: items.map((i) => ({ no: i.no, title: i.title, href: i.href, state: states.get(i.id) as CardState })),
    });
  }
  return shelves;
}

export const allShelves = () => getShelves(collections.map((c) => c.letter));

/** State -> data- attributes for a previewable element. */
export function cardAttrs(s: CardState) {
  return {
    'data-card-num': s.num,
    'data-card-label': s.label,
    'data-card-title': s.title,
    'data-card-meta': s.meta,
    'data-card-line': s.line,
    'data-card-sketch': s.sketch,
  };
}
