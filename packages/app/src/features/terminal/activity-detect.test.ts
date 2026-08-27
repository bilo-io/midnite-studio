import { describe, expect, it } from 'vitest';

import {
  createActivityState,
  createShellLineState,
  detectActivity,
  trackShellCommand,
} from './activity-detect';

/** The footer Claude Code draws under its input box on EVERY repaint. */
const FOOTER = '\u23F5\u23F5 auto mode on (shift+tab to cycle) \u00B7 \u2190 for agents';
/** The row above it while a turn is in flight. */
const SPINNER = '\u2733 Kneading\u2026 (1m 38s \u00B7 \u2193 4.5k tokens)';

describe('detectActivity', () => {
  it('reads the spinner row as thinking', () => {
    expect(detectActivity(createActivityState(), SPINNER)).toBe('thinking');
  });

  it('still reads the older builds\u2019 interrupt hint as thinking', () => {
    expect(detectActivity(createActivityState(), '\u2733 Combobulating\u2026 (esc to interrupt)')).toBe(
      'thinking',
    );
  });

  it('reads a frame with no spinner in it as waiting', () => {
    expect(detectActivity(createActivityState(), `\u276F \n${FOOTER}`)).toBe('waiting');
  });

  it('reads the default mode\u2019s shortcut hint as a frame end too', () => {
    expect(detectActivity(createActivityState(), '\u276F \n  ? for shortcuts')).toBe('waiting');
  });

  /*
    The bug this whole detector was rewritten for: the footer is printed while
    Claude is generating, not only when it is idle, so a frame carrying both
    has to come out as thinking.
  */
  it('keeps thinking when the same frame also carries the footer', () => {
    expect(detectActivity(createActivityState(), `${SPINNER}\n\u276F \n${FOOTER}`)).toBe('thinking');
  });

  it('keeps thinking when a repaint arrives split across chunks', () => {
    const state = createActivityState();
    expect(detectActivity(state, SPINNER)).toBe('thinking');
    // The tail of the same frame, on its own, used to read as "waiting".
    expect(detectActivity(state, `\n\u276F \n${FOOTER}`)).toBe('thinking');
  });

  it('drops to waiting on the first frame drawn without a spinner', () => {
    const state = createActivityState();
    detectActivity(state, `${SPINNER}\n${FOOTER}`);
    expect(detectActivity(state, `\u276F \n${FOOTER}`)).toBe('waiting');
  });

  it('credits the newer frame when one chunk ends a frame and starts the next', () => {
    const state = createActivityState();
    expect(detectActivity(state, `\u276F \n${FOOTER}\n${SPINNER}`)).toBe('thinking');
  });

  it('leaves plain content unclassified, so the caller keeps the last guess', () => {
    expect(detectActivity(createActivityState(), 'Read 1 file\n')).toBeUndefined();
  });

  it('is not fooled by the middle dots a powerline footer is full of', () => {
    const state = createActivityState();
    expect(detectActivity(state, 'main *2 ?1 \u00B7 Opus 5 \u00B7 high thinking \u00B7 ctx 6%')).toBeUndefined();
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
