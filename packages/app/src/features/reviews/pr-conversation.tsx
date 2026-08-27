import type { ForgeComment } from '@midnite/git-shared';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { reviewStatus, StatusPill } from '../forge/forge-status';

/**
 * A pull request's top-level thread — discussion and review verdicts, merged.
 *
 * Read-only in this theme. Posting is Theme F's write path and lives in a
 * separate module for the reason `channels.ts` states: every read surface in
 * this app is one a stale cache can never turn into a write.
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
}: {
  comments: readonly ForgeComment[];
  isLoading: boolean;
  error: string | null;
  /** Why `gh` could not answer at all — see `notReady` in `pr-detail.tsx`. */
  notReady: string | null;
}) {
  // "Nobody has commented" is a claim about the pull request. It must not be
  // what a signed-out machine reads.
  if (notReady !== null) return <Note>{notReady}</Note>;
  if (error !== null) {
    return <Note tone="destructive">{error}</Note>;
  }
  if (isLoading && comments.length === 0) {
    return <Note>Reading the conversation…</Note>;
  }
  if (comments.length === 0) {
    return <Note>Nobody has commented on this pull request.</Note>;
  }

  return (
    <ol className="divide-y divide-border/60" aria-label="Conversation">
      {comments.map((comment) => (
        <li key={`${comment.kind}-${comment.id}`} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{comment.author || 'someone'}</span>
            {comment.reviewState !== null ? (
              <StatusPill status={reviewStatus(comment.reviewState)} />
            ) : null}
            <span className="text-muted-foreground/70 tabular-nums">
              {comment.createdAt.slice(0, 10)}
            </span>
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
          ) : (
            // A verdict with no prose is a real and common event — "approved"
            // with nothing said. Rendering the pill and an empty block would
            // read as a failure to load the words.
            <p className="mt-1 text-xs italic text-muted-foreground">No message.</p>
          )}
        </li>
      ))}
    </ol>
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
