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
