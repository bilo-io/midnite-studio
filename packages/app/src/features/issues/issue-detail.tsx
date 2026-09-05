import type { ForgeIssue } from '@midnite/studio-shared';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useForgeIssueComments, useForgeIssueDetail } from '../../services/queries';
import { issueStatus, StatusPill } from '../forge/forge-status';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { IssueActionBar } from './issue-action-bar';
import { IssueConversation } from './issue-conversation';
import { IssueDetailSkeleton } from './issues-skeletons';
import { LabelChip } from './label-chip';
import { UserAvatar } from '../../components/user-avatar';

/**
 * One issue, read in full — one pane, not tabs.
 *
 * A pull request earns three tabs because it has files and checks; an issue
 * has a body and a conversation, which is one scroll (Theme C's own recorded
 * decision). The header (title, state, labels, assignees, milestone) stays
 * fixed above that scroll, the same split `PrDetail` draws between its own
 * header and its tab content.
 */
export function IssueDetail({ repoId, issue }: { repoId: string; issue: ForgeIssue }) {
  const detail = useForgeIssueDetail(repoId, issue.number);
  const comments = useForgeIssueComments(repoId, issue.number, true);

  const body = detail.data?.issue?.body ?? null;
  const error = detail.data?.error ?? null;
  // Both queries have to settle before the pane is final — resolving early on
  // just the body would show "Nobody has commented" while comments are still
  // in flight, and resolving early on just comments would flash the skeleton
  // then swap the body in underneath it.
  const loading = detail.isLoading || (comments.isLoading && comments.data === undefined);

  return (
    <section aria-label="Issue detail" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusPill status={issueStatus(issue)} />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{issue.title}</h2>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">#{issue.number}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {issue.author ? (
            <span className="inline-flex items-center gap-1.5">
              <span>Opened by</span>
              <UserAvatar login={issue.author} size={16} detail="Author" />
              <span className="font-medium text-foreground">{issue.author}</span>
            </span>
          ) : null}
          {issue.labels.map((label) => (
            <LabelChip key={label.name} label={label} />
          ))}
          {issue.assignees.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span>Assigned:</span>
              <span className="inline-flex -space-x-1">
                {issue.assignees.map((assignee) => (
                  <UserAvatar
                    key={assignee}
                    login={assignee}
                    size={16}
                    className="border border-background"
                    detail="Assignee"
                  />
                ))}
              </span>
              <span className="truncate">{issue.assignees.join(', ')}</span>
            </span>
          ) : null}
          {issue.milestone !== null ? <span className="truncate">{issue.milestone.title}</span> : null}
        </div>
      </div>

      {/*
        Outside the scroll on purpose, the same reason `PrDetail` keeps
        `ReviewActionBar` outside its tabpanel: these actions apply to the
        issue, not to one part of it, so they stay put while the body and
        conversation scroll underneath.
      */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <IssueActionBar repoId={repoId} issue={issue} />
      </div>

      {loading ? (
        <IssueDetailSkeleton />
      ) : error !== null ? (
        <p className="px-4 py-3 text-xs text-destructive">{error}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {body !== null && body.length > 0 ? (
            <div
              data-selectable
              className={`max-w-none px-4 py-3 text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}
            >
              {/* No `rehype-raw` — an issue body is text somebody else wrote. */}
              <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
                {body}
              </Markdown>
            </div>
          ) : (
            <p className="px-4 py-3 text-xs italic text-muted-foreground">No description.</p>
          )}

          <IssueConversation comments={comments.data?.comments ?? []} />
        </div>
      )}
    </section>
  );
}
