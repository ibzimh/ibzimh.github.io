// The only file that reads data files and the environment. Everything else gets plain text in.
import type { DataFile, RawInput } from './types';

const files = (g: Record<string, string>): DataFile[] =>
  Object.entries(g)
    .map(([path, text]) => ({ file: path.replace(/^\.\/data\//, ''), text }))
    .sort((a, b) => a.file.localeCompare(b.file));

export function readInput(): RawInput {
  return {
    sources: files(import.meta.glob<string>('./data/sources.yaml', { query: '?raw', import: 'default', eager: true })),
    features: files(import.meta.glob<string>('./data/features/*.yaml', { query: '?raw', import: 'default', eager: true })),
    places: files(import.meta.glob<string>('./data/places/*.csv', { query: '?raw', import: 'default', eager: true })),
    areas: files(import.meta.glob<string>('./data/areas/*.yaml', { query: '?raw', import: 'default', eager: true })),
    shapes: files(import.meta.glob<string>('./data/areas/shapes/*.geojson', { query: '?raw', import: 'default', eager: true })),
    accents: files(import.meta.glob<string>('./data/accents/*.yaml', { query: '?raw', import: 'default', eager: true })),
    findings: files(import.meta.glob<string>('./data/findings/*.csv', { query: '?raw', import: 'default', eager: true })),
    glossary: files(import.meta.glob<string>('./data/glossary.yaml', { query: '?raw', import: 'default', eager: true })),
    sample: {
      findings: files(import.meta.glob<string>('./data/sample/findings/*.csv', { query: '?raw', import: 'default', eager: true })),
      areas: files(import.meta.glob<string>('./data/sample/areas/*.yaml', { query: '?raw', import: 'default', eager: true })),
      accents: files(import.meta.glob<string>('./data/sample/accents/*.yaml', { query: '?raw', import: 'default', eager: true })),
    },
  };
}

export const isDev: boolean = import.meta.env.DEV;
export const today = (): string => new Date().toISOString().slice(0, 10);
