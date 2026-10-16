import type { DiffLine, StatusCode } from '@midnite/studio-shared';

import type { ForgeDiffKit, ForgeDiffViewProps } from '../host';

/**
 * A plain pull-request diff for an app that is not Studio (Phase 113 Theme O):
 * unified hunks, review threads under the line they anchor to, the comment
 * composer where it was opened and a line-number button to start one. No split
 * layout, no syntax colour, no image diff — Studio's diff view moves into the
 * frame with the git graph (Theme O slice 2), and this goes then.
 */

const LINE_TONE: Record<DiffLine['kind'], string> = {
  add: 'bg-success/10',
  del: 'bg-destructive/10',
  ctx: '',
};
const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '−', ctx: ' ' };

function PlainDiffView({ diff, threads, leftThreads, onComment, renderThread, composer }: ForgeDiffViewProps) {
  if (!diff) return null;
  if (diff.binary) return <p className="px-3 py-2 text-xs text-muted-foreground">Binary file — not shown.</p>;
  return (
    <div className="overflow-x-auto font-mono text-[12px] leading-5">
      {diff.hunks.map((hunk, index) => (
        <div key={`${hunk.oldStart}:${hunk.newStart}:${index}`}>
          <div className="bg-muted/40 px-3 text-muted-foreground">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.heading}
          </div>
          {hunk.lines.map((line, i) => {
            const right = line.newNo === null ? undefined : threads?.get(line.newNo);
            const left = line.kind === 'del' && line.oldNo !== null ? leftThreads?.get(line.oldNo) : undefined;
            const atLine = line.newNo ?? line.oldNo ?? 0;
            return (
              <div key={i}>
                <div className={`flex whitespace-pre ${LINE_TONE[line.kind]}`}>
                  <button
                    type="button"
                    disabled={!onComment || line.newNo === null}
                    onClick={() => line.newNo !== null && onComment?.(line.newNo)}
                    aria-label={line.newNo === null ? undefined : `Comment on line ${line.newNo}`}
                    className="w-12 shrink-0 select-none pr-2 text-right text-muted-foreground/70 enabled:hover:text-primary"
                  >
                    {line.newNo ?? line.oldNo ?? ''}
                  </button>
                  <span className="select-none pr-1 text-muted-foreground">{SIGN[line.kind]}</span>
                  <span>{line.text}</span>
                </div>
                {left && renderThread ? renderThread(left, line.oldNo ?? atLine) : null}
                {right && renderThread ? renderThread(right, atLine) : null}
                {composer && line.newNo === composer.line ? composer.node : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const MARK: Record<string, string> = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', copied: 'C', typeChanged: 'T' };

function PlainStatusMark({ code }: { code: StatusCode; conflicted: boolean }) {
  return <span className="w-3 shrink-0 text-center font-mono text-[11px] text-muted-foreground">{MARK[code] ?? '?'}</span>;
}

function PlainChangeCounts({ insertions, deletions }: { insertions: number; deletions: number }) {
  return (
    <span className="ml-auto shrink-0 tabular-nums text-[11px]">
      <span className="text-success">+{insertions}</span> <span className="text-destructive">−{deletions}</span>
    </span>
  );
}

/** Always unified: the plain view has no split layout to fall back from. */
const useAlwaysNarrow = (): boolean => true;

export const PLAIN_DIFF_KIT: ForgeDiffKit = {
  DiffView: PlainDiffView,
  DiffToolbar: () => null,
  StatusMark: PlainStatusMark,
  ChangeCounts: PlainChangeCounts,
  useTooNarrowForSplit: useAlwaysNarrow,
};
