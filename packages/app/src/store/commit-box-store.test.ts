import { afterEach, describe, expect, it, vi } from 'vitest';

import { draftKey, useCommitBoxStore } from './commit-box-store';

afterEach(() => useCommitBoxStore.setState({ handle: null, handles: [], drafts: {} }));

describe('commit-box-store', () => {
  it('stacks handles: the topmost is the one Mod+Enter calls, and removing it hands back', () => {
    const changes = { run: vi.fn() };
    const graph = { run: vi.fn() };
    const store = useCommitBoxStore.getState();

    store.register(changes);
    store.register(graph);
    expect(useCommitBoxStore.getState().handle).toBe(graph);

    store.unregister(graph);
    expect(useCommitBoxStore.getState().handle).toBe(changes);
  });

  it('unregistering a handle that is not on top leaves the top alone', () => {
    const older = { run: vi.fn() };
    const newer = { run: vi.fn() };
    useCommitBoxStore.getState().register(older);
    useCommitBoxStore.getState().register(newer);
    useCommitBoxStore.getState().unregister(older);
    expect(useCommitBoxStore.getState().handle).toBe(newer);
    expect(useCommitBoxStore.getState().handles).toEqual([newer]);
  });

  it('keeps one draft per checkout, and forgets an emptied one', () => {
    const main = draftKey('repo-1', undefined);
    const linked = draftKey('repo-1', '/tmp/linked');
    useCommitBoxStore.getState().setDraft(main, 'fix: main');
    useCommitBoxStore.getState().setDraft(linked, 'feat: linked');
    expect(useCommitBoxStore.getState().drafts).toEqual({ [main]: 'fix: main', [linked]: 'feat: linked' });

    useCommitBoxStore.getState().setDraft(main, '');
    expect(useCommitBoxStore.getState().drafts).toEqual({ [linked]: 'feat: linked' });
  });
});
