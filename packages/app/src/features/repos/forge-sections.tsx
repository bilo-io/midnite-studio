import { useState } from 'react';

import type { Remote } from '@midnite/git-shared';
import { pickForgeRemote } from '@midnite/git-shared';
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  GitPullRequest,
  MoreVertical,
  Play,
  RefreshCw,
} from 'lucide-react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
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
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import {
  checksStatus,
  issueStatus,
  jobStatus,
  pullStatus,
  runStatus,
  StatusPill,
} from '../forge/forge-status';
import type { SectionKey } from './view-sections';

/**
 * A repository's CI runs and open pull requests, in the sidebar tree.
 *
 * Both sections are lazy on their own fold state: an unopened section issues no
 * query, and a query is a `gh` subprocess plus an API request against the
 * user's rate limit. That is a stronger gate than the rest of the tree needs —
 * refs cost a local `for-each-ref` — and it is why these default to CLOSED
 * while Local and Worktrees default to open.
 *
 * Absent entirely for a repository with no GitHub remote. `gh` speaks GitHub
 * only, so for a GitLab or local-path remote there is nothing here that could
 * ever load; the same reasoning keeps the forge link off a `RemoteGroup` it
 * cannot resolve. A section that is permanently empty is not a section.
 */
export function ForgeSections({
  repoId,
  remotes,
  index,
  visible,
}: {
  repoId: string;
  remotes: readonly Remote[];
  /** Cascade offset, so these animate in with the rest of the tree. */
  index: number;
  /**
   * Whether the active view shows a given section, from the one table in
   * `view-sections.ts`.
   *
   * Passed in rather than read from the store here so that "which sections does
   * this view show" has exactly one answer. A forge section that consulted the
   * view itself would be a second answer, free to disagree with the tree above
   * it — and the two would drift the first time a view was added to only one of
   * them.
   */
  visible: (key: SectionKey) => boolean;
}) {
  const forge = pickForgeRemote(remotes)?.forge ?? null;
  if (forge?.kind !== 'github') return null;

  return (
    <>
      {visible('actions') ? <ActionsSection repoId={repoId} index={index} /> : null}
      {visible('reviews') ? <ReviewsSection repoId={repoId} index={index + 1} /> : null}
      {visible('issues') ? <IssuesSection repoId={repoId} index={index + 2} /> : null}
    </>
  );
}

function ActionsSection({ repoId, index }: { repoId: string; index: number }) {
  const [open, setOpen] = useState(false);
  /*
    One run expanded at a time, by id rather than by a set.

    Each expansion is a `gh run view` subprocess against a rate-limited API, so
    "expand all" would be a way to spend a user's quota with one click. It also
    matches what the sidebar is for: you are looking at why THIS run failed.
  */
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const { data, isFetching } = useForgeRuns(repoId, open);
  const refresh = useRefreshForge(repoId);
  const openTab = useWorkbenchStore((s) => s.openTab);
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
      depth={1}
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
      <Unavailable result={data} isFetching={isFetching} empty="No workflow runs yet." />

      {runs.map((run, i) => (
        <ForgeRow
          key={run.id}
          index={i + index}
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
          onOpen={() => {
            openTab({
              kind: 'run',
              repoId,
              runId: run.id,
              label: `${run.name} · ${run.headBranch ?? 'detached'}`,
              url: run.url,
            });
            setActiveView('changes');
          }}
        >
          {expandedRun === run.id ? <RunJobs repoId={repoId} runId={run.id} /> : null}
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
function RunJobs({ repoId, runId }: { repoId: string; runId: string }) {
  const { data, isFetching } = useForgeRunDetail(repoId, runId, true);

  if (!data) return isFetching ? <Note indent>Reading the run…</Note> : null;

  /*
    The same four empties the sections above distinguish, one level down.

    The probe is cached for only 30 seconds, so `gh auth logout` in the terminal
    beside the app is reachable between listing a run and expanding it — and
    without this the peek would answer "no jobs", which is a claim about the run
    rather than about the CLI.
  */
  if (data.cli.reason !== 'ready') {
    return <Note indent>{data.cli.hint || 'The GitHub CLI is unavailable.'}</Note>;
  }
  if (data.error) return <Note indent tone="destructive">{data.error}</Note>;

  const jobs = data.detail?.jobs ?? [];
  if (jobs.length === 0) return <Note indent>No jobs in this run.</Note>;

  return (
    <ul className="border-l border-border/60 pb-1 pl-2 ml-10">
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
function IssuesSection({ repoId, index }: { repoId: string; index: number }) {
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
      depth={1}
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
        <Note>Issues are turned off for this repository.</Note>
      ) : (
        <Unavailable result={data} isFetching={isFetching} empty="No open issues." />
      )}

      {issues.map((issue, i) => (
        <ForgeRow
          key={issue.number}
          index={i + index}
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

function ReviewsSection({ repoId, index }: { repoId: string; index: number }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useForgePulls(repoId, open);
  const refresh = useRefreshForge(repoId);
  const openTab = useWorkbenchStore((s) => s.openTab);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const dialogs = useDialogs();

  const pulls = data?.pulls ?? [];

  return (
    <TreeSection
      title="Reviews"
      count={open ? pulls.length : undefined}
      icon={<GitPullRequest aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={1}
      hideWhenEmpty={false}
      action={
        open ? { icon: RefreshCw, label: 'Refresh pull requests', onClick: refresh } : undefined
      }
    >
      <Unavailable result={data} isFetching={isFetching} empty="No open pull requests." />

      {pulls.map((pull, i) => (
        <ForgeRow
          key={pull.number}
          index={i + index}
          status={pullStatus(pull)}
          extra={checksStatus(pull)}
          title={pull.title}
          subtitle={`#${pull.number} · ${pull.headBranch}`}
          menu={forgeRowMenu(pull.url, 'pull request')}
          dialogs={dialogs}
          onOpen={() => {
            openTab({
              kind: 'review',
              repoId,
              number: pull.number,
              label: `#${pull.number} ${pull.title}`,
              url: pull.url,
            });
            setActiveView('changes');
          }}
        />
      ))}
    </TreeSection>
  );
}

const forgeRowMenu = (url: string, what: string): MenuItem[] => [
  { label: `Open ${what} on GitHub`, onSelect: () => openExternal(url) },
  {
    label: 'Copy link',
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
}: {
  result: { cli: { reason: string; hint: string }; error: string | null } | undefined;
  isFetching: boolean;
  empty: string;
}) {
  if (!result) {
    return isFetching ? <Note>Asking GitHub…</Note> : null;
  }

  if (result.cli.reason !== 'ready') {
    return <Note>{result.cli.hint || 'The GitHub CLI is unavailable.'}</Note>;
  }

  if (result.error) {
    return <Note tone="destructive">{result.error}</Note>;
  }

  return <EmptyIfNoRows>{empty}</EmptyIfNoRows>;
}

/**
 * The "no rows" line, rendered as a sibling of the rows rather than instead of
 * them. `TreeSection`'s children are a fragment, so this cannot know whether
 * any rows follow it — CSS can: the note hides itself whenever a row is present.
 */
function EmptyIfNoRows({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-8 py-1.5 text-xs text-muted-foreground [&:not(:last-child)]:hidden">
      {children}
    </p>
  );
}

function Note({
  children,
  tone = 'muted',
  indent = false,
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
  /** One level deeper — for a note that belongs to a row, not to a section. */
  indent?: boolean;
}) {
  return (
    <p
      className={`${indent ? 'pl-12 pr-2' : 'px-8'} py-1.5 text-xs leading-relaxed ${
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {children}
    </p>
  );
}

function ForgeRow({
  index,
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
  status: { tone: 'ok' | 'fail' | 'busy' | 'idle' | 'warn'; label: string };
  extra?: { tone: 'ok' | 'fail' | 'busy' | 'idle' | 'warn'; label: string } | null;
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
          expand ? 'pl-4' : 'pl-8'
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
