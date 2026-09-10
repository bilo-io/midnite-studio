import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  COMMIT_SHA,
  fixtures,
  LINKED_ABBREV,
  LINKED_SHA,
  ORPHAN_ABBREV,
  PARENT_SHA,
} from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useBrowserStore } from '../../store/browser-store';
import { useUiStore } from '../../store/ui-store';
import { CommitDetail } from './commit-detail';

/**
 * Migrated from `e2e/commit-inspector.spec.ts` (Phase 82 Theme C, wave 2) —
 * the rendered message (linkification, trailers), the header (sha, copy,
 * parent navigation) and the file tree/list views. 15 of the original 19
 * tests moved here (plus one new one covering what the reload test's own
 * non-reload half already exercised); 4 stay in Playwright, listed at the
 * bottom of this comment.
 *
 * `CommitDetail` reads its `sha` from a prop, not from a graph row click — the
 * real app supplies that prop from `useUiStore`'s `graphSelection`
 * (`graph-view.tsx`), so `Harness` below reproduces exactly that one line of
 * wiring rather than mounting the whole graph to get a click target. This
 * also means `followSha`'s navigation (parent/linked-sha clicks, which call
 * `selectCommit`) drives the SAME store this harness reads, so a click really
 * does re-render the panel onto the new commit — not a fake.
 *
 * **4 of the original 19 stay in Playwright.** Two need a real page reload to
 * prove `zustand/persist` rehydration (`useUiStore` is a module singleton
 * hydrated once at import time) — "the metadata collapses to its header, and
 * the choice survives a reload" and "the tree ⇄ list choice survives a
 * reload" — the same reasoning `settings-view.bridge.test.tsx`'s own comment
 * gives for its one reload straggler. The first of those two also measures a
 * real `boundingBox` height (the diff pane growing once the metadata closes),
 * which jsdom cannot honestly produce either; this file's own "hiding the
 * metadata…" test below covers everything about that interaction a browser
 * is not required for. "The file list and the diff can be resized against
 * each other" is a real pointer drag over a real `getBoundingClientRect`. And
 * the inspector screenshot is Theme D's territory.
 */

/** A GitHub remote, so `#123` has somewhere to point. */
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const withRemote: MockFixtures = { ...fixtures, remotes: REMOTES };

/**
 * The one line of wiring `graph-view.tsx` does between `useUiStore`'s
 * `graphSelection` and `<CommitDetail>` — reproduced here rather than
 * mounting `GraphView` itself, so `followSha`'s `selectCommit` calls (parent
 * nav, a linkified sha, an unresolvable one) really do move the panel onto
 * another commit.
 */
function Harness({ repoId }: { repoId: string }) {
  const selection = useUiStore((s) => s.graphSelection);
  const selectCommit = useUiStore((s) => s.selectCommit);
  if (!selection || selection.kind !== 'commit') return null;
  return (
    <CommitDetail repoId={repoId} sha={selection.sha} onClose={() => selectCommit(null)} />
  );
}

const open = (fx: MockFixtures = withRemote) => {
  renderView(<Harness repoId="repo-1" />, {
    fixtures: fx,
    uiState: { graphSelection: { kind: 'commit', sha: COMMIT_SHA } },
  });
};

const message = () => screen.getByTestId('commit-message');
const files = () => screen.getByTestId('commit-files');
const identities = () => screen.queryByTestId('commit-identities');
/** A directory row, matched exactly so a nested file's path cannot satisfy it. */
const dir = (path: string) => within(files()).getByRole('button', { name: path });

beforeEach(() => {
  useUiStore.setState({ graphSelection: null, commitFileView: 'tree', commitMetaOpen: true });
  useBrowserStore.setState({ tabs: [], activeTabId: null });
});

afterEach(cleanup);

describe('CommitDetail, assembled through the real bridge', () => {
  // --- Theme A: the rendered message --------------------------------------

  it('the message renders as markdown rather than preformatted text', async () => {
    open();

    const code = await waitFor(() => message().querySelector('pre code'));
    expect(code?.textContent).toContain('const sha = 7c521fe;');
  });

  it('a sha inside a code fence is not turned into a control', async () => {
    open();
    await screen.findByTestId('commit-message');

    // `7c521fe` appears ONLY inside the fence in this fixture, so any button
    // bearing it would have come from linkifying code.
    expect(within(message()).queryByRole('button', { name: '7c521fe' })).toBeNull();
  });

  it('an all-letter hex word in prose stays prose', async () => {
    open();
    await screen.findByTestId('commit-message');

    expect(message().textContent).toContain('The deadbeef path is unaffected.');
    expect(within(message()).queryByRole('button', { name: 'deadbeef' })).toBeNull();
  });

  it('a URL in the message opens in a browser tab rather than navigating the window', async () => {
    open();

    fireEvent.click(await screen.findByRole('link', { name: 'https://example.com/notes' }));

    // The browser store gained a tab and was told to reveal itself — the
    // renderer decision `openInMidnite` makes — rather than the link's
    // `preventDefault`ed real navigation ever landing, and nothing went to
    // the system browser.
    await waitFor(() => expect(useBrowserStore.getState().tabs).toHaveLength(1));
    expect(useBrowserStore.getState().tabs[0]?.url).toBe('https://example.com/notes');
    expect(useUiStore.getState().browserOpen).toBe(true);
  });

  it('#123 resolves against the forge remote', async () => {
    open();

    fireEvent.click(await screen.findByRole('link', { name: '#123' }));

    await waitFor(() => expect(useBrowserStore.getState().tabs).toHaveLength(1));
    expect(useBrowserStore.getState().tabs[0]?.url).toBe(
      'https://github.com/bilo-io/midnite-studio/issues/123',
    );
  });

  it('#123 stays plain text in a repo with no forge remote', async () => {
    // The phase doc's degrade-not-error requirement: inventing a link that
    // 404s is worse than rendering the text the author wrote.
    open({ ...fixtures, remotes: [] });
    await screen.findByTestId('commit-message');

    expect(message().textContent).toContain('#123');
    expect(within(message()).queryByRole('link', { name: '#123' })).toBeNull();
  });

  it('the trailer block renders as metadata, with its email linkified', async () => {
    open();

    const trailers = await screen.findByTestId('commit-trailers');
    expect(trailers.textContent).toContain('Co-Authored-By');

    // Split off the body, not left in it.
    expect(message().querySelector('p')?.textContent ?? '').not.toContain('Co-Authored-By');

    fireEvent.click(within(trailers).getByRole('link', { name: 'noreply@anthropic.com' }));
    // Not http(s), so it goes straight to the system-open path rather than a
    // browser tab — the bridge's own `shell.openExternal` recording.
    const clipboardWindow = window as unknown as { __mstudioExternalUrls: string[] };
    await waitFor(() => expect(clipboardWindow.__mstudioExternalUrls).toEqual(['mailto:noreply@anthropic.com']));
  });

  // --- Theme B: the header --------------------------------------------------

  it('the header shows the truncated sha hyperlink and copies full sha through the bridge', async () => {
    open();

    const shaLink = await screen.findByRole('button', {
      name: `Open commit in tab (${COMMIT_SHA})`,
    });
    expect(shaLink.textContent).toContain(`${COMMIT_SHA.slice(0, 16)}…`);

    fireEvent.click(screen.getByRole('button', { name: 'Copy the full sha' }));

    const clipboard = window as unknown as { __mstudioClipboard: string[] };
    // The full 40 characters, not the abbreviation the header shows.
    await waitFor(() => expect(clipboard.__mstudioClipboard).toEqual([COMMIT_SHA]));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  /**
   * Covers what "the metadata collapses to its header, and the choice
   * survives a reload" tests about the toggle ITSELF — everything except the
   * real page reload and the real `boundingBox` height comparison, both of
   * which stay in `e2e/commit-inspector.spec.ts` (see this file's own header
   * comment).
   */
  it('hiding the metadata keeps the sha, copy button and file pane, and hides the message', async () => {
    open();
    await screen.findByTestId('commit-message');

    // Open by default: the message and the identities are what the inspector
    // is for.
    expect(identities()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hide the commit details' }));

    // The message and the parents go; the sha, the copy button and the
    // tree/list toggle stay, because they are the accordion's own header row.
    expect(identities()).toBeNull();
    expect(screen.queryByTestId('commit-message')).toBeNull();
    expect(
      screen.getByRole('button', { name: `Open commit in tab (${COMMIT_SHA})` }).textContent,
    ).toContain(`${COMMIT_SHA.slice(0, 16)}…`);
    expect(screen.getByRole('button', { name: 'Copy the full sha' })).toBeTruthy();
    expect(files()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show the commit details' }));
    expect(await screen.findByTestId('commit-identities')).toBeTruthy();
  });

  it('the committer row appears only when it differs from the author', async () => {
    open();

    const initial = await screen.findByTestId('commit-identities');
    expect(initial.textContent).toContain('committer');
    expect(initial.textContent).toContain('GitHub');

    // The root commit has the same identity on both sides.
    fireEvent.click(screen.getByRole('button', { name: `Show commit ${PARENT_SHA}` }));
    await screen.findByText('chore: initial import');
    expect(screen.getByTestId('commit-identities').textContent).not.toContain('committer');
  });

  it('a parent sha navigates the panel, and a root commit says it has none', async () => {
    open();

    fireEvent.click(await screen.findByRole('button', { name: `Show commit ${PARENT_SHA}` }));

    expect(
      await screen.findByRole('button', { name: `Open commit in tab (${PARENT_SHA})` }),
    ).toHaveProperty('textContent', expect.stringContaining(`${PARENT_SHA.slice(0, 16)}…`));
    expect(await screen.findByText('Root commit — no parents.')).toBeTruthy();
  });

  it('a linkified sha selects a commit that is not the one first shown', async () => {
    open();

    fireEvent.click(await screen.findByRole('button', { name: LINKED_ABBREV }));

    expect(
      await screen.findByRole('button', { name: `Open commit in tab (${LINKED_SHA})` }),
    ).toHaveProperty('textContent', expect.stringContaining(`${LINKED_SHA.slice(0, 16)}…`));
    expect(await screen.findByText('fix(graph): the linkified target')).toBeTruthy();
  });

  it('a sha that resolves to nothing renders the not-found state', async () => {
    const orphaned: MockFixtures = {
      ...withRemote,
      commitDetails: {
        ...fixtures.commitDetails,
        [COMMIT_SHA]: {
          ...(fixtures.commitDetails[COMMIT_SHA] as Record<string, unknown>),
          body: `feat: a commit\n\nReverts ${ORPHAN_ABBREV} which we no longer have.`,
        },
      },
    };
    open(orphaned);

    fireEvent.click(await screen.findByRole('button', { name: ORPHAN_ABBREV }));

    expect(await screen.findByText('Commit not found')).toBeTruthy();
    expect(await screen.findByText(/is not in this repository/)).toBeTruthy();
  });

  // --- Theme B: the file views ----------------------------------------------

  it('the tree groups files by folder and collapses single-child chains', async () => {
    open();
    await screen.findByTestId('commit-message');

    // `packages/desktop/src/main` is four nested directories holding one
    // file, and it must read as one row rather than four indents of nothing.
    expect(dir('packages/desktop/src/main')).toBeTruthy();
    expect(dir('.github/workflows')).toBeTruthy();
  });

  it('collapsing a directory hides its files but keeps its totals', async () => {
    open();
    await screen.findByTestId('commit-message');

    const main = dir('packages/desktop/src/main');
    const windowTs = () =>
      within(files()).queryByRole('button', {
        name: 'packages/desktop/src/main/window.ts',
      });

    expect(main.textContent).toContain('+4');
    expect(windowTs()).toBeTruthy();

    fireEvent.click(main);

    expect(windowTs()).toBeNull();
    // Still says how much is inside — collapsing must not hide the number
    // you collapsed in order to compare.
    expect(dir('packages/desktop/src/main').textContent).toContain('+4');
  });

  it('list view orders by change size, biggest first', async () => {
    open();
    await screen.findByTestId('commit-message');

    fireEvent.click(screen.getByRole('button', { name: 'List the files by how much changed' }));

    const rows = within(files()).getAllByRole('button');
    // 4000 > 5 > 2 > 0 — nothing like the alphabetical order of the tree.
    expect(rows[0]?.getAttribute('aria-label')).toBe('pnpm-lock.yaml');
    expect(rows[1]?.getAttribute('aria-label')).toBe('packages/desktop/src/main/window.ts');
    expect(rows[3]?.getAttribute('aria-label')).toBe('docs/screenshots/phase-11-packaged-app.png');
  });
});
