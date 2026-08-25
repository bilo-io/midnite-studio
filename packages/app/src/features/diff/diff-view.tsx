import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DIFF_FULL_CONTEXT,
  type DiffLine,
  type FileDiff,
} from '@midnite/git-shared';
import { ChevronsUpDown, Columns2, Columns3 } from 'lucide-react';
import { useRef } from 'react';

import { IconButton } from '../../components/icon-button';
import { useUiStore } from '../../store/ui-store';
import { describeEmptyDiff } from './describe-empty';
import { nextContext, toDiffRows, toSegments, type DiffRow } from './diff-rows';

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
}: {
  diff: FileDiff | undefined;
  isLoading?: boolean;
  /**
   * Ask for a wider `-U`. Expansion is a refetch, not a client-side reveal:
   * git only ever emits the context it was asked for.
   */
  onExpandContext?: (context: number) => void;
  emptyMessage?: string | null;
}) {
  const showOldGutter = useUiStore((s) => s.diffShowOldGutter);
  const toggleOldGutter = useUiStore((s) => s.toggleDiffOldGutter);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = diff ? toDiffRows(diff) : [];

  const virtualizer = useVirtualizer({
    count: rows.length,
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

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="diff-view">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <span className="mr-auto truncate text-[11px] text-muted-foreground">
          <span className="text-success tabular-nums">+{diff.insertions}</span>
          {' / '}
          <span className="text-destructive tabular-nums">−{diff.deletions}</span>
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
                className="absolute left-0 top-0 flex w-full"
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              >
                {row.kind === 'hunk' ? (
                  <HunkHeader row={row} onExpand={onExpandContext} context={diff.contextLines} />
                ) : (
                  <LineRow line={row.line} showOldGutter={showOldGutter} />
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

function LineRow({ line, showOldGutter }: { line: DiffLine; showOldGutter: boolean }) {
  const style = ROW_STYLE[line.kind];

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
        {toSegments(line).map((segment, i) =>
          segment.changed ? (
            <span key={i} className={`rounded-[2px] ${style.span}`}>
              {segment.text}
            </span>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
        {line.noNewline ? (
          <span className="ml-2 italic text-muted-foreground/60">no newline at end of file</span>
        ) : null}
      </span>
    </div>
  );
}
