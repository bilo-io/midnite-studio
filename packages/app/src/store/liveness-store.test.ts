import { beforeEach, describe, expect, it } from 'vitest';

import { computeLivenessStatus, useLivenessStore } from './liveness-store';

beforeEach(() => {
  useLivenessStore.setState({ lastWatchAt: null, watcherError: null });
});

describe('useLivenessStore', () => {
  it('recordWatchEvent sets lastWatchAt and clears a previous error', () => {
    useLivenessStore.getState().recordWatcherError('boom');

    useLivenessStore.getState().recordWatchEvent(1000);

    expect(useLivenessStore.getState()).toMatchObject({ lastWatchAt: 1000, watcherError: null });
  });

  it('reset clears both fields', () => {
    useLivenessStore.getState().recordWatchEvent(1000);

    useLivenessStore.getState().reset();

    expect(useLivenessStore.getState()).toMatchObject({ lastWatchAt: null, watcherError: null });
  });
});

describe('computeLivenessStatus', () => {
  it('is red when a watcher error is recorded, regardless of anything else', () => {
    const status = computeLivenessStatus({ lastWatchAt: Date.now(), watcherError: 'disk full' }, true);

    expect(status).toEqual({ state: 'red', reason: 'disk full' });
  });

  it('is amber with a reason when no repository is open', () => {
    const status = computeLivenessStatus({ lastWatchAt: null, watcherError: null }, false);

    expect(status).toEqual({ state: 'amber', reason: 'No repository open' });
  });

  it('is amber before the first watch event for the open repo', () => {
    const status = computeLivenessStatus({ lastWatchAt: null, watcherError: null }, true);

    expect(status).toEqual({ state: 'amber', reason: 'Watching for changes…' });
  });

  it('is green with a relative-time reason once an event has been seen', () => {
    const now = 1_000_000;
    const status = computeLivenessStatus({ lastWatchAt: now - 30_000, watcherError: null }, true, now);

    expect(status.state).toBe('green');
    expect(status.reason).toBe('Synced 30s ago');
  });

  it('renders "just now" for a very recent event', () => {
    const now = 1_000_000;
    const status = computeLivenessStatus({ lastWatchAt: now - 1000, watcherError: null }, true, now);

    expect(status.reason).toBe('Synced just now');
  });
});
