import type { ResourceRef } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionsStore } from '../../../../store/sessions-store';
import { useUiStore } from '../../../../store/ui-store';
import { useWorkflowRevealStore } from '../../../../store/workflow-reveal-store';
import { useChatsStore } from '@midnite/studio-feature-chats/renderer';
import { useCouncilsHistoryStore } from '@midnite/studio-feature-councils/renderer';
import { useBoardSelectionStore } from '../../../tasks/board-selection-store';
import type { RevealContext } from '../types';
import { AGENT_REVEALERS } from './agent';

const mocks = vi.hoisted(() => ({
  bridge: undefined as unknown,
  revealSession: vi.fn(),
}));

vi.mock('../../../../services/bridge', () => ({ bridge: () => mocks.bridge }));
vi.mock('../../../terminal/reveal-session', () => ({ revealSession: mocks.revealSession }));

const ctx: RevealContext = { caller: 'companion', focusedWindow: false };
const run = (ref: ResourceRef) =>
  (AGENT_REVEALERS[ref.kind as keyof typeof AGENT_REVEALERS].reveal as (r: ResourceRef, c: RevealContext) => ReturnType<typeof AGENT_REVEALERS.chat.reveal>)(ref, ctx);

describe('agent-work revealers (store fakes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bridge = undefined;
    useChatsStore.setState({ selectedId: null });
    useSessionsStore.setState({ selectedClosedSessionId: null, selectedLiveSessionId: 'live' });
    useCouncilsHistoryStore.getState().reset();
    useWorkflowRevealStore.setState({ selectedId: null, pending: null });
    useBoardSelectionStore.setState({ selected: null, revealNonce: 0 });
    useUiStore.setState({ projectBoardByRepo: {}, projectsMode: {} });
  });

  it('chat: selects it; a chat the bridge cannot load is not-found', async () => {
    mocks.bridge = { chats: { get: vi.fn(async () => ({ ok: true })) } };
    useChatsStore.setState({ select: vi.fn() } as never);
    const out = await run({ kind: 'chat', id: 'c1' });
    expect(useChatsStore.getState().select).toHaveBeenCalledWith('c1');
    expect(out).toMatchObject({ ok: true });

    mocks.bridge = { chats: { get: vi.fn(async () => ({ ok: false, kind: 'not-found' })) } };
    expect(await run({ kind: 'chat', id: 'gone' })).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('session: a live one goes through revealSession, and a stale id is not-found', async () => {
    mocks.revealSession.mockReturnValue(true);
    expect(await run({ kind: 'session', id: 's1' })).toMatchObject({ ok: true });
    expect(mocks.revealSession).toHaveBeenCalledWith('s1');
    mocks.revealSession.mockReturnValue(false);
    expect(await run({ kind: 'session', id: 's2' })).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('session: a closed one selects it on Sessions and clears the live selection', async () => {
    await run({ kind: 'session', id: 's9', closed: true });
    expect(useSessionsStore.getState().selectedClosedSessionId).toBe('s9');
    expect(useSessionsStore.getState().selectedLiveSessionId).toBeNull();
  });

  it('council: pushes the council, then its run, onto the history stack', async () => {
    await run({ kind: 'council', id: 'k1', runId: 'run1' });
    const { entries, index } = useCouncilsHistoryStore.getState();
    expect(entries[index]).toEqual({ kind: 'run', id: 'run1', councilId: 'k1' });
    expect(entries[index - 1]).toEqual({ kind: 'council', id: 'k1' });
  });

  it('council: an id the list does not hold is not-found and pushes nothing', async () => {
    mocks.bridge = { council: { list: vi.fn(async () => ({ councils: [{ id: 'other' }] })) } };
    expect(await run({ kind: 'council', id: 'k1' })).toMatchObject({ ok: false, reason: 'not-found' });
    expect(useCouncilsHistoryStore.getState().entries).toEqual([{ kind: 'list' }]);
  });

  it('workflow: selects it in the store (before the view mounts) and queues the run', async () => {
    await run({ kind: 'workflow', id: 'w1', runId: 'r5' });
    expect(useWorkflowRevealStore.getState().selectedId).toBe('w1');
    expect(useWorkflowRevealStore.getState().pending).toEqual({ workflowId: 'w1', runId: 'r5' });
    await run({ kind: 'workflow', id: 'w2' });
    expect(useWorkflowRevealStore.getState().selectedId).toBe('w2');
  });

  it('workflow: not-found when the list lacks it', async () => {
    mocks.bridge = { workflow: { list: vi.fn(async () => ({ workflows: [] })) } };
    expect(await run({ kind: 'workflow', id: 'w1' })).toMatchObject({ ok: false, reason: 'not-found' });
    expect(useWorkflowRevealStore.getState().selectedId).toBeNull();
  });

  it('board: points the repo at that project board', async () => {
    await run({ kind: 'board', repoId: 'r1', projectId: 'p1' });
    expect(useUiStore.getState().projectBoardByRepo).toMatchObject({ r1: 'p1' });
  });

  it('card: opens the board, selects the card and bumps the scroll nonce', async () => {
    await run({ kind: 'card', repoId: 'r1', projectId: 'p1', cardId: 'item-7' });
    expect(useUiStore.getState().projectBoardByRepo).toMatchObject({ r1: 'p1' });
    expect(useUiStore.getState().projectsMode).toMatchObject({ r1: 'board' });
    expect(useBoardSelectionStore.getState()).toMatchObject({
      selected: { repoId: 'r1', itemId: 'item-7' },
      revealNonce: 1,
    });
  });
});
