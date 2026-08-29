import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';

// Reset zustand between tests so state from one does not leak to the next.
beforeEach(() => {
  useUiStore.setState({
    repoGroups: [],
    repoGroupMembership: {},
    collapsedRepoGroups: [],
  });
});

describe('repo groups — store', () => {
  it('creates a group and returns its id', () => {
    const id = useUiStore.getState().createRepoGroup('Work');
    expect(id).toMatch(/^grp-/);
    expect(useUiStore.getState().repoGroups).toHaveLength(1);
    expect(useUiStore.getState().repoGroups[0]?.name).toBe('Work');
  });

  it('renames a group', () => {
    const id = useUiStore.getState().createRepoGroup('Old');
    useUiStore.getState().renameRepoGroup(id, 'New');
    expect(useUiStore.getState().repoGroups[0]?.name).toBe('New');
  });

  it('deletes a group and its memberships', () => {
    const id = useUiStore.getState().createRepoGroup('Delete me');
    useUiStore.getState().assignRepoToGroup('repo-a', id);
    useUiStore.getState().deleteRepoGroup(id);
    expect(useUiStore.getState().repoGroups).toHaveLength(0);
    expect(useUiStore.getState().repoGroupMembership['repo-a']).toBeUndefined();
  });

  it('assigns and removes a repo from a group', () => {
    const id = useUiStore.getState().createRepoGroup('Mine');
    useUiStore.getState().assignRepoToGroup('repo-1', id);
    expect(useUiStore.getState().repoGroupMembership['repo-1']).toBe(id);
    useUiStore.getState().removeRepoFromGroup('repo-1');
    expect(useUiStore.getState().repoGroupMembership['repo-1']).toBeUndefined();
  });

  it('toggles collapse state for a group', () => {
    const id = useUiStore.getState().createRepoGroup('G');
    expect(useUiStore.getState().collapsedRepoGroups).not.toContain(id);
    useUiStore.getState().toggleRepoGroup(id);
    expect(useUiStore.getState().collapsedRepoGroups).toContain(id);
    useUiStore.getState().toggleRepoGroup(id);
    expect(useUiStore.getState().collapsedRepoGroups).not.toContain(id);
  });

  it('reorders groups', () => {
    const a = useUiStore.getState().createRepoGroup('A');
    const b = useUiStore.getState().createRepoGroup('B');
    const c = useUiStore.getState().createRepoGroup('C');
    useUiStore.getState().reorderRepoGroups([c, b, a]);
    expect(useUiStore.getState().repoGroups.map((g) => g.name)).toEqual(['C', 'B', 'A']);
  });

  it('sets and clears a group color', () => {
    const id = useUiStore.getState().createRepoGroup('ColorGroup');
    expect(useUiStore.getState().repoGroups[0]?.color).toBeUndefined();
    useUiStore.getState().setRepoGroupColor(id, 'red');
    expect(useUiStore.getState().repoGroups[0]?.color).toBe('red');
    useUiStore.getState().setRepoGroupColor(id, undefined);
    expect(useUiStore.getState().repoGroups[0]?.color).toBeUndefined();
  });
});
