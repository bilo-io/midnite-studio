import type { ForgeReviewThread } from '@midnite/studio-shared';
import { ChevronRight, History } from 'lucide-react';
import { useId, useState } from 'react';

import { CommentThread } from './comment-thread';

/**
 * The threads this file's diff can no longer anchor.
 *
 * Four kinds end up here, and they share the one property that matters:
 * nothing in the rendered diff describes what they were written about.
 *
 * - **Outdated** — the thread had a line, and a force-push or a later commit
 *   rewrote it away. GitHub nulls `line` and sets `isOutdated`.
 * - **File-level** — `subjectType: FILE`. A comment on the file, never on a line.
 * - **Left-side** — anchored to a deleted line, which v1 does not map.
 * - **Outside every hunk** — live, right-side, and naming a line this diff
 *   simply does not carry, because the reviewer expanded context on github.com
 *   and `gh pr diff` fetches three lines of it. `threadsForFile` sorts these
 *   here; without that check they would render nowhere at all.
 *
 * **They render above the diff, not on a line.** Pinning a thread to whatever
 * row happens to carry its old number now is the failure this component exists
 * to prevent: it looks completely normal and it attributes somebody's review
 * comment to code they never saw. So the original line is stated as *text*, and
 * the group is collapsed by default — present and countable, never anchored and
 * never dropped.
 */
export function OutdatedThreads({
  threads,
  onReply,
  onResolve,
  busy = false,
  error = null,
}: {
  threads: readonly ForgeReviewThread[];
  /** Resolves true when the reply landed — see `CommentThread`'s own note. */
  onReply: (input: { commentId: string; body: string }) => Promise<boolean>;
  onResolve: (input: { threadId: string; resolved: boolean }) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  if (threads.length === 0) return null;

  return (
    <div className="border-b border-border/40 bg-muted/10" data-testid="outdated-threads">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          aria-hidden
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <History aria-hidden className="h-3 w-3 shrink-0" />
        {threads.length === 1
          ? '1 comment thread no longer in this diff'
          : `${threads.length} comment threads no longer in this diff`}
      </button>

      {open ? (
        <div id={bodyId} className="space-y-1.5 px-3 pb-2">
          {threads.map((thread) => (
            <div key={thread.id}>
              <p className="px-1 pb-0.5 text-[10px] text-muted-foreground/70">
                {describeAnchor(thread)}
              </p>
              {/*
                The same panel the anchored case uses, reused rather than
                re-styled. A thread's contents and its two actions do not change
                because its line went away — only where it can be drawn does.
                `line={0}` is the honest answer to "which line": none.
              */}
              <CommentThread
                threads={[thread]}
                line={0}
                onReply={onReply}
                onResolve={onResolve}
                busy={busy}
                error={error}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where the thread used to point, in words.
 *
 * `originalLine` is the field that survives the rewrite which nulled `line`, so
 * it is the only number worth quoting — and it is quoted as prose ("was on line
 * 40") rather than rendered as a gutter, because it names a line in a version of
 * the file that is not on screen.
 */
function describeAnchor(thread: ForgeReviewThread): string {
  if (thread.fileLevel) return 'On the file, not a line';
  if (thread.side === 'LEFT') {
    return thread.originalLine === null
      ? 'On a removed line'
      : `On removed line ${thread.originalLine}`;
  }
  return thread.originalLine === null
    ? 'The line it was written on is no longer in the diff'
    : `Was on line ${thread.originalLine} — no longer in the diff`;
}
