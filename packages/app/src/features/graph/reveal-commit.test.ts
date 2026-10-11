import type { GraphRow } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { useGraphStore } from './graph-store';
import { COMMIT_BEYOND_CAP_SAY, revealCommit, type RevealCommitDeps } from './reveal-commit';

// vitest/jsdom: store transitions only — the real scroll is the Playwright spec's job.

const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const row = (sha: string): GraphRow =>
  ({
    commit: { sha, authorName: 'a', authorEmail: 'a@x', coAuthors: [], sessionTrailers: [], subject: '' },
  }) as unknown as GraphRow;

const deps = (resolved: string | null = FULL): RevealCommitDeps => ({
  resolve: vi.fn(async () => resolved),
  timeoutMs: 50,
});

function stream(rows: string[], over: { loading?: boolean; truncated?: boolean } = {}) {
  useGraphStore.setState({
    repoId: 'r1',
    requestId: 'r1#1',
    rows: rows.map(row),
    loading: over.loading ?? false,
    truncated: over.truncated ?? false,
  });
}

describe('revealCommit', () => {
  beforeEach(() => {
    useUiStore.setState({ graphRefFilter: [], graphSelection: null });
    useGraphStore.setState({ revealPulse: null });
  });
  afterEach(() => useGraphStore.getState().reset());

  it('selects and pulses a commit that is already loaded, expanding a short sha first', async () => {
    stream([FULL]);
    const d = deps();
    const result = await revealCommit('r1', 'a1b2c3d', {}, d);
    expect(d.resolve).toHaveBeenCalledWith('r1', 'a1b2c3d');
    expect(result).toEqual({ ok: true, sha: FULL, clearedFilter: false });
    expect(useUiStore.getState().graphSelection).toEqual({ kind: 'commit', sha: FULL });
    expect(useGraphStore.getState().revealPulse).toMatchObject({ sha: FULL, refFullName: null, nonce: 1 });
  });

  it('carries the ref badge to pulse, and a fresh nonce on a repeat', async () => {
    stream([FULL]);
    await revealCommit('r1', FULL, { refFullName: 'refs/heads/main' }, deps());
    await revealCommit('r1', FULL, { refFullName: 'refs/heads/main' }, deps());
    expect(useGraphStore.getState().revealPulse).toMatchObject({ refFullName: 'refs/heads/main', nonce: 2 });
  });

  it('waits for a commit that streams in later', async () => {
    stream(['other'], { loading: true });
    const pending = revealCommit('r1', FULL, {}, { ...deps(), timeoutMs: 1000 });
    useGraphStore.setState({ rows: [row('other'), row(FULL)] });
    await expect(pending).resolves.toMatchObject({ ok: true, sha: FULL });
  });

  it('refuses a sha git cannot resolve', async () => {
    stream([FULL]);
    const result = await revealCommit('r1', 'zzzz', {}, deps(null));
    expect(result).toEqual({ ok: false, say: "I can't find that commit in this repository." });
    expect(useUiStore.getState().graphSelection).toBeNull();
  });

  it('gives up past the row cap with the search hint', async () => {
    stream(['other'], { truncated: true });
    const result = await revealCommit('r1', FULL, {}, deps());
    expect(result).toEqual({ ok: false, say: COMMIT_BEYOND_CAP_SAY });
    expect(useUiStore.getState().graphSelection).toBeNull();
  });

  it('says the graph is still loading rather than claiming the commit is missing', async () => {
    stream(['other'], { loading: true });
    const result = await revealCommit('r1', FULL, {}, deps());
    expect(result).toMatchObject({ ok: false, say: expect.stringContaining('still loading') });
  });

  it('clears a ref filter that hides the commit, restreams, and says so', async () => {
    useUiStore.setState({ graphRefFilter: ['refs/heads/side'] });
    stream(['other']);
    const pending = revealCommit('r1', FULL, {}, { ...deps(), timeoutMs: 1000 });
    // The view's effect restarts the stream when the filter clears; stand in for it.
    const unsubscribe = useUiStore.subscribe((state) => {
      if (state.graphRefFilter.length === 0) {
        unsubscribe();
        useGraphStore.getState().begin('r1', 'r1#2');
        useGraphStore.getState().appendBatch('r1#2', [row(FULL)]);
        useGraphStore.getState().finish('r1#2', { truncated: false });
      }
    });
    await expect(pending).resolves.toEqual({ ok: true, sha: FULL, clearedFilter: true });
    expect(useUiStore.getState().graphRefFilter).toEqual([]);
  });
});
