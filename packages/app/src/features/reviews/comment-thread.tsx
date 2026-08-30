import type { ForgeReviewComment, ForgeReviewThread } from '@midnite/studio-shared';
import { Check, CornerDownRight, Undo2 } from 'lucide-react';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { PresentButton } from '../slides/present-button';
import { RESOLVED_STATUS, StatusPill } from '../forge/forge-status';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { CommentComposer } from './comment-composer';

/**
 * The inline threads sitting on one line of a diff.
 *
 * Rendered *between* diff rows, which is what makes it worth the layout cost:
 * a review comment is about a specific line, and a panel two hundred rows away
 * in a sidebar makes the reader hold the line in their head. `<DiffView>`
 * splices this in as a row of its own — see `withCommentRows`.
 *
 * Read plus two writes, and no more. Reply and resolve are the two things a
 * reader does to a thread; editing or deleting somebody else's comment is not
 * offered, matching GitHub's own permission model rather than rendering a
 * control that would fail for most readers on most threads.
 */
export function CommentThread({
  threads,
  line,
  onReply,
  onResolve,
  busy = false,
  error = null,
}: {
  /** Every thread anchored to this line — usually one, occasionally several. */
  threads: readonly ForgeReviewThread[];
  line: number;
  /**
   * `commentId` is a REST id — the reply endpoint takes no node id.
   *
   * Resolves true when the reply landed; the box stays open with its text when
   * it did not.
   */
  onReply: (input: { commentId: string; body: string }) => Promise<boolean>;
  onResolve: (input: { threadId: string; resolved: boolean }) => void;
  /** A write is in flight; every control locks rather than queueing a second. */
  busy?: boolean;
  /** `gh`'s own words on a refused write, rendered where it was asked for. */
  error?: string | null;
}) {
  return (
    <div
      data-testid="comment-thread"
      data-line={line}
      className="border-y border-border/60 bg-muted/20 px-3 py-2"
    >
      <ul className="space-y-2">
        {threads.map((thread) => (
          <li key={thread.id}>
            <Thread
              thread={thread}
              onReply={onReply}
              onResolve={onResolve}
              busy={busy}
              error={error}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thread({
  thread,
  onReply,
  onResolve,
  busy,
  error,
}: {
  thread: ForgeReviewThread;
  onReply: (input: { commentId: string; body: string }) => Promise<boolean>;
  onResolve: (input: { threadId: string; resolved: boolean }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [replying, setReplying] = useState(false);

  /*
    Resolved threads arrive collapsed.

    A resolved thread is settled discussion, and leaving a dozen of them open
    turns a reviewed file into mostly prose. It stays one click from open, and
    the summary line still says who and how many — collapsed, not hidden.
  */
  const [open, setOpen] = useState(!thread.resolved);

  /*
    Replies go to the LAST comment's REST id, not the thread's node id.

    The endpoint is `pulls/{n}/comments/{id}/replies` and any comment already in
    the thread identifies it; the newest is the one guaranteed to be visible to
    whoever is replying. `databaseId` is null only when the forge withheld it,
    and then there is no reply target at all — so the button goes away rather
    than posting a new top-level thread on the same line, which is what the
    create endpoint would silently do instead.
  */
  const replyTarget = [...thread.comments].reverse().find((c) => c.databaseId !== null);

  const count = thread.comments.length;
  const first = thread.comments[0];

  return (
    <div className="rounded border border-border/60 bg-background/60">
      <div className="flex items-center gap-2 px-2 py-1 text-[11px]">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-foreground"
        >
          <span className="truncate font-medium">{first?.author || 'someone'}</span>
          <span className="rounded bg-muted px-1 text-[10px] font-mono text-muted-foreground">
            {thread.side} L{thread.line}
          </span>
          <span className="text-muted-foreground/70">
            {count === 1 ? '1 comment' : `${count} comments`}
          </span>
          {thread.resolved ? <StatusPill status={RESOLVED_STATUS} /> : null}

        </button>

        <button
          type="button"
          onClick={() => onResolve({ threadId: thread.id, resolved: !thread.resolved })}
          disabled={busy}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {thread.resolved ? (
            <Undo2 aria-hidden className="h-3 w-3" />
          ) : (
            <Check aria-hidden className="h-3 w-3" />
          )}
          {thread.resolved ? 'Reopen' : 'Resolve'}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border/40 px-2 py-1.5">
          {/* Named so a reader — and a test — can tell the comments apart from
              the summary row above them, which repeats the first author. */}
          <ol aria-label="Thread comments" className="space-y-2">
            {thread.comments.map((comment) => (
              <li key={comment.id}>
                <CommentBody comment={comment} />
              </li>
            ))}
          </ol>

          {replying && replyTarget?.databaseId ? (
            <CommentComposer
              label={`Reply to ${first?.author || 'this thread'}`}
              submitLabel="Reply"
              busy={busy}
              error={error}
              onCancel={() => setReplying(false)}
              onSubmit={(body) => {
                // `databaseId` re-read inside the closure so the narrowing above
                // is the one the call actually uses.
                const id = replyTarget.databaseId;
                if (id === null) return;
                // Closed on success only — see the composer's own note on why a
                // refused write must not take the text with it.
                void onReply({ commentId: id, body }).then((ok) => {
                  if (ok) setReplying(false);
                });
              }}
            />
          ) : replyTarget !== undefined ? (
            <button
              type="button"
              onClick={() => setReplying(true)}
              disabled={busy}
              className="mt-1.5 flex items-center gap-1 rounded px-1 py-px text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <CornerDownRight aria-hidden className="h-3 w-3" />
              Reply
            </button>
          ) : null}

          {/*
            The failure sits with the thread it came from, not in a toast.
            "You must have write access to this repository" is actionable; a
            corner notification that has already faded is not.
          */}
          {error !== null && !replying ? (
            <p className="mt-1.5 text-[11px] text-destructive">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One comment: author, date, and its markdown. */
function CommentBody({ comment }: { comment: ForgeReviewComment }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-medium">{comment.author || 'someone'}</span>
        <span className="text-muted-foreground/70 tabular-nums">
          {comment.createdAt.slice(0, 10)}
        </span>
        {/*
          Always shown, even for a one-line comment — a one-slide deck is a
          valid deck, not an error state to special-case around. Does NOT
          claim `activeMarkdown`: a thread can hold many short bodies visible
          at once, and none of them is unambiguously "the" markdown a
          keyboard-invoked command should target (Phase 29's resolved
          decision) — only the two description-level surfaces do that.
        */}
        <PresentButton source={{ content: comment.body, label: 'Comment' }} className="ml-auto" />
      </div>
      <div
        data-selectable
        className={`mt-0.5 max-w-none text-[13px] leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}
      >
        {/*
          No `rehype-raw`, for the reason `PrConversation` states: a comment body
          is text somebody else wrote, and allowing raw HTML through would make
          sanitisation this component's problem.
        */}
        <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
          {comment.body}
        </Markdown>
      </div>
    </div>
  );
}
