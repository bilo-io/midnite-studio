import { describe, expect, it } from 'vitest';

import { refineBlockedReason } from './model-panel';

/** vitest/jsdom: when Refine is off, and what it says. */
describe('refineBlockedReason', () => {
  it('needs an agent that iterates, then something to change', () => {
    expect(refineBlockedReason({ prompt: 'a hat', running: false, iterative: false })).toMatch(/iterates.*Claude Code or Codex/);
    expect(refineBlockedReason({ prompt: '  ', running: false, iterative: true })).toBe('Say what to change.');
    expect(refineBlockedReason({ prompt: 'a hat', running: true, iterative: true })).toBe('Generating…');
    expect(refineBlockedReason({ prompt: 'a hat', running: false, iterative: true })).toBeUndefined();
  });
});
