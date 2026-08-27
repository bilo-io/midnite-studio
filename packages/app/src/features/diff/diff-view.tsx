import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DIFF_FULL_CONTEXT,
  type DiffLine,
  type FileDiff,
  type ForgeReviewThread,
} from '@midnite/git-shared';
import { useTheme } from '@bilo-io/ui/theme';
import { ChevronsUpDown, Columns2, Columns3, MessageSquarePlus } from 'lucide-react';
import { useRef } from 'react';

import { IconButton } from '../../components/icon-button';
import { useUiStore } from '../../store/ui-store';
import { isCommentableLine, type ThreadsByLine } from './comment-anchors';
import { describeEmptyDiff } from './describe-empty';
import {
  mergeSegmentsWithTokens,
  nextContext,
  toDiffRows,
  toSegments,
  withCommentRows,
  type DiffRow,
} from './diff-rows';
import { ImageDiff } from './image-diff';
import type { ImageDiffSources } from './image-sources';
import { useLineHighlight } from './line-highlight';

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
  /** Threads by new-file line — see `threadsForFile`. */
  threads?: ThreadsByLine;
  /** Enables the per-line gutter affordance. Called with the new-file line. */
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
  const toggleOldGutter = useUiStore((s) => s.toggleDiffOldGutter);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Same theme-sync rule `code-preview.tsx` already uses: the highlighter is
  // built with both themes loaded, so this is a lookup, not a refetch.
  const { resolved } = useTheme();
  const dark = resolved === 'dark';

  const rows = withCommentRows(diff ? toDiffRows(diff) : [], threads, composer?.line ?? null);

  const virtualizer = useVirtualizer({
    // Zero in inline mode: the hook must still be called unconditionally, but
    // it must not also do the work of measuring rows nothing will read.
    count: inline ? 0 : rows.length,
    getScrollElement: () => scrollRef.current,
    /*
      Per-index, because a thread panel is not 18px tall.

      Code rows keep the exact constant they always had, so a diff with no
      threads estimates to the identical total size — and the estimate is what
      the scrollbar is built from before anything has been measured.
    */
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.kind === 'thread') return THREAD_ESTIMATE;
      if (row?.kind === 'composer') return COMPOSER_ESTIMATE;
      return ROW_HEIGHT;
    },
    /*
      Measure what is rendered.

      This is the one concession the review rows cost the scroll path, and it is
      bounded: `measureElement` runs on the *windowed* rows only — a few dozen —
      never on the four thousand a capped diff can hold. A code row measures to
      the same 18px it was estimated at, so the common case reflows nothing;
      only the handful of thread and composer rows actually move the offsets.
    */
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading diff…</p>;
  }

  if (!diff || rows.length === 0) {
    // An image has no textual diff and never will; showing the two revisions is
    // the diff. This sits above the sentence rather than replacing it because
    // every other zero-hunk case — a mode change, a rename, a non-image blob —
    // still needs the words.
    if (images && (images.before || images.after)) {
      return <ImageDiff sources={images} inline={inline} />;
    }

    // Derived here rather than left to each caller: a binary blob and a
    // mode-only change both arrive as zero hunks, and the two surfaces used to
    // disagree about what to say for them.
    return (
      <p className="p-3 text-xs text-muted-foreground" data-testid="diff-empty">
        {emptyMessage ?? (diff ? describeEmptyDiff(diff) : 'No changes to show for this file.')}
      </p>
    );
  }

  const canExpandAll = diff.contextLines < DIFF_FULL_CONTEXT && onExpandContext !== undefined;

  if (inline) {
    return (
      <div className="font-mono text-[11px] leading-[18px]" data-testid="diff-view">
        {diff.combined ? (
          <p className="border-b border-border bg-destructive/10 px-3 py-1.5 font-sans text-[11px] text-muted-foreground">
            This file is unmerged — the content below includes conflict markers.
          </p>
        ) : null}

        {/*
          `w-max min-w-full` on the rows, and the horizontal scroller HERE
          rather than on the page. A long line must not widen the whole
          accordion list and make every other file scroll sideways with it.
        */}
        <div className="overflow-x-auto">
          {rows.map((row, index) => {
            /*
              The review rows are `w-full`, not `w-max min-w-full`.

              A code row is sized by its longest line so the tint and the gutter
              bar extend past the viewport with the text. A thread panel is
              prose: it should wrap to the pane, not add its own width to the
              horizontal scroll and drag every code row sideways with it.
            */
            if (row.kind === 'thread') {
              return (
                <div key={`t${index}`} className="w-full">
                  {renderThread?.(row.threads, row.line)}
                </div>
              );
            }
            if (row.kind === 'composer') {
              return (
                <div key={`c${index}`} className="w-full">
                  {composer?.node}
                </div>
              );
            }
            return (
              <div key={`r${index}`} className="flex w-max min-w-full">
                {row.kind === 'hunk' ? (
                  <HunkHeader row={row} onExpand={onExpandContext} context={diff.contextLines} />
                ) : (
                  <LineRow
                    line={row.line}
                    showOldGutter={showOldGutter}
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
          <p className="border-t border-border px-3 py-2 font-sans text-[11px] text-muted-foreground">
            {diff.droppedLines.toLocaleString()} more lines not shown — this diff was capped to
            keep the panel responsive.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="diff-view">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <span className="mr-auto truncate text-[11px] text-muted-foreground">
          <span className="font-medium text-success tabular-nums">+{diff.insertions}</span>
          {' / '}
          <span className="font-medium text-destructive tabular-nums">−{diff.deletions}</span>
        </span>

        <IconButton
          icon={showOldGutter ? Columns3 : Columns2}
          label={showOldGutter ? 'Hide original line numbers' : 'Show original line numbers'}
          aria-pressed={showOldGutter}
          size="sm"
          onClick={toggleOldGutter}
        />

        {canExpandAll ? (
          <IconButton
            icon={ChevronsUpDown}
            label="Show the whole file"
            size="sm"
            onClick={() => onExpandContext(DIFF_FULL_CONTEXT)}
          />
        ) : null}
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
            const review = row.kind === 'thread' || row.kind === 'composer';
            return (
              <div
                key={item.key}
                /*
                  `measureElement` + `data-index` is how the virtualizer learns
                  a row's real height, and it is the reason there is no `height`
                  in the style below any more: a measured row must be free to be
                  as tall as its content, and a fixed height would report the
                  estimate back as fact. Code rows still land on exactly
                  `ROW_HEIGHT`, so the offsets they produce are unchanged.
                */
                ref={virtualizer.measureElement}
                data-index={item.index}
                // `w-max min-w-full` for code rows: on a line wider than the
                // pane, a full-width row ends the tint and the 2px gutter bar at
                // the viewport edge while the text scrolls on past them. Review
                // rows are prose and wrap to the pane instead — see the inline
                // branch's note.
                className={`absolute left-0 top-0 ${review ? 'w-full' : 'flex w-max min-w-full'}`}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {row.kind === 'hunk' ? (
                  <HunkHeader row={row} onExpand={onExpandContext} context={diff.contextLines} />
                ) : row.kind === 'thread' ? (
                  renderThread?.(row.threads, row.line)
                ) : row.kind === 'composer' ? (
                  composer?.node
                ) : (
                  <LineRow
                    line={row.line}
                    showOldGutter={showOldGutter}
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

/**
 * Per-kind styling. The tint stays low-alpha; the saturated colour lives on the
 * 2px gutter bar, which is what the eye catches when scanning a long diff.
 */
const ROW_STYLE: Record<DiffLine['kind'], { row: string; bar: string; span: string }> = {
  add: { row: 'bg-success/10', bar: 'bg-success', span: 'bg-success/25' },
  del: { row: 'bg-destructive/10', bar: 'bg-destructive', span: 'bg-destructive/25' },
  ctx: { row: '', bar: 'bg-transparent', span: '' },
};

const MARKER: Record<DiffLine['kind'], string> = { add: '+', del: '−', ctx: ' ' };

function LineRow({
  line,
  showOldGutter,
  path,
  dark,
  onComment,
}: {
  line: DiffLine;
  showOldGutter: boolean;
  /** The file's own path, for grammar resolution — see `line-highlight.ts`. */
  path: string;
  dark: boolean;
  /** Absent on every non-review surface, which is what hides the gutter. */
  onComment?: (line: number) => void;
}) {
  const style = ROW_STYLE[line.kind];
  /*
    Right-side lines only, per the phase's v1 scope: a deleted line needs
    `side: LEFT` and a second position mapping this version does not build, so
    it gets no affordance rather than one that would post to the wrong place.
  */
  const commentLine =
    onComment !== undefined && isCommentableLine(line) ? line.newNo : null;
  // `null` while unhighlighted (no grammar, or still scheduled) — every piece
  // below then renders with no colour, exactly today's plain appearance.
  const tokens = useLineHighlight(path, line, dark);
  const pieces = mergeSegmentsWithTokens(toSegments(line), tokens);

  return (
    <div className={`flex w-full ${style.row}`} data-line-kind={line.kind}>
      <span className={`w-0.5 shrink-0 ${style.bar}`} aria-hidden />

      {showOldGutter ? (
        <span className="w-10 shrink-0 select-none pr-1.5 text-right tabular-nums text-muted-foreground/60">
          {line.oldNo ?? ''}
        </span>
      ) : null}
      <span className="w-10 shrink-0 select-none pr-1.5 text-right tabular-nums text-muted-foreground/60">
        {line.newNo ?? ''}
      </span>

      {/*
        The affordance replaces the marker column rather than adding a column of
        its own. A gutter that appears on hover would reflow every line of the
        diff sideways under the cursor; occupying the 12px the `+`/`−` glyph
        already holds means hovering a row changes what that cell shows and
        nothing about where anything sits.
      */}
      {commentLine !== null && onComment !== undefined ? (
        <button
          type="button"
          onClick={() => onComment(commentLine)}
          aria-label={`Comment on line ${commentLine}`}
          className="group/gutter w-3 shrink-0 select-none text-center text-muted-foreground/70 hover:text-primary"
        >
          <span aria-hidden className="group-hover/gutter:hidden">
            {MARKER[line.kind]}
          </span>
          <MessageSquarePlus
            aria-hidden
            className="mx-auto hidden h-3 w-3 group-hover/gutter:block"
          />
        </button>
      ) : (
        <span className="w-3 shrink-0 select-none text-center text-muted-foreground/70" aria-hidden>
          {MARKER[line.kind]}
        </span>
      )}

      <span className="min-w-0 flex-1 whitespace-pre pr-3" data-selectable>
        {pieces.map((piece, i) => {
          if (!piece.changed) {
            return (
              <span key={i} style={piece.color ? { color: piece.color } : undefined}>
                {piece.text}
              </span>
            );
          }
          /*
            A token boundary landing inside one changed diff segment splits it
            into several adjacent pieces here — each still `changed`, each its
            own <span> for the colour. Rounding every one of them on all four
            corners would draw a visible seam where two touching pieces meet;
            rounding only the outer edge of the whole run is what makes it
            read as the one continuous mark it is.
          */
          const runStart = !pieces[i - 1]?.changed;
          const runEnd = !pieces[i + 1]?.changed;
          return (
            <span
              key={i}
              data-diff-mark
              className={`${style.span} ${runStart ? 'rounded-l-[2px]' : ''} ${runEnd ? 'rounded-r-[2px]' : ''}`.trim()}
              style={piece.color ? { color: piece.color } : undefined}
            >
              {piece.text}
            </span>
          );
        })}
        {line.noNewline ? (
          <span className="ml-2 italic text-muted-foreground/60">no newline at end of file</span>
        ) : null}
      </span>
    </div>
  );
}
