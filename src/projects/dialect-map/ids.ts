// Live ids, old ids (`was`) and how a reference resolves. Dots and areas share one id space.
import { mean, type Ctx } from './parse';
import type { IdType, OldIds } from './types';

export interface IdEntry {
  id: string;
  was: string[];
}

export interface Index {
  old: OldIds;
  live(type: IdType): ReadonlySet<string>;
  /** The live id for `id` (itself, or what it was renamed to), or undefined. */
  resolve(types: IdType | IdType[], id: string): { type: IdType; id: string } | undefined;
  /** ` Did you mean "x"?` over live ids of these types. */
  didYouMean(types: IdType | IdType[], id: string): string;
}

const arr = <T>(x: T | T[]) => (Array.isArray(x) ? x : [x]);

export function buildIndex(ctx: Ctx, lists: Record<IdType, IdEntry[]>): Index {
  const types = Object.keys(lists) as IdType[];
  const live = Object.fromEntries(types.map((t) => [t, new Set(lists[t].map((x) => x.id))])) as Record<IdType, Set<string>>;
  const old = { sound: {}, place: {}, area: {}, accent: {} } as OldIds;

  for (const a of live.area) {
    if (live.place.has(a)) ctx.problem(`area ${a}`, `id "${a}" is used by both a place and an area.`);
  }
  for (const t of types) {
    // dots and areas are one id space, so an old id may not match either
    const space = t === 'place' || t === 'area' ? [live.place, live.area] : [live[t]];
    for (const { id, was } of lists[t]) {
      for (const w of was) {
        if (space.some((s) => s.has(w))) ctx.problem(`${t} ${id}`, `old id "${w}" is also a live id. An old id can't be one that is still in use.`);
        else if (old[t][w] && old[t][w] !== id) ctx.problem(`${t} ${id}`, `old id "${w}" is also listed for ${old[t][w]}.`);
        else old[t][w] = id;
      }
    }
  }
  // old ids of a dot and of an area share a space too
  for (const w of Object.keys(old.place)) {
    if (old.area[w]) ctx.problem(`area ${old.area[w]}`, `old id "${w}" is also an old id of place ${old.place[w]}.`);
  }

  const resolve: Index['resolve'] = (ts, id) => {
    for (const t of arr(ts)) {
      if (live[t].has(id)) return { type: t, id };
      if (old[t][id]) return { type: t, id: old[t][id] };
    }
    return undefined;
  };
  const didYouMean: Index['didYouMean'] = (ts, id) => mean(id, arr(ts).flatMap((t) => [...live[t]]));
  return { old, live: (t) => live[t], resolve, didYouMean };
}
