import type { FileDiff, ForgeComment, ForgeReviewThread } from '@midnite/studio-shared';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { reviewStatus, StatusPill } from '../forge/forge-status';
import { PresentButton } from '../slides/present-button';
import { UserAvatar } from '../../components/user-avatar';
import { Thread } from './comment-thread';
import { buildConversationTimeline } from './conversation-timeline';
import { threadExcerpt } from './diff-hunk';
import { PrConversationSkeleton } from './reviews-skeletons';

/**
 * A pull request's top-level thread — discussion and review verdicts, merged.
 *
 * Review threads sit inside it the way github.com shows them: nested under
 * the review that opened them (`buildConversationTimeline`), each with its file
 * path, code excerpt, replies and a Resolve conversation button. The write
 * callbacks are the ones the Files tab uses — `PrDetail` owns the mutations.
 *
 * The two collections interleave by timestamp in main (`mergeConversation`),
 * so this component sorts nothing — it renders a sequence. A review's verdict
 * rides the same `StatusPill` the sidebar row uses, so "Approved" is the same
 * mark and the same green in both places — and `reviewStatus` lives in
 * `forge-status` alongside it rather than here, so it cannot drift into a
 * second opinion about which glyph that is.
 */
export function PrConversation({
  comments,
  isLoading,
  error,
  notReady,
  threads = [],
  files = null,
  onReply = () => Promise.resolve(false),
  onResolve = () => undefined,
  busy = false,
  writeError = null,
  partialNote = false,
  onOpenFile,
}: {
  comments: readonly ForgeComment[];
  isLoading: boolean;
  error: string | null;
  /** Why `gh` could not answer at all — see `notReady` in `pr-detail.tsx`. */
  notReady: string | null;
  threads?: readonly ForgeReviewThread[];
  /** The Files patch when already cached — the excerpt fallback for an empty `diffHunk`. */
  files?: readonly FileDiff[] | null;
  onReply?: (input: { commentId: string; body: string }) => Promise<boolean>;
  onResolve?: (input: { threadId: string; resolved: boolean }) => void;
  busy?: boolean;
  writeError?: string | null;
  /** The forge only has flat comment chains (Bitbucket) — see `PrDetail`. */
  partialNote?: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const timeline = buildConversationTimeline(comments, threads);

  const renderThread = (thread: ForgeReviewThread) => (
    <Thread
      thread={thread}
      conversation={{
        excerpt: threadExcerpt(thread, files?.find((f) => f.path === thread.path)),
        onOpenFile,
      }}
      onReply={onReply}
      onResolve={onResolve}
      busy={busy}
      error={writeError}
      file={files?.find((f) => f.path === thread.path)}
    />
  );

  // "Nobody has commented" is a claim about the pull request. It must not be
  // what a signed-out machine reads.
  if (notReady !== null) return <Note>{notReady}</Note>;
  if (error !== null) {
    return <Note tone="destructive">{error}</Note>;
  }
  if (isLoading && comments.length === 0) {
    return <PrConversationSkeleton />;
  }
  if (timeline.length === 0) {
    return <Note>Nobody has commented on this pull request.</Note>;
  }

  return (
    <>
      {partialNote && threads.length > 0 ? (
        <p
          data-testid="thread-partial-capability-note"
          className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground"
        >
          Bitbucket has no thread objects — these are a flat chain of replies, so resolving one
          resolves the whole chain rather than a single reply.
        </p>
      ) : null}
      <ol className="divide-y divide-border/60" aria-label="Conversation">
        {timeline.map((entry) =>
          entry.type === 'thread' ? (
            <li key={entry.key} className="px-4 py-3">
              {renderThread(entry.thread)}
            </li>
          ) : (
            <TimelineComment key={entry.key} comment={entry.comment} hasThreads={entry.threads.length > 0}>
              {entry.threads.length > 0 ? (
                <ul className="mt-2 space-y-3" aria-label="Review threads">
                  {entry.threads.map((thread) => (
                    <li key={thread.id}>{renderThread(thread)}</li>
                  ))}
                </ul>
              ) : null}
            </TimelineComment>
          ),
        )}
      </ol>
    </>
  );
}

function TimelineComment({
  comment,
  hasThreads,
  children,
}: {
  comment: ForgeComment;
  hasThreads: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {comment.author ? (
          <UserAvatar
            login={comment.author}
            size={18}
            detail={comment.reviewState ? `Review: ${comment.reviewState}` : 'Comment'}
          />
        ) : null}
        <span className="font-medium">{comment.author || 'someone'}</span>
        {comment.reviewState !== null ? (
          <StatusPill status={reviewStatus(comment.reviewState)} />
        ) : null}
        <span className="text-muted-foreground/70 tabular-nums">
          {comment.createdAt.slice(0, 10)}
        </span>
        {/*
          Always shown, even for a one-line comment — a one-slide deck is
          a valid deck, not an error state to special-case around. Does
          NOT claim `activeMarkdown`: a thread can hold many bodies
          visible at once, and none of them is unambiguously "the"
          markdown a keyboard-invoked command should target (the rule in
          `slides-store.ts`) — only the two description-level surfaces do
          that.
        */}
        <PresentButton source={{ content: comment.body, label: 'Comment' }} className="ml-auto" />
      </div>

      {comment.body.length > 0 ? (
        <div
          data-selectable
          className={`mt-1 max-w-none text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}
        >
          {/*
            No `rehype-raw`, for the same reason `CommitMessage` refuses it:
            a comment body is text somebody else wrote, and allowing raw
            HTML through would make sanitisation this component's problem.
          */}
          <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
            {comment.body}
          </Markdown>
        </div>
      ) : hasThreads ? null : (
        // A verdict with no prose is a real and common event — "approved"
        // with nothing said. Rendering the pill and an empty block would
        // read as a failure to load the words.
        <p className="mt-1 text-xs italic text-muted-foreground">No message.</p>
      )}
      {children}
    </li>
  );
}

function Note({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <p className={`px-4 py-3 text-xs ${tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'}`}>
      {children}
    </p>
  );
}
