import type { FileDiff, ForgeReviewComment, ForgeReviewThread } from '@midnite/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { LuCheck, LuCornerDownRight, LuUndo2, LuWandSparkles } from 'react-icons/lu';
import { type ReactNode, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { bridge, hasBridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { PresentButton } from '../slides/present-button';
import { RESOLVED_STATUS, StatusPill } from '../forge/forge-status';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { CommentComposer } from './comment-composer';
import {
  checkSuggestionApplies,
  expectedRightSideText,
  spliceSuggestion,
  suggestionLineRange,
} from './suggestion-block';

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
  file,
  repoId,
  worktreePath,
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
  /**
   * The Apply half (Phase 48). All three optional and all three required
   * together in practice — a thread with no repo scope to write into simply
   * never offers Apply, which is exactly `OutdatedThreads`' situation for a
   * file-level or already-outdated thread.
   */
  file?: FileDiff;
  repoId?: string;
  worktreePath?: string;
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
              file={file}
              repoId={repoId}
              worktreePath={worktreePath}
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
  file,
  repoId,
  worktreePath,
}: {
  thread: ForgeReviewThread;
  onReply: (input: { commentId: string; body: string }) => Promise<boolean>;
  onResolve: (input: { threadId: string; resolved: boolean }) => void;
  busy: boolean;
  error: string | null;
  file?: FileDiff;
  repoId?: string;
  worktreePath?: string;
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
            <LuUndo2 aria-hidden className="h-3 w-3" />
          ) : (
            <LuCheck aria-hidden className="h-3 w-3" />
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
                <CommentBody
                  comment={comment}
                  thread={thread}
                  file={file}
                  repoId={repoId}
                  worktreePath={worktreePath}
                />
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
              <LuCornerDownRight aria-hidden className="h-3 w-3" />
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
function CommentBody({
  comment,
  thread,
  file,
  repoId,
  worktreePath,
}: {
  comment: ForgeReviewComment;
  thread: ForgeReviewThread;
  file?: FileDiff;
  repoId?: string;
  worktreePath?: string;
}) {
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
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ExternalLink,
            pre: SuggestionPre,
            code: (props) => (
              <SuggestionCode
                {...props}
                thread={thread}
                file={file}
                repoId={repoId}
                worktreePath={worktreePath}
              />
            ),
          }}
        >
          {comment.body}
        </Markdown>
      </div>
    </div>
  );
}

/**
 * react-markdown's `pre` override, a passthrough — matching `SlidePre`
 * (`slide-code.tsx`): `code` below supplies the whole wrapper for a fenced
 * block rather than nesting inside react-markdown's default `<pre>`.
 */
function SuggestionPre({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/**
 * react-markdown's `code` override for a review comment (Phase 48 Theme D).
 * Detects a ` ```suggestion ` fence the same way `SlideCode` detects any
 * fenced language (a `language-(\w+)` className), and renders it as a small
 * removed/added preview — every original line struck through, every
 * suggested line added, styled off the same add/del tokens `DiffCell` uses
 * (`bg-success`/`bg-destructive`) — plus an Apply button. Every other code
 * span (inline, or fenced in any other language) falls through to a plain
 * `<code>`, matching this file's behaviour before this theme.
 */
function SuggestionCode({
  className,
  children,
  thread,
  file,
  repoId,
  worktreePath,
}: {
  className?: string;
  children?: ReactNode;
  thread: ForgeReviewThread;
  file?: FileDiff;
  repoId?: string;
  worktreePath?: string;
}) {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match?.[1] ?? null;

  if (lang !== 'suggestion') return <code className={className}>{children}</code>;

  // react-markdown hands the fenced block's own de-fenced text straight
  // through as `children`, trailing newline included — the same text
  // `extractSuggestion` would find for a body with exactly one suggestion
  // fence. A second fence in one body (rare, but valid markdown) renders
  // its own working preview off its own text; the "first fence wins" rule
  // (Theme A) only governs which one `extractSuggestion` names THE
  // suggestion elsewhere, not whether every fence renders.
  const suggestion = typeof children === 'string' ? children.replace(/\n$/, '') : '';
  const suggestedLines = suggestion.split('\n');

  // A LEFT-side thread has no honest local target — Theme B's rule — so no
  // Apply affordance is offered at all, not a disabled one with a reason.
  const offerApply = thread.side === 'RIGHT';
  const range = suggestionLineRange(thread);
  // The struck-through half shows what the PR's own diff says is on those
  // lines right now — the "original" a suggestion is written against —
  // never the local checkout, which may have already drifted (Theme C's
  // whole reason for existing). `null` means there is nothing honest to
  // show as removed (no range, or the diff can't name every line in it).
  const originalText =
    range !== null && file !== undefined
      ? expectedRightSideText(file, range.start, range.end)
      : null;

  return (
    <div className="my-1 overflow-hidden rounded-md border border-border/60" data-selectable>
      {originalText !== null ? (
        <div className="bg-destructive/10 px-2 py-0.5 font-mono text-[12px] leading-5 text-destructive line-through">
          {originalText.split('\n').map((line, i) => (
            <div key={i}>{line || ' '}</div>
          ))}
        </div>
      ) : null}
      <div className="bg-success/10 px-2 py-0.5 font-mono text-[12px] leading-5 text-success">
        {suggestedLines.map((line, i) => (
          <div key={i}>{line || ' '}</div>
        ))}
      </div>
      {offerApply ? (
        <ApplySuggestion
          thread={thread}
          file={file}
          repoId={repoId}
          worktreePath={worktreePath}
          suggestion={suggestion}
        />
      ) : null}
    </div>
  );
}

/**
 * The Apply button. Reads the local file eagerly (not just on click) so the
 * button is disabled — with the specific reason as its `title` — before the
 * user ever clicks it, matching this repo's disabled-reason convention
 * (`field-editor.tsx`'s `SingleSelectEditor`).
 */
function ApplySuggestion({
  thread,
  file,
  repoId,
  worktreePath,
  suggestion,
}: {
  thread: ForgeReviewThread;
  file?: FileDiff;
  repoId?: string;
  worktreePath?: string;
  suggestion: string;
}) {
  const range = suggestionLineRange(thread);
  const scope =
    repoId !== undefined ? ({ scope: 'repo' as const, repoId, worktreePath } as const) : null;
  const canCheck = scope !== null && file !== undefined && range !== null;

  const { data: read } = useQuery({
    queryKey: canCheck
      ? [...keys.fs(scope), 'file', thread.path]
      : ['suggestion-apply', thread.id, 'no-scope'],
    queryFn: async () => bridge()!.fs.readFile({ ...scope!, relPath: thread.path }),
    enabled: hasBridge() && canCheck,
  });

  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  /*
    One consistent tree — `<div><ApplyButton/>{error}</div>` — across every
    pre-applied state, computed as plain values rather than early-returning a
    different shape per branch. React reconciles the SAME `<button>` DOM node
    across "not applicable" → "checking" → "enabled" as the query resolves;
    an early-returned bare `<ApplyButton>` for the disabled states versus a
    div-wrapped one for the enabled state would swap the button's position in
    the tree and force React to unmount/remount it on every transition.
  */
  let disabled = true;
  let reason: string | null = null;
  let handleApply = () => undefined as void;

  if (!canCheck || file === undefined || range === null || scope === null) {
    reason = 'not applicable to this thread';
  } else if (read === undefined) {
    reason = 'checking the local file…';
  } else {
    const localContent = read.kind === 'text' ? read.content : null;
    const check = checkSuggestionApplies({ thread, file, localContent });
    if (!check.ok) {
      reason = check.reason;
    } else {
      disabled = applying;
      handleApply = () => {
        if (read.kind !== 'text') return;
        setApplying(true);
        setApplyError(null);
        const content = spliceSuggestion(read.content, range, suggestion);
        void bridge()!
          .fs.writeFile({ ...scope, relPath: thread.path, content, expectedVersion: read.version })
          .then((result) => {
            setApplying(false);
            if (result.ok) {
              setApplied(true);
              return;
            }
            setApplyError(result.kind === 'error' ? result.message : 'Could not apply the suggestion.');
          });
      };
    }
  }

  if (applied) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-success">
        <LuCheck aria-hidden className="h-3 w-3" />
        Applied
      </div>
    );
  }

  return (
    <div>
      <ApplyButton disabled={disabled} reason={reason} onClick={handleApply} />
      {applyError !== null ? <p className="px-2 pb-1 text-[11px] text-destructive">{applyError}</p> : null}
    </div>
  );
}

function ApplyButton({
  disabled,
  reason,
  onClick,
}: {
  disabled: boolean;
  reason: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={reason ?? undefined}
      className="flex w-full items-center gap-1.5 border-t border-border/60 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LuWandSparkles aria-hidden className="h-3 w-3" />
      Apply suggestion
    </button>
  );
}
