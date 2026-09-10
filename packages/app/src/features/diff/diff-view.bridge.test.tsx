import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COMMIT_SHA, fixtures, PARENT_SHA } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { CommitDetail } from '../commit/commit-detail';
import { useUiStore } from '../../store/ui-store';

/**
 * Migrated from `e2e/diff-view.spec.ts` (Phase 82 Theme C, wave 2) — the
 * add/delete hunk rendering, the intraline mark, the gap expander, the
 * binary and image states and the capped-diff message. 9 of the original 12
 * tests moved here, plus one new one covering the line-number toggle's own
 * behaviour; 3 stay in Playwright, below.
 *
 * Driven through `CommitDetail` (the same `Harness`
 * `commit-detail.bridge.test.tsx` uses) rather than mounting a bare
 * `<DiffView>`: the real subject of every one of these tests is that a
 * commit's file list actually reaches the diff renderer with the right
 * hunks, which is exactly what clicking a real file row proves and a
 * hand-built `diff` prop would not.
 *
 * **The virtualised rows are real, proven rather than asserted.** `DiffView`
 * renders through `@tanstack/react-virtual`, and this file's "choosing a
 * file renders its hunks…" test only passes because of
 * `vitest-setup.ts`'s `FiringResizeObserver` (Phase 82 Theme C's harness
 * prerequisite) — the same fix that already unblocked `search-view`'s
 * results test in wave 1. No extra wiring was needed here beyond that global
 * default: `virtual-core`'s `observeElementRect` reads `entry.borderBoxSize`
 * off the callback, never `scrollRef.current.clientWidth`, so the pane
 * measures fine even though jsdom's own layout stays all zero.
 *
 * **3 of the original 12 stay in Playwright.** "Toggling side-by-side diff
 * switches rendering layout" needs `useTooNarrowForSplit`'s real
 * `el.clientWidth` — permanently `0` under jsdom, which pins every pane
 * "too narrow for split" regardless of the `FiringResizeObserver` fix above
 * (that stub only feeds `ResizeObserver` entries; this hook reads
 * `clientWidth` directly, per its own doc comment, which is *why* a
 * dedicated `e2e/diff-split.spec.ts` already exists for that measurement
 * rather than a rendered-component test). "The old line-number column…"
 * test's OWN toggle behaviour is covered below; only its "survives a
 * reload" half — the same `zustand/persist` rehydration reasoning
 * `commit-detail.bridge.test.tsx`'s header comment gives — stays with the
 * whole original test in `e2e/diff-view.spec.ts`. And "syntax highlighting
 * colours a line" is Theme D's pixel-diff territory.
 */

function Harness({ repoId }: { repoId: string }) {
  const selection = useUiStore((s) => s.graphSelection);
  const selectCommit = useUiStore((s) => s.selectCommit);
  if (!selection || selection.kind !== 'commit') return null;
  return (
    <CommitDetail repoId={repoId} sha={selection.sha} onClose={() => selectCommit(null)} />
  );
}

const open = () => {
  renderView(<Harness repoId="repo-1" />, {
    fixtures,
    uiState: { graphSelection: { kind: 'commit', sha: COMMIT_SHA } },
  });
};

const diff = () => screen.getByTestId('diff-view');
const lines = (kind: 'add' | 'del' | 'ctx') =>
  diff().querySelectorAll(`[data-line-kind="${kind}"]`);

/*
  Warm `CommitMessage`'s lazy chunk once, before any test's clock starts.

  `commit-detail.tsx` `React.lazy`-loads it to keep `react-markdown` and
  `remark-gfm` out of the entry chunk. Under vitest that dynamic import pays a
  multi-second ESM transform for both libraries on first resolve — and Phase 82
  Theme C wave 2 hit exactly that boundary: `findByTestId` with a 3s ceiling
  passed when `app:test` ran alone and failed under a real
  `moon run :typecheck :lint :test`, where every package's suite runs in
  parallel. Raising the ceiling was the first attempt; it only moves the race.

  Importing the module here resolves it into vitest's module cache, so
  `React.lazy` settles from cache rather than from a transform. The tests still
  `await` the element — that is correct, the render is genuinely async — they
  just no longer await a compiler. No assertion is weakened: the real
  `react-markdown` still renders, which is what "renders as markdown rather
  than preformatted text" is about.
*/
beforeAll(async () => {
  await import('../commit/commit-message');
});

beforeEach(() => {
  useUiStore.setState({ graphSelection: null, commitFileView: 'tree', diffShowOldGutter: false });
});

afterEach(cleanup);

describe('DiffView, assembled through the real bridge', () => {
  it('a commit shows no diff until a file is chosen', async () => {
    open();
    // `CommitDetail` lazy-loads `CommitMessage` (see its own comment), so
    // `commit-message` only appears once that dynamic import resolves.
    // `findByTestId`'s default 1000ms poll is normally comfortably inside
    // that, but this exact line — along with the same wait in
    // `commit-detail.bridge.test.tsx` — failed under a real
    // `moon run :typecheck :lint :test` gate run (Phase 82 Theme C wave 2's
    // own verification): a wall-clock race against CPU contention from a
    // concurrent suite run elsewhere on the machine, not a logic defect —
    // every failure resolved once machine load dropped, and none were about
    // this file's own (also-lazy, also-async) virtualised diff rows. A 3s
    // ceiling, matching the precedent in `screen-lock-page.test.tsx`, gives
    // the import the margin a busy CI runner needs.
    await screen.findByTestId('commit-message', {}, { timeout: 3000 });

    expect(await screen.findByText('Select a file to see what changed in it.')).toBeTruthy();
    expect(screen.queryByTestId('diff-view')).toBeNull();
  });

  it('choosing a file renders its hunks with add and delete rows', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /window\.ts/ }));

    await screen.findByTestId('diff-view');
    // Virtualised, so the rows only exist once `FiringResizeObserver` has
    // fed `@tanstack/react-virtual` a real size — see this file's own header
    // comment.
    await waitFor(() => expect(lines('add')).toHaveLength(4));
    expect(lines('del')).toHaveLength(1);
    expect(lines('ctx')).toHaveLength(3);

    // The hunk heading is structure, and renders alongside the lines.
    expect(diff().textContent).toContain('function createWindow() {');
  });

  it('the changed word inside a modified line is marked, and the rest is not', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /window\.ts/ }));
    await screen.findByTestId('diff-view');

    const added = await waitFor(() => {
      const rows = lines('add');
      if (rows.length === 0) throw new Error('no add rows yet');
      return rows[0]!;
    });
    expect(added.textContent).toContain('height: 880,');

    // Exactly one intraline span, and it covers the number rather than the line.
    const marked = added.querySelectorAll('span[data-diff-mark]');
    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toBe('880');
  });

  /**
   * Covers "the old line-number column is off by default and toggles on"'s
   * own toggle behaviour — everything except the real page reload, which
   * stays with the whole original test in `e2e/diff-view.spec.ts` (see this
   * file's own header comment).
   */
  it('the old line-number column is off by default and toggles on', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /window\.ts/ }));
    await screen.findByTestId('diff-view');

    const firstCtxRow = await waitFor(() => {
      const rows = lines('ctx');
      if (rows.length === 0) throw new Error('no ctx rows yet');
      return rows[0]!;
    });
    // One gutter: the new-file number only.
    expect(firstCtxRow.querySelectorAll('span.tabular-nums')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Show original line numbers' }));
    expect(firstCtxRow.querySelectorAll('span.tabular-nums')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Hide original line numbers' })).toBeTruthy();
  });

  it('a gap between hunks offers an expander, and expanding refetches at wider context', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /ci\.yml/ }));
    await screen.findByTestId('diff-view');

    // Hunk 1 covers new lines 1..4; hunk 2 starts at 61.
    const expander = await screen.findByRole('button', { name: 'Expand 57 hidden lines' });

    fireEvent.click(expander);

    // The wider fixture is a single merged hunk, so the gap marker is gone and
    // context the narrow diff never carried is now on screen. Checked
    // together, in one poll: the refetch's own `isLoading` tick briefly
    // unmounts `diff-view` in favour of a "Loading diff…" placeholder that
    // ALSO has no expander button, so asserting the button's absence alone
    // could pass one tick too early.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Expand \d+ hidden lines/ })).toBeNull();
      expect(screen.getByTestId('diff-view').textContent).toContain('runs-on: ubuntu-latest');
    });
  });

  it('a binary file says so instead of rendering an empty pane', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /inter\.woff2/ }));

    // Asserting the TEXT, not just that something rendered: the inspector used
    // to fall back to "No changes to show for this file" for a binary blob
    // while the working-tree pane said the right thing.
    expect((await screen.findByTestId('diff-empty')).textContent).toBe(
      'Binary file — no textual diff.',
    );
  });

  it('a binary IMAGE gets the viewer rather than the sentence', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /phase-11-packaged-app\.png/ }));

    // The bytes come from `mstudio-file://`, which does not exist under
    // jsdom either — so this asserts the viewer's chrome, which is what the
    // renderer owns: both revisions named, and the compare modes offered.
    const viewer = await screen.findByTestId('image-diff');
    expect(screen.queryByTestId('diff-empty')).toBeNull();
    expect(within(viewer).getByTestId('image-before')).toBeTruthy();
    expect(within(viewer).getByTestId('image-after')).toBeTruthy();

    fireEvent.click(within(viewer).getByRole('button', { name: 'Swipe' }));
    expect(within(viewer).getByRole('slider', { name: 'Swipe position' })).toBeTruthy();

    fireEvent.click(within(viewer).getByRole('button', { name: 'Onion' }));
    expect(within(viewer).getByRole('slider', { name: 'New revision opacity' })).toBeTruthy();
  });

  it('a capped diff reports how many lines it withheld', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /pnpm-lock\.yaml/ }));

    await waitFor(() =>
      expect(diff().textContent).toContain('16,412 more lines not shown'),
    );
  });

  it('clicking the open file again closes its diff', async () => {
    open();
    const fileButton = await screen.findByRole('button', { name: /window\.ts/ });
    fireEvent.click(fileButton);
    await screen.findByTestId('diff-view');

    fireEvent.click(fileButton);
    expect(await screen.findByText('Select a file to see what changed in it.')).toBeTruthy();
  });

  it('switching commits clears the selected file rather than carrying it over', async () => {
    // The path may not even exist in the next commit, which would leave a
    // permanently empty diff pane with no clue as to why.
    open();
    fireEvent.click(await screen.findByRole('button', { name: /window\.ts/ }));
    await screen.findByTestId('diff-view');

    fireEvent.click(screen.getByRole('button', { name: `Show commit ${PARENT_SHA}` }));

    expect(await screen.findByText('Select a file to see what changed in it.')).toBeTruthy();
    expect(screen.queryByTestId('diff-view')).toBeNull();
  });
});
