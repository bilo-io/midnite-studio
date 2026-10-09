import type { HunkExcerpt, HunkLine } from './diff-hunk';

const ROW_TONE: Record<HunkLine['kind'], string> = {
  add: 'bg-success/10',
  del: 'bg-destructive/10',
  ctx: '',
};
const MARKER: Record<HunkLine['kind'], string> = { add: '+', del: '-', ctx: ' ' };

/**
 * The code a Conversation-tab thread is about: old/new line-number gutters and
 * add/del tint matching `DiffCell`'s tokens, the commented line(s) marked with
 * a left rule. Read-only; the real diff lives on the Files tab.
 */
export function HunkExcerptView({ excerpt }: { excerpt: HunkExcerpt }) {
  return (
    <div
      data-testid="hunk-excerpt"
      className="overflow-x-auto border-t border-border/40 font-mono text-[12px] leading-5"
    >
      {excerpt.lines.map((line, i) => (
        <div
          key={i}
          data-kind={line.kind}
          data-commented={line.commented}
          className={`flex min-w-max ${ROW_TONE[line.kind]} ${
            line.commented ? 'border-l-2 border-primary' : 'border-l-2 border-transparent'
          }`}
        >
          <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/60 tabular-nums">
            {line.oldNo ?? ''}
          </span>
          <span className="w-10 shrink-0 select-none px-1 text-right text-muted-foreground/60 tabular-nums">
            {line.newNo ?? ''}
          </span>
          <span className="w-4 shrink-0 select-none text-center text-muted-foreground/70">
            {MARKER[line.kind]}
          </span>
          <span className="whitespace-pre pr-3">{line.text}</span>
        </div>
      ))}
    </div>
  );
}
