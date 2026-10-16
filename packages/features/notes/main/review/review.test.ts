// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { cardsFromNote } from './cards';
import { AGAIN_MS, DAY_MS, MIN_EASE, isDue, schedule, type CardState } from './scheduler';

const note = (body: string) => ({ id: 'n1', body });
const pairs = (body: string) => cardsFromNote(note(body)).map((c) => [c.front, c.back]);

describe('cardsFromNote', () => {
  it('reads Q:/A: lines, multi-line answers and several cards', () => {
    expect(pairs('intro\nQ: What is 2+2?\nA: 4\n\nq: Capital\nof France?\na: Paris\nmore\n\nnoise')).toEqual([
      ['What is 2+2?', '4'],
      ['Capital\nof France?', 'Paris\nmore'],
    ]);
  });

  it('ignores a question with no answer', () => {
    expect(pairs('Q: lonely')).toEqual([]);
  });

  it('pairs --- chunks and drops a trailing unpaired one', () => {
    expect(pairs('front one\n---\nback one\n---\nfront two\n---\nback two\n---\nstray')).toEqual([
      ['front one', 'back one'],
      ['front two', 'back two'],
    ]);
  });

  it('falls back to heading -> body, skipping empty bodies', () => {
    expect(pairs('# Title\n\n## Mitochondria\npowerhouse\n\n## Empty\n')).toEqual([
      ['Mitochondria', 'powerhouse'],
    ]);
  });

  it('prefers Q/A over --- over headings', () => {
    expect(pairs('# H\nbody\n---\nx\nQ: a\nA: b')).toEqual([['a', 'b']]);
  });

  it('gives a stable id that follows the front, not the back', () => {
    const a = cardsFromNote(note('Q: x\nA: one'))[0];
    const b = cardsFromNote(note('Q: x\nA: two'))[0];
    const c = cardsFromNote(note('Q: y\nA: one'))[0];
    expect(a?.id).toBe(b?.id);
    expect(a?.id).not.toBe(c?.id);
  });

  it('collapses duplicate fronts and yields nothing for plain prose', () => {
    expect(cardsFromNote(note('Q: x\nA: 1\n\nQ: x\nA: 2'))).toHaveLength(1);
    expect(cardsFromNote(note('just a thought'))).toEqual([]);
  });
});

describe('schedule (SM-2)', () => {
  const T = 1_000_000;
  const run = (grades: Parameters<typeof schedule>[1][]) => {
    let s: CardState | undefined;
    for (const g of grades) s = schedule(s, g, T);
    return s as CardState;
  };

  it.each([
    [['good'], 1],
    [['good', 'good'], 6],
    [['good', 'good', 'good'], 15],
    [['easy'], 4],
    [['good', 'easy'], 3],
    [['good', 'good', 'hard'], 7],
  ] as const)('%j gives an interval of %i days', (grades, days) => {
    const s = run([...grades]);
    expect(s.intervalDays).toBe(days);
    expect(s.due).toBe(T + days * DAY_MS);
  });

  it('again resets and counts a lapse, due in minutes', () => {
    const s = run(['good', 'good', 'again']);
    expect(s).toMatchObject({ reps: 0, intervalDays: 0, lapses: 1, due: T + AGAIN_MS });
  });

  it('moves ease by grade and never below the floor', () => {
    expect(run(['easy']).ease).toBe(2.65);
    expect(run(['hard']).ease).toBe(2.35);
    expect(run(Array(20).fill('again')).ease).toBe(MIN_EASE);
  });

  it('treats an unscheduled card and a past due date as due', () => {
    expect(isDue(undefined, T)).toBe(true);
    expect(isDue({ ...run(['good']) }, T)).toBe(false);
    expect(isDue({ ...run(['good']) }, T + DAY_MS)).toBe(true);
  });
});
