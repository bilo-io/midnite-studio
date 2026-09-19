import type { Commit, GraphRow } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGraphStore } from './graph-store';

const commit = (sha: string): Commit => ({
  sha,
  parents: [],
  authorName: 'Test',
  authorEmail: 't@e',
  authorDate: 0,
  committerDate: 0,
  subject: sha,
  refs: [],
  coAuthors: [],
  sessionTrailers: [],
});

const row = (index: number, sha: string): GraphRow => ({
  row: index,
  commit: commit(sha),
  lane: 0,
  colorIdx: 0,
  edges: [],
  laneCount: 1,
});

beforeEach(() => {
  useGraphStore.getState().reset();
});

describe('graph stream reducer', () => {
  it('appends batches in arrival order', () => {
    const store = useGraphStore.getState();
    store.begin('repo-a', 'q1');
    useGraphStore.getState().appendBatch('q1', [row(0, 'a'), row(1, 'b')]);
    useGraphStore.getState().appendBatch('q1', [row(2, 'c')]);

    expect(useGraphStore.getState().rows.map((r) => r.commit.sha)).toEqual(['a', 'b', 'c']);
  });

  it('discards a batch from a superseded stream', () => {
    // The case this whole mechanism exists for: cancelling cannot un-send bytes
    // git already wrote into the pipe, so the old repo's batches arrive AFTER
    // the switch. Without the id they append to the new repo's graph.
    useGraphStore.getState().begin('repo-a', 'q1');
    useGraphStore.getState().appendBatch('q1', [row(0, 'old')]);

    useGraphStore.getState().begin('repo-b', 'q2');
    useGraphStore.getState().appendBatch('q1', [row(1, 'stale')]);
    useGraphStore.getState().appendBatch('q2', [row(0, 'new')]);

    expect(useGraphStore.getState().rows.map((r) => r.commit.sha)).toEqual(['new']);
    expect(useGraphStore.getState().repoId).toBe('repo-b');
  });

  it('clears the previous repo rows when a new stream begins', () => {
    useGraphStore.getState().begin('repo-a', 'q1');
    useGraphStore.getState().appendBatch('q1', [row(0, 'a')]);
    useGraphStore.getState().begin('repo-b', 'q2');

    expect(useGraphStore.getState().rows).toEqual([]);
    expect(useGraphStore.getState().loading).toBe(true);
  });

  it('ignores a done event from a superseded stream', () => {
    // Otherwise the old stream finishing stops the NEW stream's spinner.
    useGraphStore.getState().begin('repo-a', 'q1');
    useGraphStore.getState().begin('repo-b', 'q2');
    useGraphStore.getState().finish('q1', { truncated: false });

    expect(useGraphStore.getState().loading).toBe(true);
  });

  it('records truncation and errors from the accepted stream', () => {
    useGraphStore.getState().begin('repo-a', 'q1');
    useGraphStore.getState().finish('q1', { truncated: true, error: 'boom' });

    expect(useGraphStore.getState()).toMatchObject({
      loading: false,
      truncated: true,
      error: 'boom',
    });
  });

  it('drops batches when idle', () => {
    useGraphStore.getState().appendBatch('q1', [row(0, 'a')]);
    expect(useGraphStore.getState().rows).toEqual([]);
  });

  describe('provenance computation (Phase 78 Theme C)', () => {
    it('computes provenance for rows as batches arrive', () => {
      useGraphStore.getState().begin('repo-a', 'q1');

      const humanRow = row(0, 'human-sha');

      const claudeRow = row(1, 'claude-sha');
      claudeRow.commit.coAuthors = ['Claude <noreply@anthropic.com>'];

      const trailerRow = row(2, 'trailer-sha');
      trailerRow.commit.sessionTrailers = ['sess-1'];

      useGraphStore.getState().setProvenanceContext({
        sessions: [
          {
            id: 'sess-1',
            kind: 'agent',
            agentId: 'claude',
            title: 'feature',
            cwd: '/repo',
            repoId: 'repo-a',
            createdAt: 1000,
            closedAt: 2000,
            exitCode: 0,
            reason: 'closed',
            transcriptBytes: 100,
          },
        ],
      });

      useGraphStore.getState().appendBatch('q1', [humanRow, claudeRow, trailerRow]);

      const { provenance } = useGraphStore.getState();
      expect(provenance['human-sha']).toEqual({ kind: 'human' });
      expect(provenance['claude-sha']).toEqual({
        kind: 'mixed',
        agentIds: ['claude'],
        source: 'co-author',
      });
      expect(provenance['trailer-sha']).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-trailer',
        sessionId: 'sess-1',
      });
    });

    it('recomputes provenance when setProvenanceContext updates sessions or roster', () => {
      useGraphStore.getState().begin('repo-a', 'q1');

      const windowRow = row(0, 'window-sha');
      windowRow.commit.committerDate = 1500;

      useGraphStore.getState().appendBatch('q1', [windowRow]);
      // Initially no matching session window, so classified as human
      expect(useGraphStore.getState().provenance['window-sha']).toEqual({ kind: 'human' });

      // Sessions arrive later
      useGraphStore.getState().setProvenanceContext({
        sessions: [
          {
            id: 'sess-window',
            kind: 'agent',
            agentId: 'codex',
            title: 'bugfix',
            cwd: '/repo',
            repoId: 'repo-a',
            createdAt: 1000,
            closedAt: 2000,
            exitCode: 0,
            reason: 'closed',
            transcriptBytes: 50,
          },
        ],
      });

      expect(useGraphStore.getState().provenance['window-sha']).toEqual({
        kind: 'agent',
        agentIds: ['codex'],
        source: 'session-window',
        sessionId: 'sess-window',
      });
    });

    it('clears provenance on begin and reset', () => {
      useGraphStore.getState().begin('repo-a', 'q1');
      useGraphStore.getState().appendBatch('q1', [row(0, 'sha-1')]);
      expect(useGraphStore.getState().provenance['sha-1']).toBeDefined();

      useGraphStore.getState().begin('repo-b', 'q2');
      expect(useGraphStore.getState().provenance).toEqual({});

      useGraphStore.getState().appendBatch('q2', [row(0, 'sha-2')]);
      expect(useGraphStore.getState().provenance['sha-2']).toBeDefined();

      useGraphStore.getState().reset();
      expect(useGraphStore.getState().provenance).toEqual({});
    });
  });
});
