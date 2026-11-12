import { describe, expect, it } from 'vitest';

import { fitProblem, parseRle, PATTERNS } from './rle';

describe('parseRle', () => {
  it('reads the glider', () => {
    const p = parseRle('bob$2bo$3o!');
    expect(p).toEqual({ width: 3, height: 3, cells: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]] });
  });

  it('reads the header rule and ignores comments', () => {
    const p = parseRle('#C hello\nx = 3, y = 3, rule = B36/S23\nbob$2bo$3o!');
    expect(p).toMatchObject({ rule: 'B36/S23', width: 3, height: 3 });
  });

  it('returns an error for malformed or unterminated input', () => {
    expect(parseRle('b?o!')).toHaveProperty('error');
    expect(parseRle('bob$2bo$3o')).toHaveProperty('error');
    expect(parseRle('')).toHaveProperty('error');
  });

  it('parses every built-in with the cell count the pattern is known for', () => {
    const pop: Record<string, number> = { Glider: 5, 'Lightweight spaceship': 9, Pulsar: 48, 'R-pentomino': 5, 'Gosper glider gun': 36 };
    for (const { name, rle } of PATTERNS) {
      const p = parseRle(rle);
      expect('error' in p, name).toBe(false);
      if (!('error' in p)) expect(p.cells.length, name).toBe(pop[name]);
    }
  });
});

describe('fitProblem', () => {
  it('names both sizes when the pattern is too big', () => {
    const p = { width: 70, height: 5, cells: [] as [number, number][] };
    expect(fitProblem(p, 64, 64)).toBe('Pattern is 70×5; the grid is 64×64');
    expect(fitProblem({ ...p, width: 10 }, 64, 64)).toBeNull();
  });
});
