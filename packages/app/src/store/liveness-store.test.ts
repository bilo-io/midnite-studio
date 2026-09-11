import { beforeEach, describe, expect, it } from 'vitest';

import { computeLivenessStatus, useLivenessStore, type SyncSourceStatus } from './liveness-store';

const NO_SYNC: SyncSourceStatus = { backoffUntil: null, error: null };

beforeEach(() => {
  useLivenessStore.setState({
    lastWatchAt: null,
    watcherError: null,
    fetchStatus: NO_SYNC,
    forgeStatus: NO_SYNC,
  });
});

describe('useLivenessStore', () => {
  it('recordWatchEvent sets lastWatchAt and clears a previous error', () => {
    useLivenessStore.getState().recordWatcherError('boom');

    useLivenessStore.getState().recordWatchEvent(1000);

    expect(useLivenessStore.getState()).toMatchObject({ lastWatchAt: 1000, watcherError: null });
  });

  it('reset clears every field, including fetch/forge status', () => {
    useLivenessStore.getState().recordWatchEvent(1000);
    useLivenessStore.getState().recordSyncStatus('fetch', { backoffUntil: 5000, error: 'offline' });
    useLivenessStore.getState().recordSyncStatus('forge', { backoffUntil: 6000, error: 'rate limited' });

    useLivenessStore.getState().reset();

    expect(useLivenessStore.getState()).toMatchObject({
      lastWatchAt: null,
      watcherError: null,
      fetchStatus: NO_SYNC,
      forgeStatus: NO_SYNC,
    });
  });

  it('recordSyncStatus writes only the named source, leaving the other alone', () => {
    useLivenessStore.getState().recordSyncStatus('fetch', { backoffUntil: 1, error: 'a' });
    useLivenessStore.getState().recordSyncStatus('forge', { backoffUntil: 2, error: 'b' });

    expect(useLivenessStore.getState().fetchStatus).toEqual({ backoffUntil: 1, error: 'a' });
    expect(useLivenessStore.getState().forgeStatus).toEqual({ backoffUntil: 2, error: 'b' });

    useLivenessStore.getState().recordSyncStatus('fetch', NO_SYNC);
    expect(useLivenessStore.getState().fetchStatus).toEqual(NO_SYNC);
    expect(useLivenessStore.getState().forgeStatus).toEqual({ backoffUntil: 2, error: 'b' });
  });
});

describe('computeLivenessStatus', () => {
  const base = { fetchStatus: NO_SYNC, forgeStatus: NO_SYNC };

  it('is red when a watcher error is recorded, regardless of anything else', () => {
    const status = computeLivenessStatus({ ...base, lastWatchAt: Date.now(), watcherError: 'disk full' }, true);

    expect(status).toEqual({ state: 'red', reason: 'disk full' });
  });

  it('is amber with a reason when no repository is open', () => {
    const status = computeLivenessStatus({ ...base, lastWatchAt: null, watcherError: null }, false);

    expect(status).toEqual({ state: 'amber', reason: 'No repository open' });
  });

  it('is amber before the first watch event for the open repo', () => {
    const status = computeLivenessStatus({ ...base, lastWatchAt: null, watcherError: null }, true);

    expect(status).toEqual({ state: 'amber', reason: 'Watching for changes…' });
  });

  it('is green with a relative-time reason once an event has been seen', () => {
    const now = 1_000_000;
    const status = computeLivenessStatus({ ...base, lastWatchAt: now - 30_000, watcherError: null }, true, now);

    expect(status.state).toBe('green');
    expect(status.reason).toBe('Synced 30s ago');
  });

  it('renders "just now" for a very recent event', () => {
    const now = 1_000_000;
    const status = computeLivenessStatus({ ...base, lastWatchAt: now - 1000, watcherError: null }, true, now);

    expect(status.reason).toBe('Synced just now');
  });

  it('is amber, naming the fetch scheduler, when it is backed off — and outranks "no event yet"', () => {
    const now = 1_000_000;
    const status = computeLivenessStatus(
      {
        lastWatchAt: null,
        watcherError: null,
        fetchStatus: { backoffUntil: now + 30_000, error: 'offline' },
        forgeStatus: NO_SYNC,
      },
      true,
      now,
    );

    expect(status.state).toBe('amber');
    expect(status.reason).toBe('Auto-fetch paused: offline, retrying in 30s');
  });

  it('is amber, naming the forge poller, when it is rate-limited', () => {
    const now = 1_000_000;
    const status = computeLivenessStatus(
      {
        lastWatchAt: now - 1000,
        watcherError: null,
        fetchStatus: NO_SYNC,
        forgeStatus: { backoffUntil: now + 120_000, error: 'API rate limit exceeded' },
      },
      true,
      now,
    );

    expect(status).toEqual({
      state: 'amber',
      reason: 'Forge sync paused: API rate limit exceeded, retrying in 2m',
    });
  });

  it('a red watcher error still wins over a backed-off fetch/forge source', () => {
    const status = computeLivenessStatus(
      {
        lastWatchAt: null,
        watcherError: 'watcher crashed',
        fetchStatus: { backoffUntil: 1, error: 'offline' },
        forgeStatus: NO_SYNC,
      },
      true,
    );

    expect(status).toEqual({ state: 'red', reason: 'watcher crashed' });
  });
});
