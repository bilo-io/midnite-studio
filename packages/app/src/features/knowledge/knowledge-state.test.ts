// Layer: vitest — pure reducer, no DOM/browser capability needed.
import type { KnowledgeGraphPayload, KnowledgeResult } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { resolveKnowledgeViewState } from './knowledge-state';

const GRAPH: KnowledgeGraphPayload = {
  nodes: [{ id: 'a', label: 'A', community: 0, communityName: 'core', fileType: 'code' }],
  links: [],
  positions: { a: { x: 0, y: 0 } },
  builtAtCommit: 'deadbeef',
  cached: true,
  commitsBehind: 0,
};

describe('resolveKnowledgeViewState (Phase 87 Theme F)', () => {
  it('is loading while the query is in flight, regardless of stale cached data', () => {
    expect(resolveKnowledgeViewState(true, undefined)).toEqual({ kind: 'loading' });
  });

  it('is loading when no result has arrived yet, even if not marked isLoading (e.g. disabled query)', () => {
    expect(resolveKnowledgeViewState(false, undefined)).toEqual({ kind: 'loading' });
  });

  it('resolves absent — the common, un-graphified-repo case', () => {
    const result: KnowledgeResult<KnowledgeGraphPayload> = { ok: false, kind: 'absent' };
    expect(resolveKnowledgeViewState(false, result)).toEqual({ kind: 'absent' });
  });

  it('resolves unreadable with its message, distinct from absent', () => {
    const result: KnowledgeResult<KnowledgeGraphPayload> = {
      ok: false,
      kind: 'unreadable',
      message: 'EACCES',
    };
    expect(resolveKnowledgeViewState(false, result)).toEqual({
      kind: 'unreadable',
      message: 'EACCES',
    });
  });

  it('resolves malformed with its message, distinct from absent and unreadable', () => {
    const result: KnowledgeResult<KnowledgeGraphPayload> = {
      ok: false,
      kind: 'malformed',
      message: 'not shaped like a graph',
    };
    expect(resolveKnowledgeViewState(false, result)).toEqual({
      kind: 'malformed',
      message: 'not shaped like a graph',
    });
  });

  it('resolves the catch-all error arm', () => {
    const result: KnowledgeResult<KnowledgeGraphPayload> = {
      ok: false,
      kind: 'error',
      message: 'boom',
    };
    expect(resolveKnowledgeViewState(false, result)).toEqual({ kind: 'error', message: 'boom' });
  });

  it('resolves ready, not stale, when commitsBehind is 0', () => {
    const result: KnowledgeResult<KnowledgeGraphPayload> = { ok: true, value: GRAPH };
    expect(resolveKnowledgeViewState(false, result)).toEqual({
      kind: 'ready',
      graph: GRAPH,
      stale: false,
      commitsBehind: 0,
    });
  });

  it('resolves ready and stale when commitsBehind is positive', () => {
    const staleGraph = { ...GRAPH, commitsBehind: 4 };
    const result: KnowledgeResult<KnowledgeGraphPayload> = { ok: true, value: staleGraph };
    expect(resolveKnowledgeViewState(false, result)).toEqual({
      kind: 'ready',
      graph: staleGraph,
      stale: true,
      commitsBehind: 4,
    });
  });

  it('resolves ready and NOT stale when commitsBehind could not be determined (null)', () => {
    // The phase doc's own rule: staleness is reported, never guessed — an
    // unknown count must never render as "stale" (which would suggest a real,
    // if unstated, number of commits) or silently default to 0.
    const unknownGraph = { ...GRAPH, commitsBehind: null };
    const result: KnowledgeResult<KnowledgeGraphPayload> = { ok: true, value: unknownGraph };
    expect(resolveKnowledgeViewState(false, result)).toEqual({
      kind: 'ready',
      graph: unknownGraph,
      stale: false,
      commitsBehind: null,
    });
  });
});
