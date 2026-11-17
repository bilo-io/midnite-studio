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

describe('apply (Phase 138 Theme F)', () => {
  beforeEach(() => useLevelStore.setState({ byGame: {} }));
  const apply = (ops: Extract<LevelEditorRequest, { kind: 'apply' }>['ops'], label = 'Add 2 objects'): LevelEditorRequest => ({
    kind: 'apply',
    gameId: 'g1',
    scene: 'level',
    ops,
    unit: 'px',
    label,
    select: true,
  });
  const objects = () => useLevelStore.getState().byGame.g1!.edit.level.layers.flatMap((l) => l.objects ?? []);

  it('lands the batch as one undo step, selects the new objects and records the change set', () => {
    useLevelStore.getState().open('g1', 'level', data(blankLevel()));
    const before = useLevelStore.getState().byGame.g1!.edit.past.length;
    const answer = answerLevelEditorRequest(
      apply([
        { op: 'add', entity: { type: 'pickup', x: 10, y: 10 }, ref: 'a' },
        { op: 'add', entity: { type: 'pickup', x: 20, y: 20 }, ref: 'b' },
      ]),
    );
    expect(answer).toMatchObject({ handled: true, value: { added: [expect.any(Number), expect.any(Number)], refs: { a: expect.any(Number) } } });
    const entry = useLevelStore.getState().byGame.g1!;
    expect(entry.edit.past.length).toBe(before + 1);
    expect(entry.edit.selected).toHaveLength(2);
    expect(entry.agentChanges[0]).toMatchObject({ label: 'Add 2 objects', undoDepth: before + 1 });
    expect(entry.highlight?.ids).toHaveLength(2);
    expect(objects().filter((o) => o.type === 'pickup')).toHaveLength(2);
  });

  it('a failing batch changes nothing and answers the errors', () => {
    useLevelStore.getState().open('g1', 'level', data(blankLevel()));
    const before = useLevelStore.getState().byGame.g1!;
    const answer = answerLevelEditorRequest(apply([{ op: 'delete', id: 999 }]));
    expect(answer).toMatchObject({ ok: false, message: expect.stringContaining('op 0 (delete)') });
    expect(useLevelStore.getState().byGame.g1!.edit).toBe(before.edit);
    expect(useLevelStore.getState().byGame.g1!.agentChanges).toEqual([]);
  });
});
