import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { RepoFavouritesSection, RepoGroupHeader } from './repo-groups';

afterEach(() => {
  cleanup();
});

// Reset zustand between tests so state from one does not leak to the next.
beforeEach(() => {
  useUiStore.setState({
    repoGroups: [],
    repoGroupMembership: {},
    collapsedRepoGroups: [],
    favouriteRepoIds: [],
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

  it('toggles repo favourite status', () => {
    expect(useUiStore.getState().favouriteRepoIds).toEqual([]);
    useUiStore.getState().toggleFavouriteRepo('repo-1');
    expect(useUiStore.getState().favouriteRepoIds).toEqual(['repo-1']);
    useUiStore.getState().toggleFavouriteRepo('repo-2');
    expect(useUiStore.getState().favouriteRepoIds).toEqual(['repo-1', 'repo-2']);
    useUiStore.getState().toggleFavouriteRepo('repo-1');
    expect(useUiStore.getState().favouriteRepoIds).toEqual(['repo-2']);
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

    // IconButton swaps the glyph for the shared sweeping-ring spinner while
    // busy, tinted with the button's own colour rather than a fixed one.
    const spinner = fetchBtn.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner?.className).toContain('border-r-current');
    // ...and the download glyph is gone rather than rotating in place.
    expect(fetchBtn.querySelector('svg')).toBeNull();
  });

  it('renders fully saturated color pill when group has color', () => {
    const group = { id: 'grp-1', name: 'Frontend', color: 'blue' };

    render(
      <DialogHost>
        <RepoGroupHeader
          group={group}
          repoCount={3}
          open={true}
          onToggle={() => {}}
        />
      </DialogHost>,
    );

    const pill = screen.getByTestId('repo-group-pill-grp-1');
    expect(pill).toBeTruthy();
    expect(pill.textContent).toBe('Frontend');
    expect(pill.style.backgroundColor).toBe('rgb(59, 130, 246)');
    expect(pill.style.color).toBe('rgb(255, 255, 255)');
  });
});

describe('repo groups — RepoFavouritesSection component', () => {
  const repo1 = {
    id: 'repo-1',
    name: 'repo-1',
    path: '/path/to/repo-1',
    headRef: 'refs/heads/main',
    worktrees: [],
  };

  it('renders favourites section with star icon and repo count', () => {
    render(
      <DialogHost>
        <RepoFavouritesSection repos={[repo1]} allCollapsed={false}>
          <div data-testid="child-repo">Repo 1 content</div>
        </RepoFavouritesSection>
      </DialogHost>,
    );

    const section = screen.getByTestId('repo-favourites-section');
    expect(section).toBeTruthy();
    expect(screen.getByText('Favourites')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByTestId('child-repo')).toBeTruthy();
  });

  it('toggles collapse for favourites when header is clicked', () => {
    render(
      <DialogHost>
        <RepoFavouritesSection repos={[repo1]} allCollapsed={false}>
          <div>Content</div>
        </RepoFavouritesSection>
      </DialogHost>,
    );

    const toggleBtn = screen.getByRole('button', { name: /Favourites/i });
    expect(useUiStore.getState().collapsedRepoGroups).not.toContain('favourites');

    fireEvent.click(toggleBtn);
    expect(useUiStore.getState().collapsedRepoGroups).toContain('favourites');

    fireEvent.click(toggleBtn);
    expect(useUiStore.getState().collapsedRepoGroups).not.toContain('favourites');
  });

  it('triggers onToggleCollapseAll and onFetchAll when actions clicked', () => {
    const onToggleCollapseAll = vi.fn();
    const onFetchAll = vi.fn();

    render(
      <DialogHost>
        <RepoFavouritesSection
          repos={[repo1]}
          allCollapsed={false}
          onToggleCollapseAll={onToggleCollapseAll}
          onFetchAll={onFetchAll}
        >
          <div>Content</div>
        </RepoFavouritesSection>
      </DialogHost>,
    );

    const collapseAllBtn = screen.getByRole('button', {
      name: 'Collapse all repositories in Favourites',
    });
    fireEvent.click(collapseAllBtn);
    expect(onToggleCollapseAll).toHaveBeenCalledTimes(1);

    const fetchAllBtn = screen.getByRole('button', {
      name: 'Fetch all repositories in Favourites',
    });
    fireEvent.click(fetchAllBtn);
    expect(onFetchAll).toHaveBeenCalledTimes(1);
  });
});

