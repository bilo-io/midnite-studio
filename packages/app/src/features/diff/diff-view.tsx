import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DIFF_FULL_CONTEXT,
  type DiffLine,
  type FileDiff,
} from '@midnite/git-shared';
import { useTheme } from '@bilo-io/ui/theme';
import { ChevronsUpDown, Columns2, Columns3 } from 'lucide-react';
import { useRef } from 'react';

import { IconButton } from '../../components/icon-button';
import { useUiStore } from '../../store/ui-store';
import { describeEmptyDiff } from './describe-empty';
import { mergeSegmentsWithTokens, nextContext, toDiffRows, toSegments, type DiffRow } from './diff-rows';
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

export function DiffView({
  diff,
  isLoading = false,
  onExpandContext,
  emptyMessage,
  inline = false,
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
}) {
  const showOldGutter = useUiStore((s) => s.diffShowOldGutter);
  const toggleOldGutter = useUiStore((s) => s.toggleDiffOldGutter);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Same theme-sync rule `code-preview.tsx` already uses: the highlighter is
  // built with both themes loaded, so this is a lookup, not a refetch.
  const { resolved } = useTheme();
  const dark = resolved === 'dark';

  const rows = diff ? toDiffRows(diff) : [];

  const virtualizer = useVirtualizer({
    // Zero in inline mode: the hook must still be called unconditionally, but
    // it must not also do the work of measuring rows nothing will read.
    count: inline ? 0 : rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 24,
  });

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading diff…</p>;
  }

  if (!diff || rows.length === 0) {
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
          {rows.map((row, index) =>
            row.kind === 'hunk' ? (
              <div key={`h${index}`} className="flex w-max min-w-full">
                <HunkHeader row={row} onExpand={onExpandContext} context={diff.contextLines} />
              </div>
            ) : (
              <div key={`l${index}`} className="flex w-max min-w-full">
                <LineRow line={row.line} showOldGutter={showOldGutter} path={diff.path} dark={dark} />
              </div>
            ),
          )}
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
            return (
              <div
                key={item.key}
                // `w-max min-w-full`, not `w-full`: on a line wider than the
                // pane, a full-width row ends the tint and the 2px gutter bar at
                // the viewport edge while the text scrolls on past them.
                className="absolute left-0 top-0 flex w-max min-w-full"
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              >
                {row.kind === 'hunk' ? (
                  <HunkHeader row={row} onExpand={onExpandContext} context={diff.contextLines} />
                ) : (
                  <LineRow line={row.line} showOldGutter={showOldGutter} path={diff.path} dark={dark} />
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
}: {
  line: DiffLine;
  showOldGutter: boolean;
  /** The file's own path, for grammar resolution — see `line-highlight.ts`. */
  path: string;
  dark: boolean;
}) {
  const style = ROW_STYLE[line.kind];
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

      <span className="w-3 shrink-0 select-none text-center text-muted-foreground/70" aria-hidden>
        {MARKER[line.kind]}
      </span>

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
