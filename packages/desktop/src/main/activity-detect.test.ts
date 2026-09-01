import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import {
  compileMarkers,
  createActivityClock,
  createActivityDetector,
  createActivityState,
  detectActivity,
  needsNoBoundaryWarning,
  type CompiledMarkers,
} from './activity-detect';

const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude');
if (!claude?.activity) throw new Error('claude is expected to ship an activity marker set');
const CLAUDE_MARKERS: CompiledMarkers = compileMarkers(claude.activity);

/** The footer Claude Code draws under its input box on EVERY repaint. */
const FOOTER = '⏵⏵ auto mode on (shift+tab to cycle) · ← for agents';
/** The row above it while a turn is in flight. */
const SPINNER = '✳ Kneading… (1m 38s · ↓ 4.5k tokens)';
/** A permission prompt / AskUserQuestion sheet — the one state that blocks on the user. */
const OPTION_SHEET =
  'Do you want to make this edit to terminal.ts?\n❯ 1. Yes\n  2. Yes, allow all edits during this session\n  3. No, and tell Claude what to do differently';

describe('detectActivity', () => {
  it('reads the spinner row as thinking', () => {
    expect(detectActivity(createActivityState(), SPINNER, CLAUDE_MARKERS)).toBe('thinking');
  });

  it('still reads the older builds’ interrupt hint as thinking', () => {
    expect(
      detectActivity(
        createActivityState(),
        '✳ Combobulating… (esc to interrupt)',
        CLAUDE_MARKERS,
      ),
    ).toBe('thinking');
  });

  it('reads a bare-prompt frame — no spinner, no question — as idle', () => {
    expect(detectActivity(createActivityState(), `❯ \n${FOOTER}`, CLAUDE_MARKERS)).toBe('idle');
  });

  it('reads the default mode’s shortcut hint as a frame end too', () => {
    expect(
      detectActivity(createActivityState(), '❯ \n  ? for shortcuts', CLAUDE_MARKERS),
    ).toBe('idle');
  });

  it('reads an option sheet as waiting, even mid-frame', () => {
    // A sheet REPLACES the input box, so its frame often never reaches a
    // footer — the caret row alone has to be enough.
    expect(
      detectActivity(createActivityState(), OPTION_SHEET, CLAUDE_MARKERS),
    ).toBe('waiting');
  });

  it('reads a completed frame carrying an option sheet as waiting', () => {
    expect(
      detectActivity(createActivityState(), `${OPTION_SHEET}\n${FOOTER}`, CLAUDE_MARKERS),
    ).toBe('waiting');
  });

  it('does not mistake the input box’s own caret for an option sheet', () => {
    // `❯ ` with no numbered choice after it is the prompt, not a question.
    expect(detectActivity(createActivityState(), `❯ \n${FOOTER}`, CLAUDE_MARKERS)).toBe('idle');
  });

  /*
    The bug this whole detector was rewritten for: the footer is printed while
    Claude is generating, not only when it is idle, so a frame carrying both
    has to come out as thinking.
  */
  it('keeps thinking when the same frame also carries the footer', () => {
    expect(
      detectActivity(createActivityState(), `${SPINNER}\n❯ \n${FOOTER}`, CLAUDE_MARKERS),
    ).toBe('thinking');
  });

  it('keeps thinking when a repaint arrives split across chunks', () => {
    const state = createActivityState();
    expect(detectActivity(state, SPINNER, CLAUDE_MARKERS)).toBe('thinking');
    // The tail of the same frame, on its own, used to read as "waiting".
    expect(detectActivity(state, `\n❯ \n${FOOTER}`, CLAUDE_MARKERS)).toBe('thinking');
  });

  it('drops to idle on the first frame drawn without a spinner', () => {
    const state = createActivityState();
    detectActivity(state, `${SPINNER}\n${FOOTER}`, CLAUDE_MARKERS);
    expect(detectActivity(state, `❯ \n${FOOTER}`, CLAUDE_MARKERS)).toBe('idle');
  });

  it('moves from thinking to waiting when the option sheet appears', () => {
    const state = createActivityState();
    detectActivity(state, `${SPINNER}\n${FOOTER}`, CLAUDE_MARKERS);
    expect(detectActivity(state, OPTION_SHEET, CLAUDE_MARKERS)).toBe('waiting');
  });

  it('credits the newer frame when one chunk ends a frame and starts the next', () => {
    const state = createActivityState();
    expect(detectActivity(state, `❯ \n${FOOTER}\n${SPINNER}`, CLAUDE_MARKERS)).toBe(
      'thinking',
    );
  });

  it('leaves plain content unclassified, so the caller keeps the last guess', () => {
    expect(detectActivity(createActivityState(), 'Read 1 file\n', CLAUDE_MARKERS)).toBeUndefined();
  });

  it('is not fooled by the middle dots a powerline footer is full of', () => {
    const state = createActivityState();
    expect(
      detectActivity(
        state,
        'main *2 ?1 · Opus 5 · high thinking · ctx 6%',
        CLAUDE_MARKERS,
      ),
    ).toBeUndefined();
  });
});

describe('needsNoBoundaryWarning', () => {
  it('fires once after 64kB with no frame boundary', () => {
    const state = createActivityState();
    detectActivity(state, 'x'.repeat(64_000), CLAUDE_MARKERS);
    expect(needsNoBoundaryWarning(state)).toBe(true);
    expect(needsNoBoundaryWarning(state)).toBe(false);
  });

  it('never fires once a boundary has been seen', () => {
    const state = createActivityState();
    detectActivity(state, `${FOOTER}\n${'x'.repeat(64_000)}`, CLAUDE_MARKERS);
    expect(needsNoBoundaryWarning(state)).toBe(false);
  });

  it('does not fire under the threshold', () => {
    const state = createActivityState();
    detectActivity(state, 'x'.repeat(63_999), CLAUDE_MARKERS);
    expect(needsNoBoundaryWarning(state)).toBe(false);
  });
});

describe('createActivityClock', () => {
  it('decays an unrefreshed thinking to idle after 15s, and reports current()', () => {
    let now = 0;
    const changes: string[] = [];
    const clock = createActivityClock({ now: () => now, onChange: (a) => changes.push(a) });

    expect(clock.current()).toBeNull();
    clock.saw('thinking');
    expect(changes).toEqual(['thinking']);
    expect(clock.current()).toBe('thinking');

    now = 14_000;
    clock.tick();
    expect(changes).toEqual(['thinking']);

    now = 15_000;
    clock.tick();
    expect(changes).toEqual(['thinking', 'idle']);
    expect(clock.current()).toBe('idle');
  });

  it('restarts the decay on any fresh detection', () => {
    let now = 0;
    const changes: string[] = [];
    const clock = createActivityClock({ now: () => now, onChange: (a) => changes.push(a) });

    clock.saw('thinking');
    now = 14_500;
    clock.saw('thinking');
    now = 14_500 + 14_000;
    clock.tick();
    expect(changes).toEqual(['thinking']);
  });

  /**
   * 'waiting' means a question is on screen, and a question left open for an
   * hour is still a question — it must never quietly turn into an idle caret
   * while an option sheet is sitting there. It clears on the repaint the
   * answer causes, or with the process itself.
   */
  it('never decays waiting — an open question stays open', () => {
    let now = 0;
    const changes: string[] = [];
    const clock = createActivityClock({ now: () => now, onChange: (a) => changes.push(a) });

    clock.saw('waiting');
    now = 3_600_000;
    clock.tick();
    expect(changes).toEqual(['waiting']);
  });

  it('never decays past idle, and never fires after dispose', () => {
    let now = 0;
    const changes: string[] = [];
    const clock = createActivityClock({ now: () => now, onChange: (a) => changes.push(a) });

    clock.saw('idle');
    now = 1_000_000;
    clock.tick();
    expect(changes).toEqual(['idle']);

    clock.dispose();
    clock.saw('thinking');
    expect(changes).toEqual(['idle']);
    expect(clock.current()).toBeNull();
  });
});

describe('createActivityDetector', () => {
  it('has no detector for an agent with no marker set', () => {
    const detector = createActivityDetector([], { now: () => 0, log: vi.fn(), onDisabled: vi.fn() });
    expect(detector.hasDetector('codex')).toBe(false);
    expect(detector.guess('codex', createActivityState(), SPINNER)).toBeUndefined();
  });

  it('detects for an agent with a compiled marker set', () => {
    const agents = [{ ...claude }];
    const detector = createActivityDetector(agents, { now: () => 0, log: vi.fn(), onDisabled: vi.fn() });
    expect(detector.hasDetector('claude')).toBe(true);
    expect(detector.guess('claude', createActivityState(), SPINNER)).toBe('thinking');
  });

  /**
   * The clock is mocked rather than run against a genuinely pathological
   * regex: a real catastrophic backtrack over an 8000-char buffer would make
   * this test itself hang for as long as the bug it is proving. Controlled
   * `now()` values exercise the exact same bookkeeping — three slow calls
   * disable, the fourth returns without evaluating — deterministically.
   */
  it('disables a detector after three consecutive calls over budget, and notifies once', () => {
    const times = [0, 3, 6, 9, 12, 15]; // each call: start, start+3ms
    let i = 0;
    const now = () => times[i++] ?? 0;
    const onDisabled = vi.fn();
    const log = vi.fn();
    const detector = createActivityDetector([{ ...claude }], { now, log, onDisabled });
    const state = createActivityState();

    expect(detector.guess('claude', state, 'Read 1 file\n')).toBeUndefined();
    expect(detector.guess('claude', state, 'Read 1 file\n')).toBeUndefined();
    expect(onDisabled).not.toHaveBeenCalled();

    expect(detector.guess('claude', state, 'Read 1 file\n')).toBeUndefined();
    expect(onDisabled).toHaveBeenCalledTimes(1);
    expect(onDisabled).toHaveBeenCalledWith('claude');
    expect(detector.hasDetector('claude')).toBe(false);

    // The fourth call never reaches detectActivity at all.
    expect(detector.guess('claude', state, SPINNER)).toBeUndefined();
  });

  it('resets the strike count on a fast call', () => {
    const times = [0, 3, 6, 9, 100, 100.5]; // slow, slow, fast — resets — then fast
    let i = 0;
    const now = () => times[i++] ?? 0;
    const onDisabled = vi.fn();
    const detector = createActivityDetector([{ ...claude }], { now, log: vi.fn(), onDisabled });
    const state = createActivityState();

    detector.guess('claude', state, 'Read 1 file\n');
    detector.guess('claude', state, 'Read 1 file\n');
    detector.guess('claude', state, 'Read 1 file\n');
    expect(onDisabled).not.toHaveBeenCalled();
    expect(detector.hasDetector('claude')).toBe(true);
  });
});

/**
 * Byte-for-byte captures, not hand-typed prose: `claude-narrow.txt` is the
 * width at which the `(1m 38s · ↓ 4.5k tokens)` parenthetical is
 * dropped entirely — the exact case that broke the old "esc to interrupt"-only
 * detector — and `claude-transcript.txt` is plain output that must say
 * nothing either way. `claude-prompt.txt` is the bare at-prompt frame (idle,
 * the default), and `claude-option-sheet.txt` a permission prompt — the one
 * frame that genuinely blocks on the user.
 */
describe('activity fixtures', () => {
  const fixture = (name: string) =>
    readFileSync(join(__dirname, '__fixtures__', 'activity', name), 'utf8');

  it('reads each fixture as documented', () => {
    expect(detectActivity(createActivityState(), fixture('claude-thinking.txt'), CLAUDE_MARKERS)).toBe(
      'thinking',
    );
    expect(detectActivity(createActivityState(), fixture('claude-prompt.txt'), CLAUDE_MARKERS)).toBe(
      'idle',
    );
    expect(
      detectActivity(createActivityState(), fixture('claude-option-sheet.txt'), CLAUDE_MARKERS),
    ).toBe('waiting');
    expect(detectActivity(createActivityState(), fixture('claude-narrow.txt'), CLAUDE_MARKERS)).toBe(
      'thinking',
    );
    expect(
      detectActivity(createActivityState(), fixture('claude-transcript.txt'), CLAUDE_MARKERS),
    ).toBeUndefined();
  });

  it('yields the same answer whether a fixture arrives whole or split across chunks', () => {
    const whole = fixture('claude-thinking.txt');
    const wholeResult = detectActivity(createActivityState(), whole, CLAUDE_MARKERS);

    const third = Math.ceil(whole.length / 3);
    const chunks = [whole.slice(0, third), whole.slice(third, third * 2), whole.slice(third * 2)];
    const state = createActivityState();
    let chunkedResult: ReturnType<typeof detectActivity>;
    for (const chunk of chunks) chunkedResult = detectActivity(state, chunk, CLAUDE_MARKERS);

    expect(chunkedResult).toBe(wholeResult);
  });
});
