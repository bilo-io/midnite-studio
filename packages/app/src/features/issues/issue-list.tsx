import type { CSSProperties } from 'react';

import type { ForgeIssue } from '@midnite/studio-shared';

import { useCascadeReveal } from '../../lib/use-cascade-reveal';
import { UserAvatar } from '../../components/user-avatar';
import { issueStatus, StatusPill } from '../forge/forge-status';
import { relativeAge, sortByUpdated } from './issue-order';
import { LabelChip } from './label-chip';

/**
 * The issue list — flat, newest-updated first.
 *
 * No grouping the way `RunList` sections by workflow: an issue has no
 * natural parent to group under, and "most recently updated" is already the
 * one ordering a reader arrives asking for (Theme C's own recorded
 * decision), so imposing headers here would be structure standing in for
 * one that does not exist.
 */
export function IssueList({
  repoId,
  issues,
  selectedNumber,
  now,
  onSelect,
}: {
  repoId: string;
  issues: readonly ForgeIssue[];
  selectedNumber: number | null;
  /** Passed in, not read from the clock — see `RunList`'s own `now` prop for why. */
  now: number;
  onSelect: (number: number) => void;
}) {
  const ordered = sortByUpdated(issues);
  // Theme K.2: this list unmounts on a view switch, so `repoId` alone gives
  // "first mount"/"reveal after hidden" for free; a repo switch is what
  // needs `repoId` in the key, and a query refresh (new `issues`, same
  // `repoId`) must never re-arm the cascade.
  const cascade = useCascadeReveal({ revealKey: repoId });

  return (
    <ul aria-label="Issues" className="min-h-0 flex-1 overflow-y-auto py-1">
      {ordered.map((issue, index) => (
        <li key={issue.number}>
          <IssueRow
            issue={issue}
            now={now}
            selected={issue.number === selectedNumber}
            onSelect={() => onSelect(issue.number)}
            cascading={cascade.active}
            cascadeStyle={cascade.styleFor(index + 1)}
          />
        </li>
      ))}
    </ul>
  );
}

function IssueRow({
  issue,
  now,
  selected,
  onSelect,
  cascading,
  cascadeStyle,
}: {
  issue: ForgeIssue;
  now: number;
  selected: boolean;
  onSelect: () => void;
  cascading: boolean;
  cascadeStyle: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      style={cascadeStyle}
      className={`flex w-full flex-col items-start gap-0.5 border-l-2 px-2 py-1.5 text-left text-[13px] transition-colors ${
        cascading ? 'animate-fade-in-up cascade-delay' : ''
      } ${selected ? 'border-primary bg-accent/40' : 'border-transparent hover:bg-accent/20'}`}
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <StatusPill status={issueStatus(issue)} />
        <span className="truncate">{issue.title}</span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
          #{issue.number}
        </span>
      </span>
      <span className="flex w-full min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        {issue.labels.slice(0, 3).map((label) => (
          <LabelChip key={label.name} label={label} />
        ))}
        {issue.author ? (
          <span className="inline-flex shrink-0 items-center gap-1">
            <UserAvatar login={issue.author} size={14} detail="Issue author" />
            <span className="shrink-0 truncate">{issue.author}</span>
          </span>
        ) : null}
        {issue.assignees.length > 0 ? (
          <span className="inline-flex -space-x-1 shrink-0">
            {issue.assignees.map((assignee) => (
              <UserAvatar
                key={assignee}
                login={assignee}
                size={14}
                className="border border-background"
                detail="Assignee"
              />
            ))}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 tabular-nums">{relativeAge(issue.updatedAt, now)}</span>
      </span>
    </button>
  );
}
