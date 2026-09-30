import { createContext, useContext, type ReactNode } from 'react';
import { LuMilestone } from 'react-icons/lu';

import type { ForgeIssue, ForgeProjectItem } from '@midnite/studio-shared';

import { lookupRepoIdByForge } from '../../services/repo-forge-registry';
import { openIssueModal } from '../../store/issue-modal-store';
import { fieldOptionChipStyle, type FieldOptionChipStyle } from './field-option-colors';
import { relativeAge } from './issue/issue-order';

/**
 * What Tasks knows about the repo's issues beyond what a board item carries —
 * provided once by `TasksView`, read by every row, card and node.
 *
 * A `ForgeProjectItem` has an issue's title, state, assignees and label
 * *names*, but not the label colours, milestone, author or last-updated time
 * the old Issues list showed. `TasksView` already fetches the repo's issue
 * list (it backs the Repo issues source), so an item from this repo is
 * enriched from that by number; an item from another repo simply shows what
 * it carries.
 */
export type TaskIssueContextValue = {
  /** The active repo's issues (state `all`), by number. */
  issuesByNumber: ReadonlyMap<number, ForgeIssue>;
  repoId: string | null;
  /** `owner/name` — what `content.repo` reads for an item from this repo. */
  repoName: string;
  /**
   * `false` on the Repo issues source, where the synthetic `Status` field
   * already paints Open/Closed — a second state pill would say it twice.
   */
  showState: boolean;
  /** Passed in rather than read per row, so one render reads one clock. */
  now: number;
};

const TaskIssueContext = createContext<TaskIssueContextValue | null>(null);

export function TaskIssueProvider({ value, children }: { value: TaskIssueContextValue; children: ReactNode }) {
  return <TaskIssueContext.Provider value={value}>{children}</TaskIssueContext.Provider>;
}

function isSameRepo(ctx: TaskIssueContextValue, repo: string): boolean {
  if (!repo) return true;
  return ctx.repoName !== '' && repo.toLowerCase() === ctx.repoName.toLowerCase();
}

/** `https://host/owner/repo/issues/12` → the registered repo id it names, if any. */
function repoIdFromIssueUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    return owner && repo ? lookupRepoIdByForge(parsed.host, owner, repo) : null;
  } catch {
    return null;
  }
}

/**
 * The click handler for an issue item's link — opens the app-wide issue modal
 * — or `undefined` when there is none to give: not an issue, no provider
 * (a caller outside Tasks), or an issue in a repo this app has not
 * registered, which keeps its plain external link.
 */
export function useOpenIssue(item: ForgeProjectItem | undefined): (() => void) | undefined {
  const ctx = useContext(TaskIssueContext);
  if (!ctx || item?.content.type !== 'issue') return undefined;
  const { number, repo, url } = item.content;
  const sameRepo = isSameRepo(ctx, repo);
  const repoId = sameRepo ? ctx.repoId : repoIdFromIssueUrl(url);
  if (repoId === null) return undefined;
  const seed = sameRepo ? ctx.issuesByNumber.get(number) : undefined;
  return () => openIssueModal({ repoId, number, ...(seed ? { seed } : {}) });
}

type Density = 'row' | 'card' | 'node';

/** How much each view carries — a 32px table row and a zoomable node have less room than a card. */
const LABEL_LIMIT: Record<Density, number> = { row: 2, card: 3, node: 2 };

const STATE_COLOR: Record<string, string> = { open: 'GREEN', closed: 'PURPLE', merged: 'PURPLE' };
const STATE_LABEL: Record<string, string> = { open: 'Open', closed: 'Closed', merged: 'Merged' };

function ColoredPill({ kind, chip, children }: { kind: string; chip: FieldOptionChipStyle; children: ReactNode }) {
  return (
    <span
      data-issue-pill={kind}
      data-card-chip
      style={{ color: chip.color, backgroundColor: chip.backgroundColor, borderColor: chip.borderColor }}
      className="inline-flex max-w-[9rem] shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: chip.color }} />
      <span className="truncate">{children}</span>
    </span>
  );
}

function PlainPill({ kind, title, children }: { kind: string; title?: string; children: ReactNode }) {
  return (
    <span
      data-issue-pill={kind}
      data-card-chip
      title={title}
      className="inline-flex max-w-[9rem] shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
    >
      {children}
    </span>
  );
}

/**
 * An issue's (or PR's) extra tags — state, labels, milestone and, in a table
 * row, how long ago it was updated — in the same rounded-full pill a board
 * field chip wears (`CardFieldChips`), never `LabelChip`'s solid GitHub fill,
 * so the whole view reads as one family. A label's own colour, when the repo
 * issue list supplies it, is the pill's dot and tint.
 */
export function IssuePills({ item, density }: { item: ForgeProjectItem; density: Density }) {
  const ctx = useContext(TaskIssueContext);
  if (item.content.type === 'draft') return null;
  const content = item.content;
  const meta = content.type === 'issue' && ctx && isSameRepo(ctx, content.repo) ? ctx.issuesByNumber.get(content.number) : undefined;

  const labelColors = new Map(meta?.labels.map((label) => [label.name, label.color]) ?? []);
  const labels = content.labels;
  const limit = LABEL_LIMIT[density];
  const shownLabels = labels.slice(0, limit);
  const hiddenLabels = labels.length - shownLabels.length;
  const milestone = density === 'node' ? null : (meta?.milestone?.title ?? null);
  const updated = density === 'row' && meta && ctx ? relativeAge(meta.updatedAt, ctx.now) : '';
  const showState = ctx?.showState ?? true;

  if (!showState && shownLabels.length === 0 && !milestone && !updated) return null;

  return (
    <span className={`flex min-w-0 items-center gap-1 ${density === 'row' ? 'shrink-[4] flex-nowrap overflow-hidden' : 'flex-wrap'}`} data-issue-pills>
      {showState ? (
        <ColoredPill kind="state" chip={fieldOptionChipStyle(STATE_COLOR[content.state])}>
          {STATE_LABEL[content.state] ?? content.state}
        </ColoredPill>
      ) : null}
      {shownLabels.map((name) => {
        const color = labelColors.get(name);
        return color ? (
          <ColoredPill key={name} kind="label" chip={fieldOptionChipStyle(`#${color}`)}>
            {name}
          </ColoredPill>
        ) : (
          <PlainPill key={name} kind="label" title={name}>
            <span className="truncate">{name}</span>
          </PlainPill>
        );
      })}
      {hiddenLabels > 0 ? (
        <PlainPill kind="more-labels" title={labels.slice(limit).join(', ')}>
          +{hiddenLabels}
        </PlainPill>
      ) : null}
      {milestone ? (
        <PlainPill kind="milestone" title={`Milestone: ${milestone}`}>
          <LuMilestone aria-hidden className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{milestone}</span>
        </PlainPill>
      ) : null}
      {updated ? (
        <PlainPill kind="updated" title={`Updated ${meta?.updatedAt ?? ''}`}>
          {updated}
        </PlainPill>
      ) : null}
    </span>
  );
}
