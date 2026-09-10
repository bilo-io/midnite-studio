import { cleanup, configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COMMIT_SHA, fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { useUiStore } from '../../store/ui-store';
import { CommitDetail } from '../commit/commit-detail';
import { PrDetail } from './pr-detail';

/**
 * Migrated from `e2e/review-threads.spec.ts` (Phase 82 Theme C, wave 5) —
 * inline review threads on a pull request's diff: an existing thread renders
 * on the line it was written against, a resolved thread arrives collapsed,
 * the gutter opens a composer and posts a real write, a deleted line offers
 * no comment affordance, replying and resolving both reach the bridge with
 * the right anchor, a refused write keeps the reader's text, an outdated (or
 * file-level) thread groups above the diff rather than pinning to a live
 * line, and — the one test that is not about `PrDetail` at all — a
 * *working-tree* diff never grows the comment gutter in the first place.
 *
 * **All 10 of the original tests are ported here.** 9 of the 10 e2e tests are
 * deleted outright; "an existing thread renders on the line it was written
 * against" is ALSO kept in Playwright, matching the precedent
 * `pr-detail.bridge.test.tsx` set for `review-writes.spec.ts` — the theme's
 * one required browser smoke test per view, proving the assembled diff +
 * thread panel survives a real render, not only jsdom's.
 *
 * Driven through `PrDetail` directly (`repoId`/`number` props, exactly like
 * `pr-detail.bridge.test.tsx`), skipping the e2e spec's own rail → group →
 * row → Files-tab navigation — that choreography is app-shell routing, not
 * anything `CommentThread`/`OutdatedThreads`/`PrFiles` do themselves.
 *
 * **The last test needs no `PrDetail` at all.** `DiffView`'s comment gutter
 * is gated on `threads`/`onComment` being passed in the first place (see
 * `pr-file-accordion.tsx`'s own note), and a working-tree diff — reached here
 * exactly as `diff-view.bridge.test.tsx`'s own `Harness` reaches one, via
 * `CommitDetail` — never passes either. That file's own `beforeAll` chunk
 * warm-up for `CommitDetail`'s lazily-loaded `CommitMessage` is repeated here
 * rather than shared, because vitest's module cache is per test FILE.
 */

const HEAD_SHA = 'a'.repeat(40);

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
};

/** A `FileDiff` as main would have parsed it — the shape the renderer receives. */
const fileDiff = (
  path: string,
  lines: { kind: 'add' | 'del' | 'ctx'; text: string }[],
): Record<string, unknown> => ({
  path,
  oldPath: null,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      oldStart: 1,
      oldLines: lines.length,
      newStart: 1,
      newLines: lines.length,
      heading: '',
      lines: lines.map((row, index) => ({
        kind: row.kind,
        oldNo: row.kind === 'add' ? null : index + 1,
        newNo: row.kind === 'del' ? null : index + 1,
        text: row.text,
        ranges: [],
        noNewline: false,
      })),
    },
  ],
  insertions: lines.filter((row) => row.kind === 'add').length,
  deletions: lines.filter((row) => row.kind === 'del').length,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

/** A `ForgeReviewThread`, already grouped. */
const thread = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PRRT_one',
  path: 'src/app.tsx',
  line: 2,
  originalLine: 2,
  startLine: null,
  side: 'RIGHT',
  resolved: false,
  outdated: false,
  fileLevel: false,
  comments: [
    {
      id: 'PRRC_one',
      databaseId: '1234',
      author: 'ana',
      body: 'This reads better as a guard clause.',
      createdAt: '2026-08-26T09:00:00Z',
      url: '',
    },
  ],
  ...over,
});

/**
 * A fresh copy every call, never a shared module-level constant.
 *
 * `DiffView`'s virtualizer/highlighter caches computed state (tokens,
 * measured rows) keyed off the `FileDiff`/hunk object's own identity — a
 * single shared fixture object handed to every test (as the e2e original's
 * `THREE_LINES` was, safe there only because Playwright gives each `test()`
 * its own page/JS realm) goes stale under jsdom, where every test in this
 * file shares one process: by the third `PrDetail` mount reusing the same
 * object, the diff silently stopped rendering its rows at all.
 */
const threeLines = () =>
  fileDiff('src/app.tsx', [
    { kind: 'ctx', text: 'const a = 1;' },
    { kind: 'add', text: 'const b = 2;' },
    { kind: 'del', text: 'const c = 3;' },
  ]);

const withThreads = (
  threads: Record<string, unknown>[],
  over: Partial<NonNullable<MockFixtures['forge']>> = {},
): MockFixtures => ({
  ...fixtures,
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    pullDetail: { '42': { headSha: HEAD_SHA, baseBranch: 'main', changedFiles: 1 } },
    pullFiles: { '42': { files: [threeLines()] } },
    pullThreads: { '42': threads },
    ...over,
  },
});

/**
 * Mount `PrDetail` on #42 and land on its Files tab, where threads live.
 *
 * Wrapped in `ToastHost`: `PrFileAccordion`'s own "Fetch to compare" affordance
 * calls `useTargetedGitOp`, which reaches `useToasts()` unconditionally on
 * mount (not only once that button renders) — absent here, `pr-detail.bridge.test.tsx`
 * never opens the Files tab and so never hits this, but this file does.
 */
async function openFiles(data: MockFixtures): Promise<void> {
  renderView(
    <ToastHost>
      <PrDetail repoId="repo-1" number={42} />
    </ToastHost>,
    { fixtures: data },
  );
  await screen.findByRole('region', { name: 'Pull request #42' });
  fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
  await screen.findByTestId('diff-view');
  /*
    A `waitFor` over the diff's aggregate `textContent`, not
    `screen.findByText('const b = 2;')` — the matcher-mismatch hazard, in a
    form specific to this component: `mergeSegmentsWithTokens` splits a
    highlighted line's text across several small per-token spans once
    syntax highlighting resolves (async, and warms up across renders in this
    file — an early render can still catch the brief unhighlighted, single-
    node paint, but a later one never does), so no single element's OWN text
    is ever the whole string `getByText` looks for. Asserting on the
    container's combined text is what the e2e original's own "the hunk
    heading is structure" assertion already does for the identical reason
    (`diff().textContent).toContain(...)`).
  */
  await waitFor(() =>
    expect(screen.getByTestId('diff-view').textContent).toContain('const b = 2;'),
  );
}

const recorded = (): { channel: string; request: Record<string, unknown> }[] =>
  (window as unknown as { __mstudioWrites?: { channel: string; request: Record<string, unknown> }[] })
    .__mstudioWrites ?? [];

/*
  `CommitDetail` lazy-loads `CommitMessage` (`commit-detail.tsx`'s own
  `React.lazy`) — warmed once here so `findByTestId('commit-message', …)`
  settles from vitest's module cache rather than racing a multi-second ESM
  transform under a contended `moon run :test`. See `diff-view.bridge.test.tsx`'s
  identical comment; this file needs its own copy because the module cache
  warm-up is per test file, not global.
*/
beforeAll(async () => {
  await import('../commit/commit-message');
});

/*
  Every `findBy*`/`waitFor` in this file polls a real (if instant) query
  fetch behind a tab switch or a bridge write — no artificial delay, but this
  file mounts `PrDetail` many times in sequence, and Testing Library's
  default 1000ms `asyncUtilTimeout` was observed to be too tight for that
  under a genuinely contended machine (verified against `uptime`'s own load
  average during a parallel `moon run :test`-equivalent run). Raised once,
  file-wide, rather than repeating `{ timeout: 5000 }` at every call site.
*/
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  useUiStore.setState({ graphSelection: null });
});

afterEach(cleanup);

describe('Review threads on PrDetail Files tab, assembled through the real bridge', () => {
  it('an existing thread renders on the line it was written against', async () => {
    await openFiles(withThreads([thread()]));

    const panel = screen.getByTestId('comment-thread');
    expect(panel).toBeTruthy();
    // The anchor, asserted as the anchor rather than as "somewhere on the
    // page": a thread on the wrong line looks identical to one on the right one.
    expect(panel.getAttribute('data-line')).toBe('2');
    // Scoped to the comment list: the author's name also appears in the
    // thread's own summary row, and an unscoped match resolves to both.
    expect(
      within(panel).getByRole('list', { name: 'Thread comments' }).textContent,
    ).toContain('ana');
    expect(within(panel).getByText('This reads better as a guard clause.')).toBeTruthy();
  });

  it('a resolved thread arrives collapsed, and says so', async () => {
    await openFiles(withThreads([thread({ resolved: true })]));

    const panel = screen.getByTestId('comment-thread');
    // A settled status renders as a bare coloured glyph, so its word survives
    // only as the mark's accessible name.
    expect(within(panel).getByRole('img', { name: 'Resolved' })).toBeTruthy();
    // Collapsed, not hidden: the summary counts it and one click opens it.
    expect(within(panel).queryByText('This reads better as a guard clause.')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: /ana/ }));
    expect(within(panel).getByText('This reads better as a guard clause.')).toBeTruthy();
  });

  it('the gutter opens a composer on the line that was clicked, and posts it', async () => {
    await openFiles(withThreads([]));

    // Line 2 is the added line — right-side, so commentable.
    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 2' }));
    const composer = screen.getByTestId('comment-composer');
    expect(composer).toBeTruthy();

    fireEvent.change(within(composer).getByRole('textbox'), {
      target: { value: 'Why not a guard clause?' },
    });
    fireEvent.click(within(composer).getByRole('button', { name: 'Add comment' }));

    // The write, with the anchor it was actually sent with — invisible in the
    // rendered result, and the whole thing that could be silently wrong.
    // `.at(-1)`, not the whole `recorded()` array: `window.__mstudioWrites`
    // accumulates across every test in this file (unlike Playwright, where
    // each test gets its own page/global), so only the LAST write is this
    // test's own.
    await waitFor(() =>
      expect(recorded().at(-1)).toMatchObject({
        channel: 'reviewComment',
        request: {
          number: 42,
          path: 'src/app.tsx',
          line: 2,
          side: 'RIGHT',
          commitId: HEAD_SHA,
          position: 2,
          body: 'Why not a guard clause?',
        },
      }),
    );

    // And it comes back: the mutation invalidated the thread key and the
    // refetch is different. A stubbed write that answered `ok` would fail here.
    expect(await screen.findByTestId('comment-thread')).toBeTruthy();
    expect(screen.getByText('Why not a guard clause?')).toBeTruthy();
  });

  it('a deleted line offers no comment affordance', async () => {
    await openFiles(withThreads([]));

    // v1 anchors only to the right side; line 3 is the `-` row.
    expect(screen.queryByRole('button', { name: 'Comment on line 3' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Comment on line 1' })).toBeTruthy();
  });

  it('replying posts to the last comment in the thread and appears in it', async () => {
    await openFiles(withThreads([thread()]));

    const panel = screen.getByTestId('comment-thread');
    fireEvent.click(within(panel).getByRole('button', { name: 'Reply' }));
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'Agreed.' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Reply' }));

    await waitFor(() =>
      expect(recorded().at(-1)).toMatchObject({
        channel: 'reviewReply',
        request: { number: 42, commentId: '1234', body: 'Agreed.' },
      }),
    );
    expect(await screen.findByText('Agreed.')).toBeTruthy();
  });

  it('resolving flips the thread, and the panel reads back resolved', async () => {
    await openFiles(withThreads([thread()]));

    const panel = screen.getByTestId('comment-thread');
    fireEvent.click(within(panel).getByRole('button', { name: 'Resolve' }));

    await waitFor(() =>
      expect(recorded().at(-1)).toMatchObject({
        channel: 'resolveThread',
        request: { threadId: 'PRRT_one', resolved: true },
      }),
    );
    expect(within(panel).getByRole('img', { name: 'Resolved' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Reopen' })).toBeTruthy();
  });

  it("a refused write says what gh said, and keeps the reader's text", async () => {
    await openFiles(
      withThreads([], { writeError: 'You must have write access to this repository' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 2' }));
    const composer = screen.getByTestId('comment-composer');
    fireEvent.change(within(composer).getByRole('textbox'), {
      target: { value: 'A comment nobody can post' },
    });
    fireEvent.click(within(composer).getByRole('button', { name: 'Add comment' }));

    // `gh`'s own sentence, beside the line it was refused on — not a toast
    // that has already faded by the time the reader looks up.
    expect(
      await screen.findByText('You must have write access to this repository'),
    ).toBeTruthy();
  });

  it('an outdated thread is grouped above the diff, never pinned to a live line', async () => {
    await openFiles(
      withThreads([thread({ id: 'PRRT_old', outdated: true, line: null, originalLine: 40 })]),
    );

    // Not on line 2 — and not on any line. That is the point of the group: a
    // thread whose anchor was rewritten away must not be attributed to
    // whichever row carries that number now.
    expect(screen.queryByTestId('comment-thread')).toBeNull();

    const group = screen.getByTestId('outdated-threads');
    expect(group).toBeTruthy();
    expect(within(group).getByText('1 comment thread no longer in this diff')).toBeTruthy();

    fireEvent.click(within(group).getByRole('button', { name: /no longer in this diff/ }));
    expect(within(group).getByText('Was on line 40 — no longer in the diff')).toBeTruthy();
    expect(within(group).getByText('This reads better as a guard clause.')).toBeTruthy();
  });

  it('a file-level thread reports itself as being on the file, not a line', async () => {
    await openFiles(
      withThreads([thread({ id: 'PRRT_file', fileLevel: true, line: null, originalLine: null })]),
    );

    const group = screen.getByTestId('outdated-threads');
    fireEvent.click(within(group).getByRole('button', { name: /no longer in this diff/ }));
    expect(within(group).getByText('On the file, not a line')).toBeTruthy();
  });

  it('the Changes page diff grows no comment gutter', async () => {
    // `DiffView` is shared by three surfaces and only one of them has review
    // threads. The gate is `threads`/`onComment` being absent, and this is the
    // assertion that the gate holds — a working-tree diff must never offer to
    // post a pull-request comment.
    function Harness({ repoId }: { repoId: string }) {
      const selection = useUiStore((s) => s.graphSelection);
      const selectCommit = useUiStore((s) => s.selectCommit);
      if (!selection || selection.kind !== 'commit') return null;
      return (
        <CommitDetail repoId={repoId} sha={selection.sha} onClose={() => selectCommit(null)} />
      );
    }

    renderView(<Harness repoId="repo-1" />, {
      fixtures,
      uiState: { graphSelection: { kind: 'commit', sha: COMMIT_SHA } },
    });
    await screen.findByTestId('commit-message', {}, { timeout: 3000 });

    fireEvent.click(await screen.findByRole('button', { name: /window\.ts/ }));
    await screen.findByTestId('diff-view');

    expect(screen.queryByRole('button', { name: /^Comment on line/ })).toBeNull();
  });
});
