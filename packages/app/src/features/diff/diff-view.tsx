import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type FileDiff,
  type ForgeReviewThread,
  type SplitDiffRow,
} from '@midnite/git-shared';

import { useTheme } from '@bilo-io/ui/theme';
import { useRef } from 'react';

import { useUiStore } from '../../store/ui-store';

import { type ThreadsByLine } from './comment-anchors';
import { describeEmptyDiff } from './describe-empty';
import { DiffCell } from './diff-cell';
import { DiffToolbar } from './diff-toolbar';
import {

  canSplit,
  nextContext,
  toDiffRows,
  toSplitRows,
  withCommentRows,
  type DiffRow,
} from './diff-rows';

import { ImageDiff } from './image-diff';
import type { ImageDiffSources } from './image-sources';





/**
 * The one diff renderer. Both the working-tree pane and the commit inspector
 * mount this, so a change to how a deletion looks lands in both places at once.
 *
 * Colour: the row carries a low-alpha tint and the *gutter bar* carries the
 * saturated colour. A fully-saturated row background is what makes most diff
 * views shout — at 10% the tint reads as a state, and the 2px bar is what the
 * eye actually catches when scanning. Intraline spans get a second, stronger
 * tint on top, which is legible precisely because the base is quiet.
 *
 * Rows are virtualised: a capped diff is still 4000 lines, and mounting 4000
 * DOM nodes to show 40 costs a visible beat on every file click.
 */

const ROW_HEIGHT = 18;

/**
 * First-guess heights for the two variable rows.
 *
 * Only ever a guess: the virtualizer measures every rendered row (see
 * `measureElement` below), so these decide the scrollbar's *initial* length and
 * nothing about layout. They are set near the real thing anyway, because a wild
 * estimate makes the scrollbar jump as rows come into view.
 */
const THREAD_ESTIMATE = 96;
const COMPOSER_ESTIMATE = 132;

export function DiffView({
  diff,
  isLoading = false,
  onExpandContext,
  emptyMessage,
  inline = false,
  threads,
  leftThreads,
  onComment,
  renderThread,
  composer = null,
  images = null,
}: {

  diff: FileDiff | undefined;
  isLoading?: boolean;
  /**
   * Ask for a wider `-U`. Expansion is a refetch, not a client-side reveal:
   * git only ever emits the context it was asked for.
   */
  onExpandContext?: (context: number) => void;
  emptyMessage?: string | null;
  /**
   * Render into the flow of a taller page instead of owning a pane.
   *
   * Used by the multi-file accordion, where a dozen diffs share one scroller.
   * Two things change and both have to: the box stops claiming `h-full`, and
   * the virtualizer is dropped. A virtualizer needs a scroll element to
   * measure against, and inside an accordion its scroller is the PAGE — so it
   * would either render three rows and stop, or fight the outer scroll. The
   * row count it would have saved is already bounded by `DIFF_LINE_CAP`,
   * which is what makes plain flow affordable here.
   *
   * The toolbar goes too: `+n / −m` and the expander belong to the accordion's
   * own header, and a dozen stacked toolbars is a dozen rows of chrome.
   */
  inline?: boolean;

  /*
    ─── Review comments (Phase 20 Theme E) ──────────────────────────────────

    Opt-in, and the gate is `threads` / `onComment` being present at all. This
    is one component shared by the Reviews page, the Changes page and the Graph
    page's commit inspector; only a pull request's diff has review threads, so a
    working-tree diff must not grow a comment gutter by accident. With both
    absent, not one extra element renders and every row measures at
    `ROW_HEIGHT` — byte-for-byte today's output.

    The two *content* props exist so this component knows nothing about the
    forge. `features/diff` sits below `features/reviews`, and importing a thread
    panel from there would invert that; instead Reviews hands the nodes down and
    this file decides only where they sit in the row order.
  */
  threads?: ThreadsByLine;
  leftThreads?: ThreadsByLine;
  /** Enables the per-line gutter affordance. Called with the line. */
  onComment?: (line: number) => void;
  /** The panel for the threads at one line. */
  renderThread?: (threads: readonly ForgeReviewThread[], line: number) => React.ReactNode;
  /** The open composer, if any, and the line it belongs to. */
  composer?: { line: number; node: React.ReactNode } | null;

  /**
   * Where to find the file's bytes on each side, when it is an image.
   *
   * Passed in rather than derived here for the same reason the review nodes are:
   * a URL needs the repo id and the revision pair, and which pair is right is
   * the CALLER's question — the commit inspector diffs against a parent, the
   * Changes pane against the index. `imageDiffSources` answers it and returns
   * `null` for everything that is not a binary image, so a caller wires it
   * unconditionally and this branch simply never fires for text.
   */
  images?: ImageDiffSources | null;
}) {
  const showOldGutter = useUiStore((s) => s.diffShowOldGutter);
  const diffLayoutPref = useUiStore((s) => s.diffLayout);


  const scrollRef = useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();
  const dark = resolved === 'dark';

  const effectiveLayout = diff && canSplit(diff) ? diffLayoutPref : 'unified';
  const isSplit = effectiveLayout === 'split';

  const unifiedRows = withCommentRows(
    diff ? toDiffRows(diff) : [],
    threads,
    composer?.line ?? null,
    leftThreads,
  );

  const splitRows = diff && isSplit ? toSplitRows(diff) : [];
  const rows = isSplit ? splitRows : unifiedRows;

  const virtualizer = useVirtualizer({
    count: inline ? 0 : rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row && 'kind' in row && row.kind === 'thread') return THREAD_ESTIMATE;
      if (row && 'kind' in row && row.kind === 'composer') return COMPOSER_ESTIMATE;
      return ROW_HEIGHT;
    },
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading diff…</p>;
  }

  if (!diff || rows.length === 0) {
    if (images && (images.before || images.after)) {
      return <ImageDiff sources={images} inline={inline} />;
    }
    return (
      <p className="p-3 text-xs text-muted-foreground" data-testid="diff-empty">
        {emptyMessage ?? (diff ? describeEmptyDiff(diff) : 'No changes to show for this file.')}
      </p>
    );
  }

  if (inline) {
    return (
      <InlineDiffBody
        diff={diff}
        rows={rows}
        showOldGutter={showOldGutter}
        dark={dark}
        onExpandContext={onExpandContext}
        onComment={onComment}
        renderThread={renderThread}
        composer={composer}
      />
    );
  }


  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="diff-view">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <DiffToolbar diff={diff} onExpandContext={onExpandContext} />
      </div>


      {diff.combined ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-3 py-1.5 text-[11px] text-muted-foreground">
          This file is unmerged. git shows a combined diff against every parent —
          the content below includes conflict markers, and the original line
          numbers are the first parent&rsquo;s.
        </p>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative w-full font-mono text-[11px] leading-[18px]"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const review = 'kind' in row && (row.kind === 'thread' || row.kind === 'composer');
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className={`absolute left-0 top-0 ${review ? 'w-full' : 'flex w-full'}`}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {row.kind === 'hunk' ? (
                  <HunkHeader row={row} onExpand={onExpandContext} context={diff.contextLines} />
                ) : row.kind === 'thread' ? (
                  renderThread?.(row.threads, row.line)
                ) : row.kind === 'composer' ? (
                  composer?.node
                ) : row.kind === 'split-line' ? (
                  <div className="flex w-full divide-x divide-border">
                    <div className="w-1/2 min-w-0">
                      <DiffCell
                        cell={row.left}
                        side="left"
                        showGutter={showOldGutter}
                        path={diff.path}
                        dark={dark}
                      />
                    </div>
                    <div className="w-1/2 min-w-0">
                      <DiffCell
                        cell={row.right}
                        side="right"
                        showGutter
                        path={diff.path}
                        dark={dark}
                        onComment={onComment}
                      />
                    </div>
                  </div>
                ) : (
                  <DiffCell
                    cell={{ line: row.line, type: row.line.kind }}
                    side="right"
                    showGutter={showOldGutter}
                    path={diff.path}
                    dark={dark}
                    onComment={onComment}
                  />
                )}
              </div>
            );
          })}
        </div>

        {diff.truncated ? (
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            {diff.droppedLines.toLocaleString()} more lines not shown — this diff was capped to keep
            the panel responsive.
          </p>
        ) : null}
      </div>
    </div>
  );

}

/**
 * The `@@` separator, rendered as a quiet rule rather than a coloured line.
 *
 * It is structure, not content: making it primary-coloured (as the old pane did)
 * gives the loudest treatment in the view to the one row carrying no code.
 */
function HunkHeader({
  row,
  context,
  onExpand,
}: {
  row: Extract<DiffRow, { kind: 'hunk' }>;
  context: number;
  onExpand?: (context: number) => void;
}) {
  const expandable = onExpand !== undefined && row.gap !== null && row.gap > 0;

  return (
    <div className="flex w-full items-center gap-2 bg-muted/30 px-2 text-[10px] text-muted-foreground">
      {expandable ? (
        <button
          type="button"
          onClick={() => onExpand(nextContext(context))}
          className="shrink-0 rounded px-1 hover:bg-accent hover:text-foreground"
          aria-label={`Expand ${row.gap} hidden lines`}
        >
          ⋯ {row.gap} hidden
        </button>
      ) : null}
      <span className="truncate italic opacity-70">{row.heading}</span>
    </div>
  );
}

function InlineDiffBody({
  diff,
  rows,
  showOldGutter,
  dark,
  onExpandContext,
  onComment,
  renderThread,
  composer,
}: {
  diff: FileDiff;
  rows: readonly (DiffRow | SplitDiffRow)[];
  showOldGutter: boolean;
  dark: boolean;
  onExpandContext?: (context: number) => void;
  onComment?: (line: number) => void;
  renderThread?: (threads: readonly ForgeReviewThread[], line: number) => React.ReactNode;
  composer?: { line: number; node: React.ReactNode } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => {
      if (containerRef.current) {
        return containerRef.current.closest<HTMLElement>('.overflow-y-auto') ?? null;
      }
      return null;
    },
    estimateSize: (index) => {
      const row = rows[index];
      if (row && 'kind' in row && row.kind === 'thread') return THREAD_ESTIMATE;
      if (row && 'kind' in row && row.kind === 'composer') return COMPOSER_ESTIMATE;
      return ROW_HEIGHT;
    },
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={containerRef} className="font-mono text-[11px] leading-[18px]" data-testid="diff-view">
      {diff.combined ? (
        <p className="border-b border-border bg-destructive/10 px-3 py-1.5 font-sans text-[11px] text-muted-foreground">
          This file is unmerged — the content below includes conflict markers.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const index = virtualRow.index;
            const row = rows[index];
            if (!row) return null;

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {'kind' in row && row.kind === 'thread' ? (
                  <div className="w-full">{renderThread?.(row.threads, row.line)}</div>
                ) : 'kind' in row && row.kind === 'composer' ? (
                  <div className="w-full">{composer?.node}</div>
                ) : row.kind === 'hunk' ? (
                  <div className="flex w-max min-w-full">
                    <HunkHeader row={row} onExpand={onExpandContext} context={diff.contextLines} />
                  </div>
                ) : row.kind === 'split-line' ? (
                  <div className="flex w-full divide-x divide-border">
                    <div className="w-1/2 min-w-0">
                      <DiffCell
                        cell={row.left}
                        side="left"
                        showGutter={showOldGutter}
                        path={diff.path}
                        dark={dark}
                      />
                    </div>
                    <div className="w-1/2 min-w-0">
                      <DiffCell
                        cell={row.right}
                        side="right"
                        showGutter
                        path={diff.path}
                        dark={dark}
                        onComment={onComment}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex w-max min-w-full">
                    <DiffCell
                      cell={{ line: row.line, type: row.line.kind }}
                      side="right"
                      showGutter={showOldGutter}
                      path={diff.path}
                      dark={dark}
                      onComment={onComment}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {diff.truncated ? (
        <p className="border-t border-border px-3 py-2 font-sans text-[11px] text-muted-foreground">
          {diff.droppedLines.toLocaleString()} more lines not shown — this diff was capped to
          keep the panel responsive.
        </p>
      ) : null}
    </div>
  );
}



