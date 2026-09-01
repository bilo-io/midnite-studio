import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createActivityDetector } from './activity-detect';
import {
  __activityTickerArmed,
  disposeActivity,
  noteActivity,
  setActivityDetector,
  setAgentWatcher,
} from './pty-service';

/**
 * Phase 36 E — the shared decay tick exists only while a pty is actually
 * tracked. `index.ts` used to arm it unconditionally at boot, so the common
 * case (no agent running) still woke main once a second forever.
 *
 * Note the gate is tracked-count, NOT window focus: an agent keeps working
 * while the window is blurred, and pausing the clock there would freeze its
 * activity glyph. That distinction is the reason this is tested at all.
 */
const AGENT_ID = 'claude';

/** Minimal watcher seam — `noteActivity` only asks it which agent a pty runs. */
function watcherFor(agentId: string | null) {
  return {
    currentAgentId: () => agentId,
    noteOutput: () => undefined,
    dispose: () => undefined,
  } as unknown as Parameters<typeof setAgentWatcher>[0];
}

const encoder = new TextEncoder();

describe('activity clock ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setAgentWatcher(watcherFor(AGENT_ID));
    setActivityDetector(
      createActivityDetector(
        [
          {
            id: AGENT_ID,
            label: 'Claude',
            activity: { working: 'esc to interrupt', waiting: 'Do you want' },
          },
        ] as never,
        { now: Date.now, log: () => undefined, onDisabled: () => undefined },
      ),
    );
  });

  afterEach(() => {
    setActivityDetector(null);
    setAgentWatcher(null);
    vi.useRealTimers();
  });

  it('is not armed before anything is tracked', () => {
    expect(__activityTickerArmed()).toBe(false);
  });

  it('arms when a pty starts being tracked and disarms when it stops', () => {
    noteActivity('pty-1', encoder.encode('esc to interrupt'));
    expect(__activityTickerArmed()).toBe(true);

    disposeActivity('pty-1');

    expect(__activityTickerArmed()).toBe(false);
  });

  it('stays armed until the last tracked pty is gone', () => {
    noteActivity('pty-1', encoder.encode('esc to interrupt'));
    noteActivity('pty-2', encoder.encode('esc to interrupt'));

    disposeActivity('pty-1');
    expect(__activityTickerArmed()).toBe(true);

    disposeActivity('pty-2');
    expect(__activityTickerArmed()).toBe(false);
  });

  it('does not arm for a pty with no agent running', () => {
    setAgentWatcher(watcherFor(null));

    noteActivity('pty-shell', encoder.encode('$ ls -la'));

    expect(__activityTickerArmed()).toBe(false);
  });
});
