/*
 * Dialect map data, ready for pages. Build time only (never import from client code).
 * Folder layout and file formats are described in the `#` comments at the top of each data file.
 *
 * Reads data/ once (read.ts), checks and derives it (build.ts, derive.ts) and re-exports the result:
 *   places, mapPlaces, features, areas, accents, sources, findings, glossary, usingSamples
 *   placeById, featureById, areaById, accentById, sourceById, oldIds ({ sound, place, area, accent }: old id -> new id)
 *   cell({type, id}, featureId), placeCell(placeId, featureId), symbolOf(placeId, featureId)
 *   counts(featureId), countsByPlate(featureId), featurePlates(featureId), featureSources, differCount
 *   accentProfile(accentId), areasOfDot(dotId), accentsAtDot(dotId), coverage(), drafts()
 *   builtAreas(plateId), areaOverlaps(plateId): area shapes and overlaps on a plate
 *   recent(n), sourceStats, stats, nameOf(subject)
 * atlasData(plateId): the one small object a plate's page sends to the browser (atlas.ts).
 * Any problem in any file throws one Error listing all of them.
 */
import { buildData } from './build';
import { buildAtlas, type Atlas } from './atlas';
import type { PlateId } from './geo/plates';
import { isDev, readInput, today } from './read';

const data = buildData(readInput(), { dev: isDev, today: today() });
if (isDev) for (const w of data.warnings) console.warn(w);

export const {
  places, mapPlaces, features, areas, accents, sources, findings, glossary, usingSamples,
  placeById, featureById, areaById, accentById, sourceById, oldIds,
  cell, placeCell, symbolOf, counts, countsByPlate, featurePlates, featureSources, differCount,
  accentProfile, areasOfDot, accentsAtDot, builtAreas, areaOverlaps, coverage, drafts, recent, sourceStats, stats, nameOf,
} = data;

const atlases = new Map<string, Atlas>();
export const atlasData = (plateId: PlateId): Atlas => {
  let a = atlases.get(plateId);
  if (!a) atlases.set(plateId, (a = buildAtlas(data, plateId)));
  return a;
};
export { pageText } from './parse';
export type { Accent, Area, Cell, Feature, Finding, GlossaryEntry, Place, Source, Subject } from './types';
