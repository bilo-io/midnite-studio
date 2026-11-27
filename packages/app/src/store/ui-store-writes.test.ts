// Phase 77 Theme C — write counts. A drag is many `set`s; the persisted slice must be written
// once, after the burst, not once per pixel. Counts are recorded in the PR body.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushNow } from './debounced-storage';
import { useUiStore } from './ui-store';
import { useDashboardStore } from './dashboard-store';

describe('persisted-store write counts (Phase 77 Theme C)', () => {
  let setItem: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    flushNow();
    setItem = vi.spyOn(Storage.prototype, 'setItem');
  });
  afterEach(() => {
    flushNow();
    setItem.mockRestore();
    vi.useRealTimers();
  });

  const writesTo = (key: string) => setItem.mock.calls.filter((c: unknown[]) => c[0] === key).length;

  it('a terminal line-height drag (step 0.05) writes the ui slice at most twice', () => {
    for (let i = 0; i < 40; i++) useUiStore.getState().setTerminalLineHeight(1 + i * 0.05);
    vi.advanceTimersByTime(1000);
    expect(writesTo('midnite-studio.ui')).toBeLessThanOrEqual(2);
    expect(writesTo('midnite-studio.ui')).toBeGreaterThanOrEqual(1);
  });

  it('a view switch writes the ui slice at most once', () => {
    useUiStore.getState().setActiveView('settings');
    vi.advanceTimersByTime(1000);
    expect(writesTo('midnite-studio.ui')).toBeLessThanOrEqual(1);
  });

  it('a tile drag (onLayoutChange burst) writes the dashboard slice at most twice', () => {
    for (let i = 0; i < 40; i++)
      useDashboardStore.getState().setLayout('repo-1', [{ i: 'calendar', x: i % 6, y: 0, w: 4, h: 4 }]);
    vi.advanceTimersByTime(1000);
    expect(writesTo('midnite-studio.dashboard')).toBeLessThanOrEqual(2);
  });
});
