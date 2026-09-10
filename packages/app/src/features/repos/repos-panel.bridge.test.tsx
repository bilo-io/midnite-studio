import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { useBrowserStore } from '../../store/browser-store';
import { useOpsJournalStore } from '../../store/ops-journal-store';
import { JournalList } from '../history/journal-list';
import { ReposPanel } from './repos-panel';

/**
 * Migrated from `e2e/remote-links.spec.ts` and `e2e/journal-undo.spec.ts`
 * (Phase 82 Theme C, wave 5) — both drive `ReposPanel` (the sidebar tree)
 * through the real bridge, so they share one file.
 *
 * `ReposPanel` has no `React.lazy` boundary of its own (it is always
 * mounted, not view-registry-gated), so no chunk warm-up is needed.
 *
 * `remote-links`: a github remote's project link opens an in-app browser
 * tab rather than the system browser — asserted here against
 * `useBrowserStore`'s own state (the tab strip component that renders it
 * lives elsewhere and is out of scope for this file) rather than against
 * `window.__mstudioExternalUrls`, which is asserted directly since that is
 * the real recorder the mock bridge's `shell.openExternal` writes into. A
 * remote with no forge offers no link at all, and a repo with no remotes
 * configured still renders normally.
 *
 * `journal-undo`: deleting a branch from its row menu journals the delete,
 * toasts by name and offers an Undo that recreates the branch at its own
 * sha (not `HEAD`); the delete and its undo both land in the journal (read
 * here via `JournalList` mounted alongside, rather than navigating to the
 * History view, since both read the same `ops-journal-store` singleton);
 * and renaming a branch offers an Undo that renames it back.
 */

const SHA = 'b'.repeat(40);

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: SHA,
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const journalData: MockFixtures = {
  ...fixtures,
  refs: [localRef('main', { isHead: true, sha: 'a'.repeat(40) }), localRef('feature/shelved')],
};

const remoteRef = (remote: string, branch: string) => ({
  name: `${remote}/${branch}`,
  fullName: `refs/remotes/${remote}/${branch}`,
  kind: 'remoteBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
});

const REFS = [
  {
    name: 'main',
    fullName: 'refs/heads/main',
    kind: 'localBranch',
    sha: 'a'.repeat(40),
    upstream: { name: 'origin/main', ahead: 0, behind: 0, gone: false },
    isHead: true,
    worktreePath: null,
  },
  remoteRef('origin', 'main'),
  remoteRef('backup', 'main'),
];

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
  {
    name: 'backup',
    fetchUrl: '/Volumes/backup/midnite-studio.git',
    pushUrl: '/Volumes/backup/midnite-studio.git',
    forge: null,
  },
];

const withRemotes: MockFixtures = { ...fixtures, refs: REFS, remotes: REMOTES };

async function openSidebar(data: MockFixtures): Promise<void> {
  renderView(
    <ToastHost>
      <ReposPanel />
    </ToastHost>,
    { fixtures: data },
  );
  await screen.findByRole('heading', { name: 'Worktrees' });
}

const externalUrls = () => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls;
type OpCall = { op: string; args: Record<string, unknown> };
const opsFor = (op: string): OpCall[] =>
  (window as unknown as { __mstudioOps: OpCall[] }).__mstudioOps.filter((c) => c.op === op);

/**
 * The toast carrying `text`, found by its own message rather than by role:
 * a `role="status"` live region (`dnd-kit`'s own announcer, among others)
 * already exists at mount, so `findAllByRole('status')` resolves the moment
 * ANY of them appears — often before the toast we are waiting on has been
 * raised at all. Waiting on the message text itself and climbing to its
 * containing toast is what actually waits for the right element.
 */
async function findToast(text: string): Promise<HTMLElement> {
  const message = await screen.findByText(text);
  const toast = message.closest('[role="status"]');
  if (!toast) throw new Error(`"${text}" is not inside a toast`);
  return toast as HTMLElement;
}

/** Delete `feature/shelved` from its own row menu, through the confirm. */
async function deleteShelvedBranch(): Promise<void> {
  await openSidebar(journalData);

  const menu = await screen.findByRole('button', { name: 'Actions for branch feature/shelved' });
  fireEvent.click(menu);
  fireEvent.click(await screen.findByRole('menuitem', { name: /Delete feature\/shelved/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete branch' }));
}

// Both `useBrowserStore` and `useOpsJournalStore` are `persist`-backed module
// singletons: without this, a browser tab or a journal entry from one test
// survives into the next, since only the container unmounts on `cleanup` —
// the store itself does not.
beforeEach(() => {
  useBrowserStore.setState({ tabs: [], activeTabId: null });
  useOpsJournalStore.setState({ entriesByRepo: {} });
});
afterEach(cleanup);

describe('remote links, assembled through the real bridge', () => {
  it('a github remote offers a link to its project page, opening an in-app browser tab', async () => {
    await openSidebar(withRemotes);

    const link = await screen.findByRole('button', {
      name: 'Open bilo-io/midnite-studio on github.com',
    });
    expect(link).toBeTruthy();
    fireEvent.click(link);

    // https, not the ssh URL the remote was configured with, and routed
    // in-app rather than to `shell.openExternal` (Phase 71 Theme B's default
    // routing for the remote's project link).
    const { tabs } = useBrowserStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.url).toMatch(/^https:\/\/github\.com\//);
    expect(externalUrls()).toEqual([]);
  });

  it('a remote with no forge offers no link at all', async () => {
    await openSidebar(withRemotes);

    // Present as a group — a local-path remote is a real remote — but with
    // nothing to open.
    expect(await screen.findByRole('heading', { name: 'backup' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Open .* on / })).toHaveLength(1);
  });

  it('the sidebar renders normally for a repo with no remotes configured', async () => {
    // The degrade-not-error case: a repo with remote-tracking refs but no
    // readable config must still draw its tree.
    await openSidebar({ ...fixtures, refs: REFS, remotes: [] });

    expect(await screen.findByRole('heading', { name: 'origin' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open .* on / })).toBeNull();
  });
});

describe('branch delete/rename undo, assembled through the real bridge', () => {
  it('deleting a branch toasts by name and offers an Undo that restores that branch', async () => {
    await deleteShelvedBranch();

    // Named, not the wrapper's generic "Deleted a branch" — a toast that
    // cannot say which branch went is not something you can act on.
    const toast = await findToast('Deleted branch feature/shelved');

    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));

    // The undo is a forward `branchCreate` at the deleted branch's own sha —
    // not `HEAD`, and not a branch named `HEAD`.
    await waitFor(() =>
      expect(opsFor('branchCreate')).toEqual([
        {
          op: 'branchCreate',
          args: expect.objectContaining({
            name: 'feature/shelved',
            startPoint: SHA,
            checkout: false,
          }),
        },
      ]),
    );
  });

  it('the delete and its undo both land in the journal, the undo marked as one', async () => {
    await deleteShelvedBranch();

    const toast = await findToast('Deleted branch feature/shelved');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));

    // Mounted alongside, rather than navigated to via the History view: both
    // read the same `ops-journal-store` singleton `ReposPanel`'s own actions
    // wrote into, so this proves the same fact the assembled History view
    // would without needing app-level routing.
    act(() => {
      renderView(
        <ToastHost>
          <JournalList repoId="repo-1" />
        </ToastHost>,
      );
    });

    const journal = screen.getByRole('list', { name: 'Ops journal' });
    // Newest first: the undo's own entry, then the delete it undid.
    await waitFor(() =>
      expect(within(journal).getByText('Undo: Deleted branch feature/shelved')).toBeTruthy(),
    );
    expect(
      within(journal).getByText('Deleted branch feature/shelved', { exact: true }),
    ).toBeTruthy();
  });

  it('renaming a branch offers an Undo that renames it back', async () => {
    await openSidebar(journalData);

    const menu = await screen.findByRole('button', { name: 'Actions for branch feature/shelved' });
    fireEvent.click(menu);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Rename feature\/shelved/ }));
    fireEvent.change(await screen.findByLabelText('New name'), {
      target: { value: 'feature/renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    const toast = await findToast('Renamed feature/shelved to feature/renamed');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(opsFor('branchRename')).toEqual([
        {
          op: 'branchRename',
          args: expect.objectContaining({ from: 'feature/shelved', to: 'feature/renamed' }),
        },
        {
          op: 'branchRename',
          args: expect.objectContaining({ from: 'feature/renamed', to: 'feature/shelved' }),
        },
      ]),
    );
  });
});

/**
 * Migrated from `e2e/nav-shell.spec.ts` (Phase 82 Theme C, wave 4) — the
 * half of that file that is genuinely `ReposPanel`'s own business:
 * `useViewSections`' per-view narrowing, its escape hatch, and that the
 * selected checkout survives a view switch.
 *
 * **The other half stays in Playwright.** "The rail carries all sixteen
 * views", "each view is reachable", "Actions/Reviews are absent for a
 * repository gh could never answer for" and "standing in Actions when it
 * disappears lands you on the graph" all need the actual nav rail —
 * `AppFrame` from `@bilo-io/shell`, fed the `nav` array `app.tsx` builds —
 * which is a different (and much larger) surface than this component.
 * `clickRail`/rail navigation is replaced throughout by
 * `useUiStore.getState().setActiveView(...)` directly, same substitution as
 * the `activeView`-driven tests above.
 *
 * "The Changes filter still behaves as Phase 17 shipped it" is dropped
 * outright, not ported: it re-asserts exactly what "the Changes view hides
 * checkouts with nothing in them" and "the filter is visible while on, and
 * reversible" (above) already cover — aria-pressed, the dirty checkout
 * surviving, the clean one not, and the toggle reversing it.
 *
 * "Show all sections is the escape hatch, and it persists" is split: the
 * escape-hatch behaviour below is new coverage (a different label —
 * `filterFor`'s `dirtyOnly: false` case, "Show all sections" rather than
 * "Showing only changed checkouts" — and a different, non-dirty-only
 * mechanism), but its reload-persistence half stays in
 * `e2e/nav-shell.spec.ts`, trimmed to just that: `useUiStore` is a module
 * singleton hydrated once at import time, so a jsdom "reload" would need to
 * reset and re-import the module fresh, the same reason
 * `settings-view.bridge.test.tsx` left an identical reload claim behind.
 */
describe("ReposPanel's view-scoped section filtering (nav-shell)", () => {
  const withTag: MockFixtures = {
    ...base,
    refs: [
      ...base.refs!,
      {
        name: 'v0.1.0',
        fullName: 'refs/tags/v0.1.0',
        kind: 'tag',
        sha: 'a'.repeat(40),
        upstream: null,
        isHead: false,
        worktreePath: null,
      },
    ],
  };

  it('the Actions view narrows the sidebar to Actions and Worktrees', async () => {
    open();
    useUiStore.getState().setActiveView('actions');

    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Worktrees' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Remotes' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tags' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Reviews' })).toBeNull();

    // Unlike Changes, Actions keeps the CLEAN checkout too — having runs has
    // nothing to do with having uncommitted work.
    expect(screen.getByRole('button', { name: 'Actions for worktree main' })).toBeTruthy();
  });

  it('the view section is collapsed on arrival; Worktrees is open', async () => {
    open();
    useUiStore.getState().setActiveView('actions');

    const actionsToggle = await screen.findByRole('button', { name: /^Actions( \d+)?$/ });
    expect(actionsToggle.getAttribute('aria-expanded')).toBe('false');
    const worktreesToggle = screen.getByRole('button', { name: /^Worktrees( \d+)?$/ });
    expect(worktreesToggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('"Show all sections" is the narrowed view\'s escape hatch, and it is per-view', async () => {
    open(withTag);
    useUiStore.getState().setActiveView('actions');
    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Show all sections' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);

    expect(screen.getByRole('heading', { name: 'Local' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tags' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeTruthy();

    // Per-view: it did not also unfilter Changes.
    useUiStore.getState().setActiveView('changes');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull());
  });

  it('a view with no narrowing of its own can still be filtered by hand', async () => {
    open();
    // Graph has no `filterFor` entry at all — the `dirtyOnly: false` +
    // `filtered: false` case, labelled differently from both the Changes
    // and the Actions toggles.
    useUiStore.getState().setActiveView('graph');

    expect(await screen.findByRole('heading', { name: 'Local' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show every ref and checkout' }));

    expect(screen.queryByRole('heading', { name: 'Local' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for worktree main' })).toBeNull();
    expect(
      screen.getByRole('button', { name: /Actions for worktree feature\/x/ }),
    ).toBeTruthy();
  });

  it('switching views keeps the checkout you were looking at', async () => {
    open();
    await screen.findByRole('heading', { name: 'Worktrees' });
    useUiStore.getState().selectWorktree(FEATURE);
    expect(useUiStore.getState().selectedWorktreePath).toBe(FEATURE);

    // The rail changes what you are looking AT, never what you are looking
    // at it FOR — switching through several views must not drop the
    // selection.
    for (const view of ['files', 'actions', 'tests', 'dashboard', 'graph'] as const) {
      useUiStore.getState().setActiveView(view);
      expect(useUiStore.getState().selectedWorktreePath).toBe(FEATURE);
    }
  });
});
