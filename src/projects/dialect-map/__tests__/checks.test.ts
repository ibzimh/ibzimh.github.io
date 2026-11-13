// For every check: feed a broken file, expect the friendly message.
import { describe, expect, it } from 'vitest';
import { build, edit, f, fail, valid, with_ } from './fixture';

const has = (msg: string, ...bits: string[]) => bits.forEach((b) => expect(msg).toContain(b));

describe('valid fixture', () => {
  it('builds', () => {
    expect(fail(valid())).toBe('');
  });
});

describe('sources', () => {
  it('reports a bad key, year, data range and link', () => {
    has(fail(edit('sources', 'key: s1', 'key: S 1')), 'sources.yaml S 1', 'should use lowercase letters');
    has(fail(edit('sources', 'published: 2006', 'published: soon')), 'published should be a year');
    has(fail(edit('sources', 'data: [1992, 1999]', 'data: [1999, 1992]')), 'data years go backwards');
    has(fail(edit('sources', 'data: [1992, 1999]', 'data: [1992, 2020]')), 'after it was published');
    has(fail(edit('sources', 'published: 2006', 'published: 2006\n  link: not a url')), 'isn\'t a web address');
  });
  it('rejects a duplicate key and an unknown field with a hint', () => {
    has(fail(edit('sources', 'key: s2', 'key: s1')), 'is used twice');
    has(fail(edit('sources', 'citation: A book.', 'citaton: A book.')), 'unknown field "citaton"', 'Did you mean "citation"?');
  });
});

describe('sounds', () => {
  it('needs a known scale, with a hint', () => {
    has(fail(edit('features', 'scale: pair', 'scale: pare')), 'features/sounds.yaml cot-caught', '"pare" isn\'t a scale', 'Did you mean "pair"?');
    has(fail(edit('features', 'scale: pair\n  words: [cot, caught]\n  group: mergers-and-splits', 'words: [cot, caught]')), 'needs scale');
  });
  it('checks the group', () => {
    has(fail(edit('features', 'group: mergers-and-splits', 'group: vowles')), '"vowles" isn\'t a group', 'Did you mean "vowels"?');
  });
  it('checks pair words', () => {
    has(fail(edit('features', 'words: [cot, caught]', 'words: [cot]')), 'words should be 2 or 3 words');
    has(fail(edit('features', 'words: [cot, caught]', 'words: [a, b, c, d]')), 'words should be 2 or 3 words');
  });
  it('checks change from and to', () => {
    has(fail(edit('features', '  from: car\n', '')), 'dropping-r', 'needs from');
    has(fail(edit('features', '  to: cah\n', '')), 'needs to');
  });
  it('checks options', () => {
    has(fail(edit('features', '  word: bath\n', '')), 'needs word');
    has(fail(edit('features', /    - \{id: long.*\n/, '')), 'options should be a list of 2 to 6');
    has(fail(edit('features', 'id: long', 'id: short')), 'id "short" is used twice');
    has(fail(edit('features', 'id: long', 'id: mixed')), 'id "mixed" is kept');
    has(fail(edit('features', '{id: short, label: "short, like trap"}', '{id: short, lable: "x"}')), 'unknown field "lable"', 'Did you mean "label"?');
  });
  it('rejects fields from another scale', () => {
    has(fail(edit('features', 'words: [cot, caught]', 'words: [cot, caught]\n  from: a')), 'from doesn\'t belong to scale "pair"');
  });
  it('keeps required fields and ids', () => {
    has(fail(edit('features', '  about: Whether cot and caught sound the same.\n', '')), 'cot-caught', 'needs about');
    has(fail(edit('features', 'id: bath', 'id: cot-caught')), 'id "cot-caught" is used twice');
    has(fail(edit('features', 'was: [r-less]', 'was: r-less')), 'was should be a list of text');
  });
  it('accepts also as a plain string or a list', () => {
    const b = build(edit('features', 'also: LOT–THOUGHT merger', 'also: [a, b]'));
    expect(b.featureById.get('cot-caught')!.also).toEqual(['a', 'b']);
    expect(build(valid()).featureById.get('cot-caught')!.also).toEqual(['LOT–THOUGHT merger']);
  });
});

describe('places', () => {
  it('checks the id ends with the region code', () => {
    has(fail(edit('places', 'boston-ma,Boston', 'boston,Boston')), 'places/places.csv line 3', 'should end with "-ma"');
  });
  it('checks country, region and rank', () => {
    has(fail(edit('places', 'boston-ma,Boston,MA,US', 'boston-ma,Boston,MA,UX')), '"UX" isn\'t a country', 'Did you mean "US"?');
    has(fail(edit('places', 'leeds-eng,Leeds,ENG', 'leeds-eng,Leeds,ENX')), '"ENX" isn\'t a Great Britain region code', 'Did you mean "ENG"?');
    has(fail(edit('places', ',1,boston', ',9,boston')), 'rank "9" should be 1, 2 or 3');
  });
  it('checks lat and lon', () => {
    has(fail(edit('places', '42.36,-71.06', '142.36,-71.06')), 'lat "142.36"');
    has(fail(edit('places', '42.36,-71.06', '42.36,x')), 'lon "x"');
  });
  it('rejects a duplicate id and unknown columns with a hint', () => {
    has(fail(edit('places', 'leeds-eng,Leeds', 'boston-ma,Leeds')), 'is used twice');
    has(fail(edit('places', 'name,region', 'nmae,region')), 'unknown column "nmae"', 'Did you mean "name"?');
  });
  it('reports a point that falls off an existing plate', () => {
    const geoOff = { plateForCountry: () => 'us', project: () => null };
    has(fail(valid(), { geo: geoOff }), 'falls outside the United States map');
  });
  it('accepts a place whose plate does not exist, with a warning', () => {
    const b = build(valid());
    const leeds = b.placeById.get('leeds-eng')!;
    expect([leeds.plate, leeds.x, leeds.y]).toEqual([null, null, null]);
    expect(b.warnings.join('\n')).toContain('2 places in GB not drawn yet');
    expect(b.mapPlaces.map((p) => p.id)).toEqual(['boston-ma']);
  });
  it('reads also, rank and was', () => {
    const p = build(valid()).placeById.get('liverpool-eng')!;
    expect(p.also).toEqual(['Scouseland', 'The Pool']);
    expect(p.rank).toBe(3);
    expect(build(valid()).placeById.get('leeds-eng')!.rank).toBe(2);
  });
});

describe('areas', () => {
  const area = (id: string, rest: string) => `- id: ${id}\n  name: X\n  country: GB\n${rest}\n`;
  const withAreas = (text: string) => ({ ...valid(), areas: [...valid().areas, f('areas/more.yaml', text)] });

  it('needs exactly one way of being made', () => {
    has(fail(withAreas(area('a', ''))), 'areas/more.yaml a', 'needs exactly one of units, drawn, around or of');
    has(fail(withAreas(area('a', '  of: [b]\n  drawn: north.geojson'))), 'found drawn and of');
  });
  it('checks units', () => {
    has(fail(withAreas(area('a', '  units: {set: us-states, ids: []}'))), 'units needs ids');
    has(fail(withAreas(area('a', '  units: {sett: us-states, ids: [PA]}'))), 'unknown field "sett"', 'Did you mean "set"?');
  });
  it('checks the drawn file exists and is a polygon', () => {
    has(fail(withAreas(area('a', '  drawn: nort.geojson'))), 'drawn file "nort.geojson" isn\'t in areas/shapes', 'Did you mean "north.geojson"?');
    const withShape = (text: string) => ({ ...withAreas(area('a', '  drawn: p.geojson')), shapes: [...valid().shapes, f('areas/shapes/p.geojson', text)] });
    has(fail(withShape('{nope')), 'isn\'t valid JSON');
    has(fail(withShape('{"type":"Point","coordinates":[0,0]}')), 'has Point in it; only Polygon or MultiPolygon work');
    expect(fail(withShape('{"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,0]]]]}'))).toBe('');
  });
  it('checks around', () => {
    has(fail(edit('areas', 'km: 15', 'km: 0')), 'around km should be a number above 0');
    has(fail(edit('areas', 'km: 15', 'km: far')), 'around km should be a number above 0');
    has(fail(edit('areas', 'place: liverpool-eng', 'place: liverpol-eng')), 'no place called "liverpol-eng"', 'Did you mean "liverpool-eng"?');
    has(fail(edit('areas', 'place: liverpool-eng', 'place: pa-oh')), 'is an area; it needs a dot');
  });
  it('checks of and minus', () => {
    has(fail(edit('areas', 'of: [north-of-england]', 'of: [north-of-engand]')), 'no area called "north-of-engand" in of', 'Did you mean "north-of-england"?');
    has(fail(edit('areas', 'of: [north-of-england]', 'of: [boston-ma]')), 'is a place; it needs an area');
    has(fail(edit('areas', 'country: US\n  units', 'country: US\n  minus: [x]\n  units')), 'minus only works together with of');
  });
  it('rejects circles', () => {
    const text = area('a', '  of: [b]') + area('b', '  of: [c]') + area('c', '  of: [a]');
    has(fail(withAreas(text)), 'goes round in a circle: a → b → c → a');
    has(fail(withAreas(area('a', '  of: [a]'))), 'a → a');
    has(fail(withAreas(area('a', '  of: [b]') + area('b', '  of: [c]') + area('c', '  of: [b]'))), 'b → c → b');
  });
  it('checks country, edge and ids', () => {
    has(fail(edit('areas', 'country: US', 'country: XX')), '"XX" isn\'t a country');
    has(fail(edit('areas', 'drawn: north.geojson', 'drawn: north.geojson\n  edge: sharp')), '"sharp" isn\'t an edge');
    has(fail(edit('areas', 'id: merseyside', 'id: pa-oh')), 'id "pa-oh" is used twice');
  });
  it('defaults edge from how it is made', () => {
    const b = build(valid());
    expect(b.areaById.get('pa-oh')!.edge).toBe('exact');
    expect(b.areaById.get('merseyside')!.edge).toBe('rough');
    expect(build(edit('areas', 'drawn: north.geojson', 'drawn: north.geojson\n  edge: exact')).areaById.get('north-of-england')!.edge).toBe('exact');
  });
  it('shares one id space with places', () => {
    has(fail(edit('areas', 'id: merseyside', 'id: boston-ma')), 'id "boston-ma" is used by both a place and an area');
  });
  it('does not check that unit ids exist', () => {
    expect(fail(withAreas(area('a', '  units: {set: us-states, ids: [ZZ]}')))).toBe('');
  });
});

describe('accents', () => {
  it('checks tie and unknown fields', () => {
    has(fail(edit('accents', 'tie: social', 'tie: socal')), 'accents/accents.yaml rp', '"socal" isn\'t a tie', 'Did you mean "social"?');
    has(fail(edit('accents', 'where: The north.', 'were: The north.')), 'unknown field "were"', 'Did you mean "where"?');
    has(fail(edit('accents', '  where: Among some educated speakers.\n', '')), 'rp', 'needs where');
  });
  it('checks core and wider references', () => {
    has(fail(edit('accents', 'core: [merseyside]', 'core: [merseysid]')), 'no place or area called "merseysid" in core', 'Did you mean "merseyside"?');
    has(fail(edit('accents', 'wider: [north-of-england]', 'wider: [nowhere]')), 'in wider');
  });
  it('needs a place for a place tie', () => {
    has(fail(edit('accents', 'core: [north-of-england]', 'core: []')), 'northern-english', 'tie place needs at least one place or area in core or wider');
    expect(fail(edit('accents', /tie: social/, 'tie: social\n  core: []'))).toBe('');
  });
  it('checks parents', () => {
    has(fail(edit('accents', 'parent: northern-english', 'parent: northern-englsh')), 'no accent called "northern-englsh" as parent', 'Did you mean "northern-english"?');
    has(fail(edit('accents', 'parent: northern-english', 'parent: scouse')), 'parents go round in a circle: scouse → scouse');
    has(
      fail(edit('accents', 'where: The north.', 'where: The north.\n  parent: scouse')),
      'parents go round in a circle',
    );
  });
  it('checks listen urls', () => {
    has(fail(edit('accents', 'https://example.com/clip', 'example dot com')), 'listen 1', 'isn\'t a web address');
    has(fail(edit('accents', '{label: A clip, url:', '{lable: A clip, url:')), 'unknown field "lable"');
  });
  it('flags group names a letter or two apart', () => {
    has(fail(edit('accents', 'group: Northern England\n- id: rp', 'group: Northen England\n- id: rp')), 'accent group', 'is almost the same as', 'Did you mean');
  });
  it('rejects a duplicate id and an unknown country', () => {
    has(fail(edit('accents', 'id: rp', 'id: scouse')), 'id "scouse" is used twice');
    has(fail(edit('accents', 'country: GB\n  tie: social', 'country: XX\n  tie: social')), '"XX" isn\'t a country');
  });
});

describe('findings', () => {
  const rows = (text: string) => with_('findings', 'findings/findings.csv', text);
  const head = 'place,accent,feature,value,source,page,added,checked,mode,ages,who,note\n';

  it('needs exactly one of place and accent', () => {
    has(fail(rows(`${head},,cot-caught,same,s1,1,2026-01-01,2026-01-02,,,,`)), 'findings/findings.csv line 2', 'needs a place or an accent');
    has(fail(rows(`${head}boston-ma,rp,cot-caught,same,s1,1,2026-01-01,2026-01-02,,,,`)), 'has both a place and an accent');
  });
  it('checks references with hints', () => {
    has(fail(edit('findings', 'boston-ma,,cot-caught,same', 'bostn-ma,,cot-caught,same')), 'no place called "bostn-ma"', 'Did you mean "boston-ma"?');
    has(fail(edit('findings', ',scouse,dropping-r', ',scous,dropping-r')), 'no accent called "scous"', 'Did you mean "scouse"?');
    has(fail(edit('findings', 'cot-caught,same,s1', 'cot-cought,same,s1')), 'no feature called "cot-cought"', 'Did you mean "cot-caught"?');
    has(fail(edit('findings', 'cot-caught,same,s1', 'cot-caught,same,s3')), 'no source called "s3"', 'Did you mean');
  });
  it('checks the value against the sound\'s scale', () => {
    has(fail(edit('findings', 'cot-caught,same,s1', 'cot-caught,sam,s1')), '"sam" isn\'t a value for cot-caught (scale: pair)', 'Did you mean "same"?', 'Use same, nearly, mixed or different');
    has(fail(edit('findings', 'dropping-r,yes,s1,5,2026-01-01,2026-01-02,,,,\n,scouse', 'dropping-r,same,s1,5,2026-01-01,2026-01-02,,,,\n,scouse')), 'isn\'t a value for dropping-r (scale: change)');
    has(fail(edit('findings', 'bath,short,s1,3', 'bath,tall,s1,3')), 'isn\'t a value for bath (scale: options)', 'Use short, long or mixed');
    expect(fail(edit('findings', 'bath,short,s1,3', 'bath,mixed,s1,3'))).toBe('');
  });
  it('checks mode, added and checked', () => {
    has(fail(edit('findings', 'cot-caught,same,s1,61,2026-01-01,2026-01-02,,', 'cot-caught,same,s1,61,2026-01-01,2026-01-02,sy,')), '"sy" isn\'t a mode', 'Did you mean "say"?');
    has(fail(edit('findings', '2026-01-01,2026-01-02,,,,\nboston-ma,,cot-caught,different', '2026-13-01,2026-01-02,,,,\nboston-ma,,cot-caught,different')), 'added: "2026-13-01" isn\'t a real date');
    has(fail(edit('findings', 'same,s1,61,2026-01-01,2026-01-02', 'same,s1,61,2026-01-01,2025-12-31')), 'checked (2025-12-31) is before added (2026-01-01)');
    has(fail(edit('findings', 'same,s1,61,2026-01-01,2026-01-02', 'same,s1,61,2026-01-01,2099-01-01')), 'checked: "2099-01-01" is in the future');
    has(fail(edit('findings', 'same,s1,61,2026-01-01,2026-01-02', 'same,s1,61,2026-01-01,yesterday')), 'checked: "yesterday" isn\'t a date');
  });
  it('needs the required columns and values', () => {
    has(fail(rows('place,feature,value,source,added\n')), 'missing column "page"');
    has(fail(rows(`${head}boston-ma,,cot-caught,same,s1,,2026-01-01,2026-01-02,,,,`)), 'needs page');
    has(fail(rows(`${head}boston-ma,,cot-caught,same,s1,1,,,,,,`)), 'needs added');
  });
  it('rejects wrong column counts', () => {
    has(fail(rows(`${head}boston-ma,cot-caught`)), 'has 2 columns, expected 12', 'Quote any text that contains a comma');
  });
  it('rejects duplicates, now including accent and who', () => {
    const dup = 'boston-ma,,cot-caught,same,s1,61,2026-01-01,2026-01-02,,,,';
    has(fail(rows(`${head}${dup}\n${dup}`)), 'same place or accent, feature, source, mode, ages and who as findings/findings.csv line 2');
    expect(fail(rows(`${head}${dup}\nboston-ma,,cot-caught,same,s1,61,2026-01-01,2026-01-02,,,Older men,`))).toBe('');
    const acc = ',scouse,cot-caught,same,s1,61,2026-01-01,2026-01-02,,,,';
    has(fail(rows(`${head}${acc}\n${acc}`)), 'same place or accent');
  });
  it('reads rows from every file in the folder', () => {
    const input = { ...valid(), findings: [...valid().findings, f('findings/more.csv', `${head}boston-ma,,cot-caught,bad,s1,1,2026-01-01,2026-01-02,,,,`)] };
    has(fail(input), 'findings/more.csv line 2');
  });
  it('allows a finding about an area', () => {
    expect(build(valid()).cell({ type: 'place', id: 'north-of-england' }, 'bath').shown?.value).toBe('short');
  });
});

describe('old ids', () => {
  it('rejects an old id that is still live', () => {
    has(fail(edit('features', 'was: [r-less]', 'was: [bath]')), 'old id "bath" is also a live id');
    has(fail(edit('areas', 'was: [mersey]', 'was: [boston-ma]')), 'old id "boston-ma" is also a live id');
    has(fail(edit('places', 'boston-mass-ma', 'pa-oh')), 'old id "pa-oh" is also a live id');
  });
  it('rejects an old id claimed twice', () => {
    has(fail(edit('features', 'was: [r-less]', 'was: [r-less]\n- id: other\n  name: O\n  scale: change\n  from: a\n  to: b\n  about: x\n  was: [r-less]')), 'old id "r-less" is also listed for dropping-r');
  });
});

describe('glossary', () => {
  it('needs term and plain, and no duplicates', () => {
    has(fail(with_('glossary', 'glossary.yaml', '- term: merger\n')), 'glossary.yaml merger', 'needs plain');
    has(fail(with_('glossary', 'glossary.yaml', '- plain: x\n')), 'needs term');
    has(fail(with_('glossary', 'glossary.yaml', '- term: Merger\n  plain: a\n- term: merger\n  plain: b\n')), 'term "merger" is used twice');
    has(fail(with_('glossary', 'glossary.yaml', '- term: a\n  plain: b\n  alos: [x]\n')), 'unknown field "alos"', 'Did you mean "also"?');
  });
});

describe('file problems', () => {
  it('reports every problem at once, with file names', () => {
    const input = edit('features', 'scale: pair', 'scale: pare');
    input.sources = [f('sources.yaml', '- key: S1\n')];
    const msg = fail(input);
    has(msg, 'Dialect map data has', 'problems:', 'sources.yaml S1', 'features/sounds.yaml cot-caught');
  });
  it('reports broken yaml and csv', () => {
    has(fail(with_('features', 'features/sounds.yaml', 'a: [')), 'features/sounds.yaml');
    has(fail(with_('features', 'features/sounds.yaml', 'a: 1')), 'should be a list of entries');
    has(fail(with_('places', 'places/places.csv', '"open,quote\n')), 'a quote opened on line 1 never closes');
    has(fail(with_('places', 'places/places.csv', '# only a comment\n')), 'is empty. It needs a header row');
  });
});
