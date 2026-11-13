// buildData: file contents in, checked and derived data out. Pure: no imports of files or env.
// Every problem in every file is collected and thrown as one Error.
import { linkAccents, parseAccents } from './check-accents';
import { linkAreas, parseAreas } from './check-areas';
import { checkFindings, countRows } from './check-findings';
import { checkGlossary } from './check-glossary';
import { checkPlaces } from './check-places';
import { checkSounds } from './check-sounds';
import { checkSources, sampleSources } from './check-sources';
import { derive, type Data } from './derive';
import { defaultGeo } from './geo';
import { buildIndex } from './ids';
import { newCtx } from './parse';
import type { BuildOpts, RawInput } from './types';

const ids = <T extends { id: string; was: string[] }>(m: Map<string, T>) => [...m.values()].map(({ id, was }) => ({ id, was }));

export function buildData(input: RawInput, opts: BuildOpts) {
  const ctx = newCtx();
  const geo = opts.geo ?? defaultGeo;

  // Samples: dev only, and only while the real findings have no rows.
  const usingSamples = opts.dev && !!input.sample && countRows(input.findings) === 0;
  const sample = usingSamples ? input.sample! : { findings: [], areas: [], accents: [] };
  const realSources = checkSources(ctx, input.sources);
  const sources = usingSamples ? new Map(sampleSources.map((s) => [s.key, s])) : realSources;

  const sounds = checkSounds(ctx, input.features);
  const places = checkPlaces(ctx, input.places, geo);
  const areas = parseAreas(ctx, [...input.areas, ...sample.areas], input.shapes);
  const accents = parseAccents(ctx, [...input.accents, ...sample.accents]);
  const index = buildIndex(ctx, { sound: ids(sounds), place: ids(places), area: ids(areas), accent: ids(accents) });
  linkAreas(ctx, areas, index);
  linkAccents(ctx, accents, index);
  const glossary = checkGlossary(ctx, input.glossary);

  const rows = usingSamples ? sample.findings : input.findings;
  const checked = checkFindings(ctx, rows, { sounds, sources, index, today: opts.today });
  const findings = opts.dev ? checked : checked.filter((f) => !f.draft);

  if (opts.dev && !usingSamples) {
    const used = new Set(findings.map((f) => f.source));
    for (const s of realSources.values()) if (!used.has(s.key)) ctx.warnings.push(`Dialect map: source "${s.key}" has no findings.`);
  }

  if (ctx.problems.length) {
    throw new Error(`Dialect map data has ${ctx.problems.length} ${ctx.problems.length === 1 ? 'problem' : 'problems'}:\n${ctx.problems.join('\n')}`);
  }

  const data: Data = {
    sources, realSourceCount: realSources.size, sounds, places, areas, accents, findings, glossary, usingSamples,
    oldIds: index.old, geo,
  };
  return { ...derive(data), warnings: ctx.warnings };
}
