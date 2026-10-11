import { describe, expect, it } from 'vitest';

import { countWord, parseChoice } from './choice';

describe('parseChoice', () => {
  it.each([
    ['two', 3, 1],
    ['Two.', 3, 1],
    ['2', 3, 1],
    ['#3', 3, 2],
    ['the second', 3, 1],
    ['second one', 3, 1],
    ['number one', 3, 0],
    ['the last one', 3, 2],
    ['go with the third', 3, 2],
    ['two please', 3, 1],
  ])('%s of %i is index %i', (text, count, index) => {
    expect(parseChoice(text, count)).toBe(index);
  });

  it.each([
    ['four', 3],
    ['0', 3],
    ['two commits ago', 3],
    ['open the graph', 3],
    ['', 3],
  ])('%s of %i is not a pick', (text, count) => {
    expect(parseChoice(text, count)).toBeNull();
  });
});

describe('countWord', () => {
  it('spells small counts and digits the rest', () => {
    expect([countWord(2), countWord(5), countWord(11)]).toEqual(['two', 'five', '11']);
  });
});
