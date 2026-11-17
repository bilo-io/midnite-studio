// vitest/jsdom: the renderer half's answers over the store — no browser capability needed.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamesLevelEditorReply, type LevelEditorRequest } from '@midnite/studio-shared';

import { answerLevelEditorRequest, useLevelEditorBridge } from './use-level-editor-bridge';
import { useLevelStore } from './level-store';
import { blankLevel, installBridge, removeBridge } from './test-helpers';

const data = (level: unknown, issues: Array<{ path: string; message: string }> = []) => ({ level, issues, images: [] }) as never;

describe('answerLevelEditorRequest', () => {
  beforeEach(() => useLevelStore.setState({ byGame: {} }));

  it('C3: snapshots the open scene with its serialised level and dirty flag, and answers not-open for another', () => {
    useLevelStore.getState().open('g1', 'level', data(blankLevel()));
    const answer = answerLevelEditorRequest({ kind: 'snapshot', gameId: 'g1', scene: 'level' });
    expect(answer).toMatchObject({ handled: true, value: { dirty: false } });
    expect((answer as { value: { level: { type?: string } } }).value.level).toMatchObject({ orientation: 'orthogonal' });
    expect(answerLevelEditorRequest({ kind: 'snapshot', gameId: 'g1', scene: 'other' })).toEqual({ handled: false, reason: 'not-open' });
    expect(answerLevelEditorRequest({ kind: 'snapshot', gameId: 'g2', scene: 'level' })).toEqual({ handled: false, reason: 'not-open' });
  });

  it('C4: apply on a read-only level answers read-only, while a read still answers', () => {
    useLevelStore.getState().open('g1', 'level', data(blankLevel(), [{ path: 'layers', message: 'bad' }]));
    const apply: LevelEditorRequest = { kind: 'apply', gameId: 'g1', scene: 'level', ops: [{ op: 'delete', id: 1 }], unit: 'px', label: 'x', select: false };
    expect(answerLevelEditorRequest(apply)).toEqual({ handled: false, reason: 'read-only' });
    expect(answerLevelEditorRequest({ kind: 'snapshot', gameId: 'g1', scene: 'level' })).toMatchObject({ handled: true });
  });

  it('C5: a reply with a non-uuid id is rejected', () => {
    expect(GamesLevelEditorReply.safeParse({ id: 'nope', result: { handled: false, reason: 'not-open' } }).success).toBe(false);
    expect(GamesLevelEditorReply.safeParse({ id: crypto.randomUUID(), result: { handled: false, reason: 'not-open' } }).success).toBe(true);
  });
});

describe('useLevelEditorBridge', () => {
  beforeEach(() => useLevelStore.setState({ byGame: {} }));
  afterEach(() => {
    cleanup();
    removeBridge();
  });

  it('reports presence for the open scene, replies to requests, and reports null on unmount', () => {
    let push: (event: { id: string; request: unknown }) => void = () => undefined;
    const editorOpen = vi.fn();
    const editorReply = vi.fn();
    installBridge({
      editorOpen,
      editorReply,
      onEditorRequest: vi.fn((handler) => {
        push = handler;
        return () => undefined;
      }),
    });
    const { unmount } = renderHook(() => useLevelEditorBridge('g1'));
    expect(editorOpen).toHaveBeenLastCalledWith(null);
    act(() => useLevelStore.getState().open('g1', 'level', data(blankLevel())));
    expect(editorOpen).toHaveBeenLastCalledWith({ gameId: 'g1', scene: 'level' });
    const id = crypto.randomUUID();
    push({ id, request: { kind: 'snapshot', gameId: 'g1', scene: 'level' } });
    expect(editorReply).toHaveBeenCalledWith({ id, result: expect.objectContaining({ handled: true }) });
    unmount();
    expect(editorOpen).toHaveBeenLastCalledWith(null);
  });
});
