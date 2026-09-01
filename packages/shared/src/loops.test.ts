import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOOPS,
  LoopDefinitionSchema,
  LoopRunRecordSchema,
  composeLoopPrompt,
  type LoopDefinition,
} from './loops';

/** A loop whose fragments are trivially identifiable in the composed line. */
const loop: Pick<LoopDefinition, 'modifiers'> = {
  modifiers: [
    { id: 'first', label: 'First', promptFragment: 'Do the first thing.', defaultOn: false },
    { id: 'second', label: 'Second', promptFragment: 'Do the second thing.', defaultOn: true },
    { id: 'third', label: 'Third', promptFragment: 'Do the third thing.', defaultOn: false },
  ],
};

describe('composeLoopPrompt', () => {
  it('returns the base prompt alone when nothing is checked', () => {
    expect(composeLoopPrompt('/loop /midnite-exec', loop, [])).toBe('/loop /midnite-exec');
  });

  it('appends only the checked fragments', () => {
    expect(composeLoopPrompt('/base', loop, ['first'])).toBe('/base Do the first thing.');
  });

  it('orders fragments by the loop declaration, not the click order', () => {
    const clickedBackwards = composeLoopPrompt('/base', loop, ['third', 'first']);
    const clickedForwards = composeLoopPrompt('/base', loop, ['first', 'third']);
    expect(clickedBackwards).toBe('/base Do the first thing. Do the third thing.');
    expect(clickedBackwards).toBe(clickedForwards);
  });

  it('ignores ids that name no modifier', () => {
    expect(composeLoopPrompt('/base', loop, ['ghost'])).toBe('/base');
  });

  it('puts free-text extras last, after every fragment', () => {
    expect(composeLoopPrompt('/base', loop, ['second'], 'Only touch docs.')).toBe(
      '/base Do the second thing. Only touch docs.',
    );
  });

  it('trims each part and drops the ones that are empty or whitespace', () => {
    expect(composeLoopPrompt('  /base  ', loop, [], '   ')).toBe('/base');
    expect(composeLoopPrompt('/base', loop, [], '  extras  ')).toBe('/base extras');
  });

  it('is deterministic — the same inputs compose the same line', () => {
    const once = composeLoopPrompt('/base', loop, ['first', 'second'], 'extras');
    const twice = composeLoopPrompt('/base', loop, ['first', 'second'], 'extras');
    expect(once).toBe(twice);
  });
});

describe('DEFAULT_LOOPS', () => {
  it('parses, and every loop has a unique id', () => {
    for (const entry of DEFAULT_LOOPS) expect(LoopDefinitionSchema.parse(entry)).toBeTruthy();
    expect(new Set(DEFAULT_LOOPS.map((l) => l.id)).size).toBe(DEFAULT_LOOPS.length);
  });

  it('covers the four historical FAB tabs, so persisted activeFabTab keeps meaning', () => {
    expect(DEFAULT_LOOPS.map((l) => l.id)).toEqual([
      'innovate',
      'automate',
      'watchdog',
      'medic',
    ]);
  });

  it('runs claude only this phase — the one agent with honest activity markers', () => {
    for (const entry of DEFAULT_LOOPS) expect(entry.agentId).toBe('claude');
  });

  it('gives every loop unique modifier ids', () => {
    for (const entry of DEFAULT_LOOPS) {
      expect(new Set(entry.modifiers.map((m) => m.id)).size).toBe(entry.modifiers.length);
    }
  });
});

describe('LoopRunRecordSchema', () => {
  const running = {
    id: 'r1',
    loopId: 'automate',
    sessionId: 's1',
    startedAt: 1,
    composedPrompt: '/loop /midnite-exec',
    checkedModifierIds: [],
    status: 'running' as const,
  };

  it('round-trips a running record with no end', () => {
    expect(LoopRunRecordSchema.parse(running)).toEqual(running);
  });

  it('round-trips a finished record with an exit code', () => {
    const ended = { ...running, status: 'exited' as const, endedAt: 2, exitCode: 0 };
    expect(LoopRunRecordSchema.parse(ended)).toEqual(ended);
  });

  it('accepts a negative exit code — a signal death is still a real end', () => {
    expect(
      LoopRunRecordSchema.parse({ ...running, status: 'exited', endedAt: 2, exitCode: -1 }),
    ).toMatchObject({ exitCode: -1 });
  });

  it('rejects an unknown status', () => {
    expect(LoopRunRecordSchema.safeParse({ ...running, status: 'paused' }).success).toBe(false);
  });
});
