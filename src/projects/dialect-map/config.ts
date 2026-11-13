// What the dialect map knows about: scales and their values, sound groups, countries, modes, plates.

/** The look of a dot. `none` is "nothing recorded". Also the CSS class of the dot. */
export type DotSymbol = 'full' | 'near' | 'half' | 'ring' | 'none' | 'opt0' | 'opt1' | 'opt2' | 'opt3' | 'opt4' | 'opt5';

/** Legend order. */
export const symbols: readonly DotSymbol[] = ['full', 'near', 'half', 'ring', 'none', 'opt0', 'opt1', 'opt2', 'opt3', 'opt4', 'opt5'];

export const optionSymbols = ['opt0', 'opt1', 'opt2', 'opt3', 'opt4', 'opt5'] as const;

export const noneLabel = 'Nothing recorded';

export interface ValueDef {
  id: string;
  label: string;
  symbol: DotSymbol;
}

/** Fixed scales. `options` has no fixed values: each sound lists its own, plus `mixed`. */
export const scales = {
  pair: {
    label: 'Pair',
    values: [
      { id: 'same', label: 'Same', symbol: 'full' },
      { id: 'nearly', label: 'Nearly the same', symbol: 'near' },
      { id: 'mixed', label: 'For some', symbol: 'half' },
      { id: 'different', label: 'Different', symbol: 'ring' },
    ],
  },
  change: {
    label: 'Change',
    values: [
      { id: 'yes', label: 'Yes', symbol: 'full' },
      { id: 'mixed', label: 'For some', symbol: 'half' },
      { id: 'no', label: 'No', symbol: 'ring' },
    ],
  },
  options: { label: 'Options', values: [] },
} as const satisfies Record<string, { label: string; values: readonly ValueDef[] }>;

export type ScaleId = keyof typeof scales;
export const scaleIds = Object.keys(scales) as ScaleId[];
export const mixedValue: ValueDef = { id: 'mixed', label: 'For some', symbol: 'half' };

/** Optional heading a sound can sit under. */
export const soundGroups = [
  { id: 'mergers-and-splits', label: 'Mergers and splits' },
  { id: 'vowels', label: 'Vowels' },
  { id: 'consonants', label: 'Consonants' },
  { id: 'shifts', label: 'Shifts' },
] as const;

export const modes = { say: 'said', hear: 'heard', both: 'said and heard' } as const;
export type Mode = keyof typeof modes;

/** Plates are maps. The US plate is the first; Britain and Ireland is still to come. basemap.ts holds the shapes. */
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

/** Countries and their region codes. A place id ends with "-" + its region code in lowercase. */
export const countries: Record<string, { name: string; regions: Record<string, string> }> = {
  US: { name: 'United States', regions: usStates },
  GB: { name: 'Great Britain', regions: { ENG: 'England', SCT: 'Scotland', WLS: 'Wales', NIR: 'Northern Ireland' } },
  IE: { name: 'Ireland', regions: { IE: 'Ireland' } },
  IM: { name: 'Isle of Man', regions: { IOM: 'Isle of Man' } },
};
