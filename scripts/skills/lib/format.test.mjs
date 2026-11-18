import { describe, expect, it } from 'vitest';

import { bar, diffCell, duration, mdTable, parseMdTable, pct } from './format.mjs';

describe('bar', () => {
  it('draws 10 cells', () => {
    expect(bar(0)).toBe('░░░░░░░░░░');
    expect(bar(70)).toBe('███████░░░');
    expect(bar(100)).toBe('██████████');
  });
  it('rounds, clamps and supports 20 cells', () => {
    expect(bar(29)).toBe('███░░░░░░░');
    expect(bar(150)).toBe('██████████');
    expect(bar(-5)).toBe('░░░░░░░░░░');
    expect(bar(NaN)).toBe('░░░░░░░░░░');
    expect(bar(50, 20)).toBe('██████████░░░░░░░░░░');
  });
  it('pct floors and survives 0/0', () => {
    expect(pct(12, 41)).toBe(29);
    expect(pct(0, 0)).toBe(0);
  });
});

describe('diffCell', () => {
  it('uses the house emoji format', () => expect(diffCell({ added: 210, deleted: 35, files: 6 })).toBe('🟩 +210 🟥 -35 📄 6'));
  it('is an em dash when empty', () => expect(diffCell({})).toBe('—'));
});

describe('tables', () => {
  it('round-trips, escaping pipes', () => {
    const rows = [['a | b', '1'], ['c', '2']];
    const md = mdTable(['k', 'v'], rows);
    expect(parseMdTable(`intro\n\n${md}\n\ntail`)).toEqual({ headers: ['k', 'v'], rows });
  });
  it('returns empty when there is no table', () => expect(parseMdTable('nothing')).toEqual({ headers: [], rows: [] }));
});

describe('duration', () => {
  it('compacts', () => {
    expect(duration(9)).toBe('9s');
    expect(duration(95)).toBe('1m35s');
    expect(duration(3700)).toBe('1h01m');
  });
});
