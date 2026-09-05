import type { ForgeComment } from '@midnite/studio-shared';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { UserAvatar } from '../../components/user-avatar';

/**
 * An issue's comment thread — read-only, the same posture Theme C's own
 * checklist gives the body. Writing a comment is Theme G's job.
 *
 * `ForgeComment` is the exact type `PrConversation` (`features/reviews/`)
 * renders too, but this stays its own small component rather than a shared
 * import: an issue's conversation carries no review verdicts (`reviewState`
 * is always `null` here), so there is nothing to reuse beyond the markdown
 * primitives both already share.
 */
export function IssueConversation({ comments }: { comments: readonly ForgeComment[] }) {
  if (comments.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">Nobody has commented on this issue.</p>;
  }

  return (
    <ol className="divide-y divide-border/60 border-t border-border/60" aria-label="Conversation">
      {comments.map((comment) => (
        <li key={comment.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {comment.author ? (
              <UserAvatar login={comment.author} size={18} detail="Comment" />
            ) : null}
            <span className="font-medium">{comment.author || 'someone'}</span>
            <span className="text-muted-foreground/70 tabular-nums">{comment.createdAt.slice(0, 10)}</span>
          </div>

          {comment.body.length > 0 ? (
            <div data-selectable className={`mt-1 max-w-none text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}>
              {/* No `rehype-raw` — a comment body is someone else's text. */}
              <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
                {comment.body}
              </Markdown>
            </div>
          ) : (
            <p className="mt-1 text-xs italic text-muted-foreground">No message.</p>
          )}
        </li>
      ))}
    </ol>
  );
}
