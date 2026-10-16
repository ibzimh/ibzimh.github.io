// What the dialect map can show: kinds of feature, their values, how values look, and the maps.

export const kinds = [
  { id: 'merger', label: 'Merger', plural: 'Mergers', values: ['merged', 'near-merged', 'in-progress', 'distinct'] },
  { id: 'shift', label: 'Vowel shift', plural: 'Vowel shifts', values: ['present', 'partial', 'absent'] },
  { id: 'sound', label: 'Other sound', plural: 'Other sounds', values: ['present', 'partial', 'absent'] },
] as const;

export type Kind = (typeof kinds)[number];
export type KindId = Kind['id'];
export type Value = Kind['values'][number];

/** The look of a dot. `none` is "nothing recorded". Also the CSS class of the dot. */
export type DotSymbol = 'full' | 'near' | 'half' | 'ring' | 'none';

/** Legend order. */
export const symbols: readonly DotSymbol[] = ['full', 'near', 'half', 'ring', 'none'];

export const noneLabel = 'Nothing recorded';

export const valueInfo: Record<Value, { label: string; symbol: DotSymbol; meaning: string }> = {
  merged: { label: 'Merged', symbol: 'full', meaning: 'the two sounds are the same for people there.' },
  'near-merged': {
    label: 'Near-merged',
    symbol: 'near',
    meaning: "people make a tiny difference when they speak but can't hear it.",
  },
  'in-progress': {
    label: 'In progress',
    symbol: 'half',
    meaning: "mixed; usually younger people have it and older people don't.",
  },
  distinct: { label: 'Distinct', symbol: 'ring', meaning: 'the sounds are kept apart.' },
  present: { label: 'Present', symbol: 'full', meaning: 'the feature is there.' },
  partial: { label: 'Partial', symbol: 'half', meaning: 'the feature is partly there.' },
  absent: { label: 'Absent', symbol: 'ring', meaning: 'the feature is not there.' },
};

export const modes = { say: 'said', hear: 'heard', both: 'said and heard' } as const;
export type Mode = keyof typeof modes;

/** Maps are a registry; the US map is the first. basemap.ts holds the shapes and projection by id. */
export const maps = [{ id: 'us', name: 'United States', countries: ['US'] }] as const;
export type MapId = (typeof maps)[number]['id'];

export const mapForCountry = (country: string) => maps.find((m) => (m.countries as readonly string[]).includes(country));

/** US region codes (states and DC) to names. */
export const usStates: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
