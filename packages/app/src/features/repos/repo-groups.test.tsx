import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { RepoGroupHeader } from './repo-groups';

afterEach(() => {
  cleanup();
});

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
    const id = useUiStore.getState().createRepoGroup('Work');
    useUiStore.getState().assignRepoToGroup('repo-a', id);
    expect(useUiStore.getState().repoGroupMembership['repo-a']).toBe(id);

    useUiStore.getState().removeRepoFromGroup('repo-a');
    expect(useUiStore.getState().repoGroupMembership['repo-a']).toBeUndefined();
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
    const id1 = useUiStore.getState().createRepoGroup('First');
    const id2 = useUiStore.getState().createRepoGroup('Second');
    const id3 = useUiStore.getState().createRepoGroup('Third');

    useUiStore.getState().reorderRepoGroups([id3, id1, id2]);
    const names = useUiStore.getState().repoGroups.map((g) => g.name);
    expect(names).toEqual(['Third', 'First', 'Second']);
  });

  it('sets and clears a group color', () => {
    const id = useUiStore.getState().createRepoGroup('Work');
    useUiStore.getState().setRepoGroupColor(id, 'red');
    expect(useUiStore.getState().repoGroups[0]?.color).toBe('red');
    useUiStore.getState().setRepoGroupColor(id, undefined);
    expect(useUiStore.getState().repoGroups[0]?.color).toBeUndefined();
  });
});

describe('repo groups — RepoGroupHeader component', () => {
  it('renders collapse/expand all button and handles clicks', () => {
    const group = { id: 'grp-1', name: 'Work' };
    const onToggleCollapseAll = vi.fn();

    render(
      <DialogHost>
        <RepoGroupHeader
          group={group}
          repoCount={2}
          open={true}
          onToggle={() => {}}
          onToggleCollapseAll={onToggleCollapseAll}
          allCollapsed={false}
        />
      </DialogHost>,
    );

    const collapseBtn = screen.getByRole('button', { name: 'Collapse all repositories in Work' });
    expect(collapseBtn).toBeTruthy();

    fireEvent.click(collapseBtn);
    expect(onToggleCollapseAll).toHaveBeenCalledTimes(1);
  });

  it('renders fetch all button and handles clicks', () => {
    const group = { id: 'grp-1', name: 'Work' };
    const onFetchAll = vi.fn();

    render(
      <DialogHost>
        <RepoGroupHeader
          group={group}
          repoCount={2}
          open={true}
          onToggle={() => {}}
          onFetchAll={onFetchAll}
          isFetching={false}
        />
      </DialogHost>,
    );

    const fetchBtn = screen.getByRole('button', { name: 'Fetch all repositories in Work' });
    expect(fetchBtn).toBeTruthy();
    expect(fetchBtn.getAttribute('aria-busy')).toBeNull();

    fireEvent.click(fetchBtn);
    expect(onFetchAll).toHaveBeenCalledTimes(1);
  });

  it('renders rotating custom css spinner while fetching', () => {
    const group = { id: 'grp-1', name: 'Work' };

    render(
      <DialogHost>
        <RepoGroupHeader
          group={group}
          repoCount={2}
          open={true}
          onToggle={() => {}}
          onFetchAll={() => {}}
          isFetching={true}
        />
      </DialogHost>,
    );

    const fetchBtn = screen.getByRole('button', { name: 'Fetch all repositories in Work' });
    expect(fetchBtn.getAttribute('aria-busy')).toBe('true');

    // The spinner element has animate-spin and border styling from skeleton Spinner
    const spinner = fetchBtn.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner?.className).toContain('border-r-foreground');
  });
});
