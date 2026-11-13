// What the data layer does with valid data: drafts, samples, old ids, comments, derived values.
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csv';
import { build, edit, f, fail, valid, with_ } from './fixture';

const head = 'place,accent,feature,value,source,page,added,checked,mode,ages,who,note\n';

describe('csv comments', () => {
  it('skips lines starting with # and keeps line numbers', () => {
    const rows = parseCsv('# one\na,b\n# two\n1,2\n');
    expect(rows.map((r) => [r.line, r.cells])).toEqual([[2, ['a', 'b']], [4, ['1', '2']]]);
  });
  it('keeps a # inside a field', () => {
    expect(parseCsv('a,b\nx#y,#z\n')[1].cells).toEqual(['x#y', '#z']);
  });
  it('reports line numbers after comment lines', () => {
    const msg = fail(with_('findings', 'findings/findings.csv', `# c1\n# c2\n${head}boston-ma,,cot-caught,bad,s1,1,2026-01-01,2026-01-02,,,,`));
    expect(msg).toContain('findings/findings.csv line 4');
  });
});

describe('older findings files', () => {
  it('loads a file with no accent, checked, who columns', () => {
    const old = 'place,feature,value,source,page,mode,ages,note,added\nboston-ma,cot-caught,same,s1,61,,,,2026-01-01\n';
    const b = build(with_('findings', 'findings/findings.csv', old), { dev: true });
    expect(b.findings).toHaveLength(1);
    expect(b.findings[0]).toMatchObject({ place: 'boston-ma', accent: '', who: '', checked: '', draft: true });
  });
});

describe('drafts', () => {
  it('are left out when not dev', () => {
    const b = build(valid());
    expect(b.drafts()).toEqual([]);
    expect(b.findings.some((x) => x.draft)).toBe(false);
    expect(b.findings).toHaveLength(6);
  });
  it('are loaded and flagged in dev', () => {
    const b = build(valid(), { dev: true });
    expect(b.findings).toHaveLength(7);
    expect(b.drafts().map((x) => x.line)).toEqual([9]);
    expect(b.drafts()[0]).toMatchObject({ draft: true, checked: '', feature: 'dropping-r' });
  });
  it('are still checked when not dev', () => {
    const bad = edit('findings', 'boston-ma,,dropping-r,yes,s1,5,2026-01-01,,', 'boston-ma,,dropping-r,yep,s1,5,2026-01-01,,');
    expect(fail(bad)).toContain('"yep" isn\'t a value for dropping-r');
  });
});

describe('samples', () => {
  const sample = {
    findings: [f('sample/findings/us.csv', `${head}boston-ma,,cot-caught,same,sample,1,2026-01-01,2026-01-01,,,,\nboston-ma,,cot-caught,different,sample-b,1,2026-01-01,2026-01-01,,,,`)],
    areas: [f('sample/areas/a.yaml', '- id: sample-area\n  name: S\n  country: US\n  units: {set: us-states, ids: [PA]}\n')],
    accents: [f('sample/accents/a.yaml', '- id: sample-accent\n  name: S\n  country: US\n  tie: social\n  where: Somewhere.\n')],
  };
  const empty = (): ReturnType<typeof valid> => ({ ...valid(), findings: [f('findings/findings.csv', head)], sample });

  it('are used in dev when the real findings have no rows, with sample areas and accents', () => {
    const b = build(empty(), { dev: true });
    expect(b.usingSamples).toBe(true);
    expect(b.findings).toHaveLength(2);
    expect(b.areaById.has('sample-area')).toBe(true);
    expect(b.accentById.has('sample-accent')).toBe(true);
    expect([...b.sourceById.keys()]).toEqual(['sample', 'sample-b']);
  });
  it('are never used when not dev', () => {
    const b = build(empty());
    expect(b.usingSamples).toBe(false);
    expect(b.findings).toHaveLength(0);
    expect(b.areaById.has('sample-area')).toBe(false);
    expect(b.accentById.has('sample-accent')).toBe(false);
    expect([...b.sourceById.keys()]).toEqual(['s1', 's2']);
  });
  it('are not used in dev once the real findings have a row', () => {
    const b = build({ ...valid(), sample }, { dev: true });
    expect(b.usingSamples).toBe(false);
    expect(b.areaById.has('sample-area')).toBe(false);
  });
  it('count a draft row as a real row', () => {
    const draftOnly = [f('findings/findings.csv', `${head}boston-ma,,cot-caught,same,s1,1,2026-01-01,,,,,`)];
    expect(build({ ...valid(), findings: draftOnly, sample }, { dev: true }).usingSamples).toBe(false);
  });
  it('are not read at all in a real build of the real files', async () => {
    const { readInput } = await import('../read');
    const b = build(readInput(), { dev: false });
    expect(b.usingSamples).toBe(false);
    expect(b.findings).toHaveLength(0);
  });
});

describe('old ids', () => {
  it('resolve in findings and references, and are exported', () => {
    const b = build(edit('findings', 'leeds-eng,,dropping-r,yes', 'leeds-eng,,r-less,yes'));
    expect(b.findings.find((x) => x.line === 6)!.feature).toBe('dropping-r');
    expect(b.oldIds.sound).toEqual({ 'r-less': 'dropping-r' });
    expect(b.oldIds).toEqual({
      sound: { 'r-less': 'dropping-r' },
      place: { 'boston-mass-ma': 'boston-ma' },
      area: { mersey: 'merseyside' },
      accent: {},
    });
  });
  it('resolve an old place id, an old area id and an old accent id in findings', () => {
    const base = valid();
    base.accents[0].text += '- id: new-rp\n  name: R\n  country: GB\n  tie: social\n  where: x\n  was: [old-rp]\n';
    base.findings[0].text += 'boston-mass-ma,,bath,long,s2,1,2026-01-01,2026-01-02,,,,\nmersey,,bath,short,s2,1,2026-01-01,2026-01-02,,,,\n,old-rp,bath,short,s2,1,2026-01-01,2026-01-02,,,,\n';
    const b = build(base);
    const at = (line: number) => b.findings.find((x) => x.line === line)!;
    expect(at(10).place).toBe('boston-ma');
    expect(at(11).place).toBe('merseyside');
    expect(at(12).accent).toBe('new-rp');
    expect(at(12).subject).toEqual({ type: 'accent', id: 'new-rp' });
  });
  it('resolve in area and accent references', () => {
    const b = build(valid());
    expect(b.areaById.get('north-not-mersey')!.made).toEqual({ kind: 'of', of: ['north-of-england'], minus: ['merseyside'] });
    const base = valid();
    base.accents[0].text = base.accents[0].text.replace('core: [merseyside]', 'core: [mersey]');
    expect(build(base).accentById.get('scouse')!.core).toEqual(['merseyside']);
  });
});

describe('derived data', () => {
  const b = build(valid());
  const boston = { type: 'place', id: 'boston-ma' } as const;

  it('cell: newest data wins, all newest first, sources differ', () => {
    const c = b.cell(boston, 'cot-caught');
    expect(c.shown!.value).toBe('different');
    expect(c.all.map((x) => x.source)).toEqual(['s2', 's1']);
    expect(c.differ).toBe(true);
    expect(c.ageSplit).toBe(false);
    expect(b.cell(boston, 'dropping-r').shown).toBeNull();
  });
  it('cell works for accents and areas', () => {
    expect(b.cell({ type: 'accent', id: 'scouse' }, 'dropping-r').shown!.value).toBe('yes');
    expect(b.cell({ type: 'place', id: 'north-of-england' }, 'bath').shown!.value).toBe('short');
  });
  it('cell: an age split and a row with no ages', () => {
    const base = edit('findings', 'boston-ma,,bath,short,s1,3,2026-01-01,2026-01-02,,,,', 'boston-ma,,bath,short,s1,3,2026-01-01,2026-01-02,,old,,\nboston-ma,,bath,long,s1,3,2026-01-01,2026-01-02,,young,,\nboston-ma,,bath,mixed,s1,3,2026-01-01,2026-01-02,,,,');
    const c = build(base).cell(boston, 'bath');
    expect(c.ageSplit).toBe(true);
    expect(c.shown!.value).toBe('mixed');
  });
  it('symbols come from the sound\'s scale', () => {
    expect(b.symbolOf('boston-ma', 'cot-caught')).toBe('ring');
    expect(b.symbolOf('boston-ma', 'bath')).toBe('opt0');
    expect(b.symbolOf('boston-ma', 'dropping-r')).toBe('none');
  });
  it('counts per plate per value', () => {
    expect(b.countsByPlate('cot-caught')).toEqual({ us: { different: 1 } });
    expect(b.countsByPlate('dropping-r')).toEqual({ us: { none: 1 } });
    expect(b.counts('cot-caught')).toMatchObject({ ring: 1, none: 0 });
  });
  it('which plates have data', () => {
    expect(b.featurePlates('cot-caught')).toEqual(['us']);
    expect(b.featurePlates('dropping-r')).toEqual([]);
    expect(b.featurePlates('bath')).toEqual(['us']);
  });
  it('accent profile in sounds order', () => {
    expect(b.accentProfile('scouse').map((p) => p.feature.id)).toEqual(['dropping-r']);
    expect(b.accentProfile('rp')).toEqual([]);
  });
  it('areas and accents at a dot', () => {
    expect(b.areasOfDot('leeds-eng').map((a) => a.id)).toEqual(['north-of-england']);
    expect(b.areasOfDot('boston-ma')).toEqual([]);
    expect(b.accentsAtDot('leeds-eng').map((x) => [x.accent.id, x.tier])).toEqual([['scouse', 'wider'], ['northern-english', 'core']]);
    expect(b.accentsAtDot('liverpool-eng').map((x) => x.accent.id)).toEqual(['scouse', 'northern-english']);
    expect(b.accentsAtDot('boston-ma')).toEqual([]);
  });
  it('coverage matrix', () => {
    const cov = b.coverage();
    expect(cov.sounds.map((s) => s.id)).toEqual(['cot-caught', 'dropping-r', 'bath']);
    expect(cov.rows.map((r) => [r.accent.id, r.values])).toEqual([
      ['scouse', [null, 'yes', null]],
      ['northern-english', [null, null, null]],
      ['rp', [null, null, null]],
    ]);
  });
  it('recent, source stats and stats', () => {
    expect(b.recent(2).map((x) => x.line)).toEqual([4, 8]);
    expect(b.stats).toEqual({ places: 3, features: 3, sources: 2, lastAdded: '2026-02-01' });
    expect(b.sourceStats.map((s) => [s.source.key, s.findings, s.places])).toEqual([['s1', 5, 4], ['s2', 1, 1]]);
  });
  it('glossary loads', () => {
    expect(b.glossary).toEqual([{ term: 'merger', also: ['merge'], plain: 'Two sounds that became one.' }]);
  });
});
