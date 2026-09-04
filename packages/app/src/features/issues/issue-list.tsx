import type { ForgeIssue } from '@midnite/studio-shared';

import { cascadeStyle } from '../../lib/cascade';
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
  issues,
  selectedNumber,
  now,
  onSelect,
}: {
  issues: readonly ForgeIssue[];
  selectedNumber: number | null;
  /** Passed in, not read from the clock — see `RunList`'s own `now` prop for why. */
  now: number;
  onSelect: (number: number) => void;
}) {
  const ordered = sortByUpdated(issues);

  return (
    <ul aria-label="Issues" className="min-h-0 flex-1 overflow-y-auto py-1">
      {ordered.map((issue, index) => (
        <li key={issue.number}>
          <IssueRow
            issue={issue}
            index={index + 1}
            now={now}
            selected={issue.number === selectedNumber}
            onSelect={() => onSelect(issue.number)}
          />
        </li>
      ))}
    </ul>
  );
}

function IssueRow({
  issue,
  index,
  now,
  selected,
  onSelect,
}: {
  issue: ForgeIssue;
  index: number;
  now: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      style={cascadeStyle(index)}
      className={`flex w-full animate-fade-in-up cascade-delay flex-col items-start gap-0.5 border-l-2 px-2 py-1.5 text-left text-[13px] transition-colors ${
        selected ? 'border-primary bg-accent/40' : 'border-transparent hover:bg-accent/20'
      }`}
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
        {issue.author ? <span className="shrink-0 truncate">{issue.author}</span> : null}
        <span className="ml-auto shrink-0 tabular-nums">{relativeAge(issue.updatedAt, now)}</span>
      </span>
    </button>
  );
}
