import { describe, expect, it } from 'vitest';

import {
  LOOP_FORM_MIN,
  LOOP_HANDLE_HEIGHT,
  LOOP_TERMINAL_MIN,
  loopFormRange,
  resolveLoopFormHeight,
} from './loop-form-size';

describe('loop form sizing', () => {
  it('uses the natural height when never dragged', () => {
    expect(resolveLoopFormHeight(0, 380, 900)).toBe(380);
  });
  it('uses a dragged height over the natural one', () => {
    expect(resolveLoopFormHeight(200, 380, 900)).toBe(200);
  });
  it('leaves the terminal its minimum when content is taller than the pane', () => {
    expect(resolveLoopFormHeight(0, 2000, 500)).toBe(500 - LOOP_TERMINAL_MIN - LOOP_HANDLE_HEIGHT);
  });
  it('clamps a persisted height from a taller window', () => {
    expect(resolveLoopFormHeight(900, 380, 600)).toBe(loopFormRange(600).max);
  });
  it('never drops below the form minimum, even in a tiny pane', () => {
    expect(resolveLoopFormHeight(10, 10, 100)).toBe(LOOP_FORM_MIN);
    expect(loopFormRange(100).max).toBe(LOOP_FORM_MIN);
  });
});
