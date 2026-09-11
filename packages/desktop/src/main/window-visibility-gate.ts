import { BrowserWindow, powerMonitor } from 'electron';

/**
 * The one visibility/idle check both Phase 84 timers gate on (B.2, C.3) —
 * factored out so `fetch-scheduler.ts` and `forge-poller.ts` ask the same
 * question of the same OS APIs rather than each keeping its own copy that
 * could drift.
 *
 * How long the machine must have been idle before a tick is skipped —
 * `powerMonitor.getSystemIdleState`'s own threshold argument. Five minutes:
 * long enough that moving the mouse to check something else doesn't pause
 * the schedule, short enough that a genuinely unattended machine stops
 * spending network and disk on repos nobody is looking at.
 */
export const IDLE_THRESHOLD_S = 300;

/** True while at least one window is visible and not minimized. */
export function anyWindowVisible(): boolean {
  return BrowserWindow.getAllWindows().some(
    (win) => !win.isDestroyed() && win.isVisible() && !win.isMinimized(),
  );
}

/** `active` | `idle` | `locked` | `unknown`, at the shared threshold above. */
export function systemIdleState(): 'active' | 'idle' | 'locked' | 'unknown' {
  return powerMonitor.getSystemIdleState(IDLE_THRESHOLD_S);
}
