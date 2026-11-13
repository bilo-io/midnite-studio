import { describe, expect, it, vi } from 'vitest';

import type { ScienceCell } from '@midnite/studio-shared';

import { evaluateNotebook, runNotebook } from './evaluate';

const c = (id: string, source: string): ScienceCell => ({ kind: 'compute', id, source });
const one = (source: string) => evaluateNotebook([c('c-aaaaaaaa', source)])['c-aaaaaaaa']!;

vi.setConfig({ testTimeout: 20_000 });

describe('evaluateNotebook', () => {
  it('carries variables across lines', () => {
    expect(one('a = 3\nb = a^2')).toMatchObject({ ok: true, text: '9' });
  });
  it('converts units', () => {
    // precision 10 is ten significant digits.
    expect(one('5 km/h to m/s')).toMatchObject({ ok: true, text: '1.388888889 m / s' });
  });
  it('does linear algebra and complex numbers', () => {
    expect(one('det([1,2;3,4])')).toMatchObject({ ok: true, text: '-2' });
    expect(one('sqrt(-4)')).toMatchObject({ ok: true, text: '2i' });
  });
  it('keeps simplify and derivative', () => {
    expect(one("derivative('x^2', 'x')")).toMatchObject({ ok: true, text: '2 * x' });
    expect(one("simplify('2 x + x')")).toMatchObject({ ok: true, text: '3 * x' });
  });
  it('disables the functions that reach JavaScript', () => {
    for (const src of ['import({}, {})', 'evaluate("1+1")', 'parse("1")', 'compile("1")', 'createUnit("x")', 'f = import', 'g(x) = evaluate']) {
      expect(one(src)).toMatchObject({ ok: false, message: expect.stringMatching(/disabled/) });
    }
  });
  it('reports the failing line and still runs later cells', () => {
    const r = evaluateNotebook([c('c-aaaaaaaa', 'x = 1\ny = nope + 1'), c('c-bbbbbbbb', 'z = 2')]);
    expect(r['c-aaaaaaaa']).toMatchObject({ ok: false, line: 2 });
    expect(r['c-bbbbbbbb']).toMatchObject({ ok: true, text: '2' });
  });
  it('lets a later cell see an earlier cell variable, and starts fresh each run', () => {
    const cells = [c('c-aaaaaaaa', 'k = 4'), c('c-bbbbbbbb', 'k * 2')];
    expect(evaluateNotebook(cells)['c-bbbbbbbb']).toMatchObject({ ok: true, text: '8' });
    expect(evaluateNotebook([c('c-bbbbbbbb', 'k * 2')])['c-bbbbbbbb']).toMatchObject({ ok: false });
  });
  it('ignores non-compute cells and blank lines', () => {
    const r = evaluateNotebook([{ kind: 'markdown', id: 'c-aaaaaaaa', source: 'x' }, c('c-bbbbbbbb', '\n\n')]);
    expect(Object.keys(r)).toEqual(['c-bbbbbbbb']);
  });
});

describe('runNotebook', () => {
  it('samples a plot against the variables the compute cells defined', () => {
    const plot: ScienceCell = { kind: 'plot', id: 'c-pppppppp', series: [{ expr: 'k*x' }], x: { min: 0, max: 1 }, y: 'auto' };
    const run = runNotebook([plot, c('c-aaaaaaaa', 'k = 3')]);
    expect(run.samples['c-pppppppp']!.series[0]!.ys.at(-1)).toBeCloseTo(3);
  });
});
