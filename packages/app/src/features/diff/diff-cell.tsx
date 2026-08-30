import type { DiffLine, SplitCell } from '@midnite/studio-shared';
import { MessageSquarePlus } from 'lucide-react';

import { mergeSegmentsWithTokens, toSegments } from './diff-rows';
import { isCommentableLine } from './comment-anchors';
import { useLineHighlight } from './line-highlight';



const ROW_STYLE: Record<DiffLine['kind'], { row: string; bar: string; span: string }> = {
  add: { row: 'bg-success/10', bar: 'bg-success', span: 'bg-success/25' },
  del: { row: 'bg-destructive/10', bar: 'bg-destructive', span: 'bg-destructive/25' },
  ctx: { row: '', bar: 'bg-transparent', span: '' },
};

const MARKER: Record<DiffLine['kind'], string> = { add: '+', del: '−', ctx: ' ' };


export function DiffCell({
  cell,
  side,
  showGutter = true,
  path,
  dark,
  onComment,
}: {
  cell: SplitCell;
  side: 'left' | 'right';
  showGutter?: boolean;
  path: string;
  dark: boolean;
  onComment?: (line: number) => void;
}) {
  const line = cell.line;
  // Always call hooks unconditionally
  const tokens = useLineHighlight(path, line, dark);

  if (!line || cell.type === 'empty') {
    return (
      <div className="flex w-full bg-muted/10 opacity-50" data-testid={`diff-cell-${side}-empty`}>
        <span className="w-0.5 shrink-0 bg-transparent" aria-hidden />
        {showGutter ? (
          <span className="w-10 shrink-0 select-none pr-1.5 text-right tabular-nums text-muted-foreground/30">
            •
          </span>
        ) : null}
        <span className="w-3 shrink-0 select-none text-center text-muted-foreground/30" aria-hidden>
          &nbsp;
        </span>
        <span className="min-w-0 flex-1 whitespace-pre pr-3" />
      </div>
    );
  }

  const kind = line.kind as DiffLine['kind'];
  const style = ROW_STYLE[kind];
  const lineNo = side === 'left' ? line.oldNo : line.newNo;
  const isCommentable = isCommentableLine({ kind, oldNo: line.oldNo, newNo: line.newNo }, side);
  const commentLine = onComment !== undefined && isCommentable ? lineNo : null;

  const pieces = mergeSegmentsWithTokens(toSegments(line), tokens);



  return (
    <div className={`flex w-full ${style.row}`} data-line-kind={kind} data-side={side}>
      <span className={`w-0.5 shrink-0 ${style.bar}`} aria-hidden />

      {showGutter ? (
        <span className="w-10 shrink-0 select-none pr-1.5 text-right tabular-nums text-muted-foreground/60">
          {lineNo ?? ''}
        </span>
      ) : null}

      {commentLine !== null && onComment !== undefined ? (
        <button
          type="button"
          onClick={() => onComment(commentLine)}
          aria-label={`Comment on line ${commentLine}`}
          className="group/gutter w-3 shrink-0 select-none text-center text-muted-foreground/70 hover:text-primary"
        >
          <span aria-hidden className="group-hover/gutter:hidden">
            {MARKER[kind]}
          </span>
          <MessageSquarePlus
            aria-hidden
            className="mx-auto hidden h-3 w-3 group-hover/gutter:block"
          />
        </button>
      ) : (
        <span className="w-3 shrink-0 select-none text-center text-muted-foreground/70" aria-hidden>
          {MARKER[kind]}
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
