import { useState } from 'react';

import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  GitPullRequest,
  MoreVertical,
  Play,
  RefreshCw,
} from 'lucide-react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { TREE_INDENT } from '../../components/tree-indent';
import { TreeSection } from '../../components/tree-section';
import { cascadeStyle } from '../../lib/cascade';
import {
  openExternal,
  useForgeIssues,
  useForgePulls,
  useForgeRunDetail,
  useForgeRuns,
  useRefreshForge,
} from '../../services/queries';
import { useActionsStore } from '../../store/actions-store';
import { useReviewsStore } from '../../store/reviews-store';
import { useUiStore } from '../../store/ui-store';
import {
  checksStatus,
  issueStatus,
  jobStatus,
  pullStatus,
  runStatus,
  StatusPill,
  type ForgeStatus,
} from '../forge/forge-status';
import { REVIEW_GROUPS, type ReviewGroup } from '../reviews/review-groups';

/**
 * A repository's CI runs, in the sidebar tree — one of Forge's four children
 * (Phase 28 Theme F), rendered by `RepoTree`'s generic section walk exactly
 * like `TestsSection`, rather than through the opaque pair this file used to
 * export as `ForgeSections`. `RepoTree` has already decided the repo has a
 * GitHub remote before this ever mounts, so there is no gate here — see
 * `hasGithubForge` at its one call site.
 *
 * Lazy on its own fold state: an unopened section issues no query, and a
 * query is a `gh` subprocess plus an API request against the user's rate
 * limit. That is a stronger gate than the rest of the tree needs — refs cost
 * a local `for-each-ref` — and it is why this defaults to CLOSED while Local
 * and Worktrees default to open.
 */
export function ActionsSection({
  repoId,
  index,
  depth,
}: {
  repoId: string;
  /** Cascade offset, so this animates in with the rest of the tree. */
  index: number;
  /** The generic walk's own depth for this node — `2`, since Forge sits at 1. */
  depth: 1 | 2;
}) {
  const [open, setOpen] = useState(false);
  const selectRun = useActionsStore((s) => s.selectRun);
  const selectRepo = useUiStore((s) => s.selectRepo);
  /*
    One run expanded at a time, by id rather than by a set.

    Each expansion is a `gh run view` subprocess against a rate-limited API, so
    "expand all" would be a way to spend a user's quota with one click. It also
    matches what the sidebar is for: you are looking at why THIS run failed.
  */
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const { data, isFetching } = useForgeRuns(repoId, open);
  const refresh = useRefreshForge(repoId);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const dialogs = useDialogs();

  const runs = data?.runs ?? [];

  return (
    <TreeSection
      title="Actions"
      count={open ? runs.length : undefined}
      icon={<Play aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={depth}
      // A section that hid itself when empty could never show the "gh is not
      // signed in" card, which is the one state the user can actually fix.
      hideWhenEmpty={false}
      action={
        open
          ? {
              icon: RefreshCw,
              label: 'Refresh workflow runs',
              onClick: refresh,
            }
          : undefined
      }
    >
      <Unavailable
        result={data}
        isFetching={isFetching}
        empty="No workflow runs yet."
        depth={(depth + 1) as 2 | 3}
      />

      {runs.map((run, i) => (
        <ForgeRow
          key={run.id}
          index={i + index}
          depth={(depth + 1) as 2 | 3}
          status={runStatus(run)}
          title={run.name}
          subtitle={[run.headBranch ?? 'detached', run.event].filter(Boolean).join(' · ')}
          menu={forgeRowMenu(run.url, 'run')}
          dialogs={dialogs}
          expand={{
            open: expandedRun === run.id,
            /*
              Named by run, not by workflow. Twenty rows drawn from a handful of
              workflows means a dozen buttons called "Jobs in CI" — which a
              screen reader cannot tell apart, and which a `getByRole` locator
              cannot either. The run number is the thing that differs.
            */
            label: run.number === null ? `Jobs in ${run.name}` : `Jobs in ${run.name} #${run.number}`,
            onToggle: () => setExpandedRun((current) => (current === run.id ? null : run.id)),
          }}
          /*
            The Actions view, not a Changes tab.

            Phase 17 opened a run into the workbench because there was nowhere
            else for it to go. Theme E built somewhere: a run list, its job
            tree and its log. Two places rendering the same run differently,
            depending on how you arrived, is one place too many — so the row
            selects the run and switches to the view that can actually read it.
            The `run` tab kind stays in the store for any tab already open; it
            is simply no longer created.
          */
          onOpen={() => {
            /*
              The repository first, and it is load-bearing.

              Every repo card in the sidebar is expanded by default, so this row
              can be clicked while a DIFFERENT repo is selected — and the
              Actions view follows `selectedRepoId`, not the row. Without this
              the view opens on the other repository's runs and the run you
              clicked is nowhere in it; worse, if that repository has no GitHub
              remote the rail hides Actions and `app.tsx` bounces you to Graph.
              The workbench tab this replaced carried its own `repoId`, so
              omitting it here was a regression, not a new gap.
            */
            selectRepo(repoId);
            selectRun(repoId, run.id);
            setActiveView('actions');
          }}
        >
          {expandedRun === run.id ? (
            <RunJobs repoId={repoId} runId={run.id} depth={(depth + 2) as 3 | 4} />
          ) : null}
        </ForgeRow>
      ))}
    </TreeSection>
  );
}

/**
 * The job tree of one run, inline under its row.
 *
 * A peek, not the Actions view — Phase 19 Theme E builds that, with the step
 * tree and the log pane. What this answers is the question the sidebar is
 * already being asked: the red dot says the run failed, and this says which job.
 * Fetched only while the row is expanded, for the usual subprocess reason.
 */
function RunJobs({
  repoId,
  runId,
  depth,
}: {
  repoId: string;
  runId: string;
  /** One rung deeper than the run row it hangs off. */
  depth: 3 | 4;
}) {
  const { data, isFetching } = useForgeRunDetail(repoId, runId, true);

  if (!data) return isFetching ? <Note depth={depth}>Reading the run…</Note> : null;

  /*
    The same four empties the sections above distinguish, one level down.

    The probe is cached for only 30 seconds, so `gh auth logout` in the terminal
    beside the app is reachable between listing a run and expanding it — and
    without this the peek would answer "no jobs", which is a claim about the run
    rather than about the CLI.
  */
  if (data.cli.reason !== 'ready') {
    return <Note depth={depth}>{data.cli.hint || 'The GitHub CLI is unavailable.'}</Note>;
  }
  if (data.error) return <Note depth={depth} tone="destructive">{data.error}</Note>;

  const jobs = data.detail?.jobs ?? [];
  if (jobs.length === 0) return <Note depth={depth}>No jobs in this run.</Note>;

  return (
    <ul className={`${depth === 4 ? 'ml-17' : 'ml-14'} border-l border-border/60 pb-1 pl-2`}>
      {jobs.map((job) => (
        <li key={job.id} className="flex items-center gap-1.5 py-0.5 pr-2 text-[12px]">
          <StatusPill status={jobStatus(job)} />
          <button
            type="button"
            onClick={() => openExternal(job.url)}
            disabled={job.url.length === 0}
            className="min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline"
            title={job.url ? `Open ${job.name} on GitHub` : job.name}
          >
            {job.name}
          </button>
          {/*
            Step counts rather than the steps themselves: a matrix job runs
            thirty of them, and the sidebar is 260px wide. The tree belongs in
            the Actions view.
          */}
          {job.steps.length > 0 ? (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {job.steps.length} steps
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * A repository's open issues.
 *
 * Closed by default and `enabled: false` until opened, exactly like its two
 * siblings and for exactly the same reason: opening it costs a `gh` subprocess
 * and a request against the user's rate limit.
 */
export function IssuesSection({
  repoId,
  index,
  depth,
}: {
  repoId: string;
  index: number;
  depth: 1 | 2;
}) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useForgeIssues(repoId, open);
  const refresh = useRefreshForge(repoId);
  const dialogs = useDialogs();

  const issues = data?.issues ?? [];

  return (
    <TreeSection
      title="Issues"
      count={open ? issues.length : undefined}
      icon={<CircleDot aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={depth}
      hideWhenEmpty={false}
      action={open ? { icon: RefreshCw, label: 'Refresh issues', onClick: refresh } : undefined}
    >
      {/*
        A repository with its issue tracker switched off is behaving as its
        owner configured it, so it gets a sentence rather than the red card an
        `error` would draw. It is also the reason `disabled` is a field of its
        own and not a message — the dashboard reads it to drop the widget.
      */}
      {data?.disabled ? (
        <Note depth={(depth + 1) as 2 | 3}>Issues are turned off for this repository.</Note>
      ) : (
        <Unavailable
          result={data}
          isFetching={isFetching}
          empty="No open issues."
          depth={(depth + 1) as 2 | 3}
        />
      )}

      {issues.map((issue, i) => (
        <ForgeRow
          key={issue.number}
          index={i + index}
          depth={(depth + 1) as 2 | 3}
          status={issueStatus(issue)}
          title={issue.title}
          subtitle={[
            `#${issue.number}`,
            issue.author ? `by ${issue.author}` : null,
            issue.labels.length > 0 ? issue.labels.map((l) => l.name).join(', ') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          menu={forgeRowMenu(issue.url, 'issue')}
          dialogs={dialogs}
          onOpen={() => openExternal(issue.url)}
        />
      ))}
    </TreeSection>
  );
}

/**
 * A repository's pull requests, split into the three questions a reviewer
 * actually arrives with.
 *
 * The section itself now fetches nothing: it is a heading over three lazy
 * groups (`REVIEW_GROUPS`), each of which is a `gh pr list` of its own and
 * stays unasked until it is opened. That is the same rate-limit gate the
 * section as a whole already applied, one level finer — three collapsed groups
 * cost exactly what one collapsed section used to, and a reader who only ever
 * opens "Awaiting My Review" never pays for the other two.
 *
 * Refresh stays on the section rather than repeating on each group, because
 * `useRefreshForge` invalidates the repository's whole forge prefix anyway: a
 * per-group button would claim a precision it does not have.
 */
export function ReviewsSection({
  repoId,
  index,
  depth,
}: {
  repoId: string;
  index: number;
  depth: 1 | 2;
}) {
  const [open, setOpen] = useState(false);
  const refresh = useRefreshForge(repoId);

  return (
    <TreeSection
      title="Reviews"
      icon={<GitPullRequest aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={depth}
      hideWhenEmpty={false}
      action={
        open ? { icon: RefreshCw, label: 'Refresh pull requests', onClick: refresh } : undefined
      }
    >
      {REVIEW_GROUPS.map((group, i) => (
        <ReviewsGroup
          key={group.scope}
          repoId={repoId}
          group={group}
          sectionOpen={open}
          index={index + i}
          depth={(depth + 1) as 2 | 3}
        />
      ))}
    </TreeSection>
  );
}

/**
 * One scoped pull-request listing, inside the Reviews section.
 *
 * `sectionOpen` is not decoration. `TreeSection` renders its children into a
 * `<Collapse>`, which clips and `inert`s them but keeps them MOUNTED — so a
 * group left open from a previous visit would keep issuing its `gh` subprocess
 * while the section above it is shut. Both fold states have to agree before
 * this is allowed to ask.
 */
function ReviewsGroup({
  repoId,
  group,
  sectionOpen,
  index,
  depth,
}: {
  repoId: string;
  group: ReviewGroup;
  sectionOpen: boolean;
  index: number;
  depth: 2 | 3;
}) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useForgePulls(repoId, sectionOpen && open, 20, 'open', group.scope);
  const selectRepo = useUiStore((s) => s.selectRepo);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const selectPull = useReviewsStore((s) => s.selectPull);
  const dialogs = useDialogs();

  const pulls = data?.pulls ?? [];

  return (
    <TreeSection
      title={group.title}
      /* No number until the fetch answers — "0" while it is out is a claim. */
      count={open && data !== undefined ? pulls.length : undefined}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={depth}
      hideWhenEmpty={false}
    >
      <Unavailable
        result={data}
        isFetching={isFetching}
        empty={group.empty}
        depth={(depth + 1) as 3 | 4}
      />

      {pulls.map((pull, i) => (
        <ForgeRow
          key={pull.number}
          index={i + index}
          depth={(depth + 1) as 3 | 4}
          status={pullStatus(pull)}
          extra={checksStatus(pull)}
          title={pull.title}
          subtitle={`#${pull.number} · ${pull.headBranch}`}
          menu={forgeRowMenu(pull.url, 'pull request')}
          dialogs={dialogs}
          /*
            The Reviews view, not a Changes tab — the same move Phase 19 made
            for Actions runs (see ActionsSection's own row above). The repo
            selection has to come first for the same reason: this row can be
            clicked while a different repo is selected, and the Reviews view
            follows `selectedRepoId`, not the row.
          */
          onOpen={() => {
            selectRepo(repoId);
            selectPull(repoId, pull.number);
            setActiveView('reviews');
          }}
        />
      ))}
    </TreeSection>
  );
}

const forgeRowMenu = (url: string, what: string): MenuItem[] => [
  { label: `Open ${what} on GitHub`, icon: ExternalLink, onSelect: () => openExternal(url) },
  {
    label: 'Copy link',
    icon: Copy,
    onSelect: () => void navigator.clipboard?.writeText(url).catch(() => undefined),
  },
];

/**
 * Why a section has nothing in it — which is never just "nothing".
 *
 * Four different empties, and conflating them is the difference between a user
 * running `gh auth login` and a user assuming the feature is broken: the CLI is
 * missing, the CLI is signed out, the call failed, or the repository genuinely
 * has no runs yet. Only the last one is a normal state.
 */
function Unavailable({
  result,
  isFetching,
  empty,
  depth,
}: {
  result: { cli: { reason: string; hint: string }; error: string | null } | undefined;
  isFetching: boolean;
  empty: string;
  /** Matches the rows this note stands in for — one rung deeper inside a Reviews group. */
  depth: 2 | 3 | 4;
}) {
  if (!result) {
    return isFetching ? <Note depth={depth}>Asking GitHub…</Note> : null;
  }

  if (result.cli.reason !== 'ready') {
    return <Note depth={depth}>{result.cli.hint || 'The GitHub CLI is unavailable.'}</Note>;
  }

  if (result.error) {
    return (
      <Note depth={depth} tone="destructive">
        {result.error}
      </Note>
    );
  }

  return <EmptyIfNoRows depth={depth}>{empty}</EmptyIfNoRows>;
}

/**
 * The "no rows" line, rendered as a sibling of the rows rather than instead of
 * them. `TreeSection`'s children are a fragment, so this cannot know whether
 * any rows follow it — CSS can: the note hides itself whenever a row is present.
 */
function EmptyIfNoRows({ children, depth }: { children: React.ReactNode; depth: 2 | 3 | 4 }) {
  return (
    <p
      className={`${TREE_INDENT[depth]} py-1.5 pr-2 text-xs text-muted-foreground [&:not(:last-child)]:hidden`}
    >
      {children}
    </p>
  );
}

function Note({
  children,
  tone = 'muted',
  depth,
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
  /**
   * Where the note sits on the tree's indent ladder — one rung deeper for a
   * note that belongs to a row (a run's jobs) or to a group nested inside a
   * section (the Reviews scopes) than for one that belongs to the section
   * itself.
   */
  depth: 2 | 3 | 4;
}) {
  return (
    <p
      className={`${TREE_INDENT[depth]} py-1.5 pr-2 text-xs leading-relaxed ${
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {children}
    </p>
  );
}

/**
 * Two ladders, because a row's leading mark is not always the same element.
 *
 * `ROW_INDENT` is where a row whose first element is its status pill sits;
 * `EXPANDABLE_INDENT` is one rung shallower, for a row that leads with a
 * disclosure chevron — so both land their leading mark in the same column.
 * Spelled as literal maps rather than `TREE_INDENT[depth - 1]` because
 * `noUncheckedIndexedAccess` makes an arithmetic index `string | undefined`,
 * and a Tailwind class that can be `undefined` is a silently unindented row.
 */
const ROW_INDENT = { 2: TREE_INDENT[2], 3: TREE_INDENT[3], 4: TREE_INDENT[4] } as const;
const EXPANDABLE_INDENT = { 2: TREE_INDENT[1], 3: TREE_INDENT[2], 4: TREE_INDENT[3] } as const;

function ForgeRow({
  index,
  depth,
  status,
  extra,
  title,
  subtitle,
  menu,
  dialogs,
  onOpen,
  expand,
  children,
}: {
  index: number;
  /** One rung deeper for a row inside a nested group (a Reviews scope) than for one directly under a section. */
  depth: 2 | 3 | 4;
  /*
    `ForgeStatus`, not a re-spelled copy of its fields. The inline literal that
    used to sit here was already a duplicate of the exported type, and it broke
    the moment a status grew a glyph — a row that draws a `StatusPill` has no
    business describing the pill's own contract in a second place.
  */
  status: ForgeStatus;
  extra?: ForgeStatus | null;
  title: string;
  subtitle: string;
  menu: MenuItem[];
  dialogs: ReturnType<typeof useDialogs>;
  onOpen: () => void;
  /**
   * A disclosure control, separate from `onOpen`.
   *
   * Two verbs, two controls: the row's body opens the run in a workbench tab,
   * and the chevron peeks at its jobs in place. Overloading one click with both
   * would make "show me why it failed" also change which view you are in.
   */
  expand?: { open: boolean; label: string; onToggle: () => void };
  /** Rendered under the row while `expand.open`. */
  children?: React.ReactNode;
}) {
  return (
    <>
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          dialogs.openMenu(event, menu);
        }}
        style={cascadeStyle(index)}
        className={`group flex animate-fade-in-up cascade-delay items-center gap-1.5 py-0.5 pr-2 text-[13px] transition-colors hover:bg-accent/30 ${
          /*
            A row with a disclosure chevron puts that chevron in the glyph
            column, so it indents one rung shallower than a row whose leading
            element is its status pill — both land their leading mark in the
            same place.
          */
          expand ? EXPANDABLE_INDENT[depth] : ROW_INDENT[depth]
        }`}
      >
        {expand ? (
          <IconButton
            icon={expand.open ? ChevronDown : ChevronRight}
            label={expand.label}
            size="sm"
            aria-expanded={expand.open}
            onClick={expand.onToggle}
          />
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <StatusPill status={status} />
            {extra ? <StatusPill status={extra} /> : null}
            <span className="truncate">{title}</span>
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
        </button>

        <IconButton
          icon={MoreVertical}
          label={`Actions for ${title}`}
          size="sm"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            dialogs.openMenu(
              { clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom },
              menu,
            );
          }}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>
      {children}
    </>
  );
}
