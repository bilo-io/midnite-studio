import { describe, expect, it } from 'vitest';

import { createShellLineState, detectActivity, trackShellCommand } from './activity-detect';

describe('detectActivity', () => {
  it('reads the generating hint as thinking', () => {
    expect(detectActivity('✳ Combobulating… (esc to interrupt)')).toBe('thinking');
  });

  it('reads the idle footer as waiting', () => {
    expect(detectActivity('auto mode on (shift+tab to cycle) · 1 feedback draft')).toBe('waiting');
  });

  it('leaves plain content unclassified, so the caller keeps the last guess', () => {
    expect(detectActivity('Read 1 file\n')).toBeUndefined();
  });
});

describe('trackShellCommand', () => {
  it('reports the command word once Enter is typed', () => {
    const state = createShellLineState();
    trackShellCommand(state, 'pnpm ');
    const finished = trackShellCommand(state, 'install\r');
    expect(finished).toBe('pnpm');
  });

  it('honours backspace before the line is submitted', () => {
    const state = createShellLineState();
    trackShellCommand(state, 'gt status');
    // Nine backspaces clears every character just typed, "gt status" included.
    trackShellCommand(state, '\x7f'.repeat(9));
    const finished = trackShellCommand(state, 'git status\r');
    expect(finished).toBe('git');
  });

  it('reports nothing for an empty line', () => {
    const state = createShellLineState();
    expect(trackShellCommand(state, '\r')).toBeNull();
  });

  it('skips escape sequences, such as an up-arrow history recall, wholesale', () => {
    const state = createShellLineState();
    // Up-arrow: ESC [ A
    trackShellCommand(state, '\x1b[A');
    const finished = trackShellCommand(state, '\r');
    expect(finished).toBeNull();
  });

  it('carries a partial line across chunks', () => {
    const state = createShellLineState();
    trackShellCommand(state, 'moon ru');
    const finished = trackShellCommand(state, 'n :test\r');
    expect(finished).toBe('moon');
  });
});
