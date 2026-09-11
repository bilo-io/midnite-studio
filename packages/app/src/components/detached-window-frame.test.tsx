import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DetachedWindowFrame,
  usePopoutHeaderActions,
  usePopoutHeaderLeading,
} from './detached-window-frame';

const mockBridge = {
  windowChrome: {
    platform: 'darwin',
    frameless: true,
    onFullscreenChange: vi.fn(() => () => {}),
    onFocusChange: vi.fn(() => () => {}),
    setBackgroundColor: vi.fn(),
  },
  window: {
    dock: vi.fn(),
  },
};

/** A single repo, matching `RepoDescriptor`, reused by the repo-cluster tests. */
const REPO = {
  id: 'r1',
  path: '/repo',
  name: 'demo',
  headRef: 'main',
  worktrees: [
    {
      id: 'r1:/repo',
      repoId: 'r1',
      path: '/repo',
      branch: 'main',
      headSha: 'abc123',
      locked: false,
      isMain: true,
      prunable: false,
    },
  ],
};

/**
 * Mutable per-test UI-store state — `useUiStore` reads live from this object
 * rather than a value captured once, so a test can flip `selectedRepoId`
 * after the initial mock setup (mirrors the real store's reactivity closely
 * enough for these render-shape assertions).
 */
const mockUiState: { selectedRepoId: string | null; selectedWorktreePath: string | null } = {
  selectedRepoId: null,
  selectedWorktreePath: null,
};

/** Mutable per-test repo list — same reasoning as `mockUiState`. */
const mockReposState: { data: (typeof REPO)[] } = { data: [] };

vi.mock('../services/bridge', () => ({
  bridge: () => mockBridge,
}));

vi.mock('../services/queries', () => ({
  useRepos: () => mockReposState,
}));

vi.mock('../store/ui-store', () => ({
  useUiStore: (selector: (s: typeof mockUiState) => unknown) => selector(mockUiState),
}));

vi.mock('./title-bar-nav', () => ({
  ReloadButton: () => <button aria-label="Reload window">Reload</button>,
  Breadcrumbs: () => <nav aria-label="Location">Crumbs</nav>,
}));

/*
  The repo-action cluster's own components (Setup/Update, Install/Build/
  Test/Launch, the midnite skill menu) each carry substantial logic of their
  own, already covered where they're defined. What belongs to THIS file is
  only the composition `DetachedWindowFrame` adds around them — the
  delimiters, the terminal-only scoping, and the props it forwards — so each
  is stubbed down to a `data-testid` carrying the props it was given.
*/
vi.mock('../features/agent/project-actions', () => ({
  ProjectActions: (props: { repoId: string; repoName: string; cwd: string }) => (
    <div data-testid="project-actions" data-repo-id={props.repoId} data-cwd={props.cwd} />
  ),
}));

vi.mock('../features/repos/repo-lifecycle-actions', () => ({
  RepoLifecycleActions: (props: { repoId: string; repoName: string; cwd: string }) => (
    <div data-testid="repo-lifecycle-actions" data-repo-id={props.repoId} data-cwd={props.cwd} />
  ),
}));

vi.mock('../features/agent/midnite-menu', () => ({
  MidniteMenu: (props: { repoId: string; repoName: string; cwd: string }) => (
    <button data-testid="midnite-menu" data-repo-id={props.repoId} data-cwd={props.cwd} />
  ),
}));

// Phase 84 Theme I: this suite is about the frame's own chrome shape, not
// about the liveness dot it now hosts in a footer — `liveness-segment.test.tsx`
// covers that component, and it needs a real QueryClientProvider this test's
// bare-store mocks don't set up.
vi.mock('../features/status-bar/liveness-segment', () => ({
  LivenessSegment: () => <div data-testid="liveness-segment-stub" />,
}));

describe('DetachedWindowFrame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUiState.selectedRepoId = null;
    mockUiState.selectedWorktreePath = null;
    mockReposState.data = [];
  });

  afterEach(cleanup);

  it('renders title and applies top padding offset for the fixed titlebar', () => {
    const { container } = render(
      <DetachedWindowFrame role="repos" title="Git Repos">
        <div data-testid="content">Repos Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.getByText('Git Repos')).toBeDefined();
    expect(screen.getByTestId('content')).toBeDefined();

    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeDefined();
    expect(root.style.paddingTop).toBe('var(--titlebar-h, 0px)');
  });

  it('omits title text for terminal and browser in merged titlebar but keeps dock-on-hover button', () => {
    const { unmount } = render(
      <DetachedWindowFrame role="terminal" title="Terminal">
        <div data-testid="content">Terminal Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.queryByText('Terminal')).toBeNull();
    expect(screen.getByLabelText('Dock Terminal')).toBeDefined();

    unmount();

    render(
      <DetachedWindowFrame role="browser" title="Browser">
        <div data-testid="content">Browser Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.queryByText('Browser')).toBeNull();
    expect(screen.getByLabelText('Dock Browser')).toBeDefined();
  });

  it('merges terminal/repos/browser into the bar: dock-on-hover mark, no separate re-dock button', () => {
    render(
      <DetachedWindowFrame role="repos" title="Git Repos">
        <div data-testid="content">Repos Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.getByText('Git Repos')).toBeDefined();
    expect(screen.queryByLabelText('Re-dock Git Repos')).toBeNull();

    screen.getByLabelText('Dock Git Repos').click();
    expect(mockBridge.window.dock).toHaveBeenCalledWith({ role: 'repos' });
  });

  it('merges Graph into the bar with its reload button and breadcrumbs alongside the dock-on-hover mark', () => {
    render(
      <DetachedWindowFrame role="graph" title="Graph">
        <div data-testid="content">Graph Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.getByText('Graph')).toBeDefined();
    expect(screen.getByLabelText('Dock Graph')).toBeDefined();
    expect(screen.getByLabelText('Reload window')).toBeDefined();
    expect(screen.getByLabelText('Location')).toBeDefined();
    expect(screen.queryByLabelText('Re-dock Graph')).toBeNull();
  });

  it('leaves the FAB popout on the plain generic frame — a dedicated re-dock button, no merged mark', () => {
    render(
      <DetachedWindowFrame role="fab" title="Midnite Loops">
        <div data-testid="content">Loops Content</div>
      </DetachedWindowFrame>,
    );

    expect(screen.getByText('Midnite Loops')).toBeDefined();
    expect(screen.queryByLabelText('Dock Midnite Loops')).toBeNull();

    screen.getByLabelText('Re-dock Midnite Loops').click();
    expect(mockBridge.window.dock).toHaveBeenCalledWith({ role: 'fab' });
  });

  it('exposes the merged bar action and leading slots only for a merged role', () => {
    let actionsSlotForRepos: HTMLDivElement | null = null;
    let leadingSlotForRepos: HTMLDivElement | null = null;
    let actionsSlotForFab: HTMLDivElement | null = null;
    let leadingSlotForFab: HTMLDivElement | null = null;

    function ReadSlots({
      intoActions,
      intoLeading,
    }: {
      intoActions: (el: HTMLDivElement | null) => void;
      intoLeading: (el: HTMLDivElement | null) => void;
    }) {
      intoActions(usePopoutHeaderActions());
      intoLeading(usePopoutHeaderLeading());
      return null;
    }

    render(
      <DetachedWindowFrame role="repos" title="Git Repos">
        <ReadSlots
          intoActions={(el) => (actionsSlotForRepos = el)}
          intoLeading={(el) => (leadingSlotForRepos = el)}
        />
      </DetachedWindowFrame>,
    );
    render(
      <DetachedWindowFrame role="fab" title="Midnite Loops">
        <ReadSlots
          intoActions={(el) => (actionsSlotForFab = el)}
          intoLeading={(el) => (leadingSlotForFab = el)}
        />
      </DetachedWindowFrame>,
    );

    expect(actionsSlotForRepos).not.toBeNull();
    expect(leadingSlotForRepos).not.toBeNull();
    expect(actionsSlotForFab).toBeNull();
    expect(leadingSlotForFab).toBeNull();
  });

  describe('terminal popout — repo action cluster + midnite menu', () => {
    it('renders nothing for the cluster, and no stray delimiters, with no repo selected', () => {
      const { container } = render(
        <DetachedWindowFrame role="terminal" title="Terminal">
          <div data-testid="content">Terminal Content</div>
        </DetachedWindowFrame>,
      );

      expect(screen.queryByTestId('project-actions')).toBeNull();
      expect(screen.queryByTestId('repo-lifecycle-actions')).toBeNull();
      expect(screen.queryByTestId('midnite-menu')).toBeNull();
      // The cluster's own two delimiters plus the leading one ahead of it —
      // none of `left`'s slots draw a bare `<span aria-hidden>` hairline for
      // a non-graph role, so with the cluster absent there should be zero.
      expect(container.querySelectorAll('span[aria-hidden].bg-border')).toHaveLength(0);
    });

    it('renders the cluster — delimiter, ProjectActions + divider + RepoLifecycleActions, delimiter, MidniteMenu — once a repo is selected', () => {
      mockUiState.selectedRepoId = 'r1';
      mockReposState.data = [REPO];

      const { container } = render(
        <DetachedWindowFrame role="terminal" title="Terminal">
          <div data-testid="content">Terminal Content</div>
        </DetachedWindowFrame>,
      );

      const projectActions = screen.getByTestId('project-actions');
      const repoLifecycle = screen.getByTestId('repo-lifecycle-actions');
      const midniteMenu = screen.getByTestId('midnite-menu');

      for (const el of [projectActions, repoLifecycle, midniteMenu]) {
        expect(el.getAttribute('data-repo-id')).toBe('r1');
        // No worktree selected — falls back to the repo's primary checkout.
        expect(el.getAttribute('data-cwd')).toBe('/repo');
      }

      // Exactly three hairlines: ahead of the cluster, between the two repo
      // action groups, and ahead of the midnite menu.
      expect(container.querySelectorAll('span[aria-hidden].bg-border')).toHaveLength(3);

      // Left to right: ProjectActions, then RepoLifecycleActions, then the
      // midnite menu — ahead of the portaled terminal-header actions slot.
      const order = Array.from(
        container.querySelectorAll(
          '[data-testid="project-actions"], [data-testid="repo-lifecycle-actions"], [data-testid="midnite-menu"]',
        ),
      ).map((el) => el.getAttribute('data-testid'));
      expect(order).toEqual(['project-actions', 'repo-lifecycle-actions', 'midnite-menu']);
    });

    it('prefers the selected worktree over the repo primary checkout for cwd', () => {
      mockUiState.selectedRepoId = 'r1';
      mockUiState.selectedWorktreePath = '/repo-worktrees/feature-x';
      mockReposState.data = [REPO];

      render(
        <DetachedWindowFrame role="terminal" title="Terminal">
          <div data-testid="content">Terminal Content</div>
        </DetachedWindowFrame>,
      );

      expect(screen.getByTestId('project-actions').getAttribute('data-cwd')).toBe(
        '/repo-worktrees/feature-x',
      );
    });

    it('is scoped to the terminal role — a repos popout with a repo selected gets no cluster', () => {
      mockUiState.selectedRepoId = 'r1';
      mockReposState.data = [REPO];

      render(
        <DetachedWindowFrame role="repos" title="Git Repos">
          <div data-testid="content">Repos Content</div>
        </DetachedWindowFrame>,
      );

      expect(screen.queryByTestId('project-actions')).toBeNull();
      expect(screen.queryByTestId('repo-lifecycle-actions')).toBeNull();
      expect(screen.queryByTestId('midnite-menu')).toBeNull();
    });
  });
});
