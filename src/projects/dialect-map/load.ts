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
 * For the old page: legend(feature), featureGroups, legacyValue(feature, value) give the old wording.
 * Any problem in any file throws one Error listing all of them.
 */
import { buildData } from './build';
import { legacyGroups, legacyLegend } from './legacy';
import { isDev, readInput, today } from './read';

const data = buildData(readInput(), { dev: isDev, today: today() });
if (isDev) for (const w of data.warnings) console.warn(w);

export const {
  places, mapPlaces, features, areas, accents, sources, findings, glossary, usingSamples,
  placeById, featureById, areaById, accentById, sourceById, oldIds,
  cell, placeCell, symbolOf, counts, countsByPlate, featurePlates, featureSources, differCount,
  accentProfile, areasOfDot, accentsAtDot, builtAreas, areaOverlaps, coverage, drafts, recent, sourceStats, stats, nameOf,
} = data;

export const featureGroups = legacyGroups(features);
export const legend = legacyLegend;
export { legacyValue } from './legacy';
export { pageText } from './parse';
export type { Accent, Area, Cell, Feature, Finding, GlossaryEntry, Place, Source, Subject } from './types';
