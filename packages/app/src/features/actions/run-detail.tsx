import { useMemo, useState } from 'react';

import type { ForgeJob, ForgeRun } from '@midnite/git-shared';
import { ChevronDown, ChevronRight, SquareArrowOutUpRight } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { openExternal, useForgeRunLog, useForgeWorkflows } from '../../services/queries';
import { useActionsStore } from '../../store/actions-store';
import { jobStatus, runStatus, StatusPill } from '../forge/forge-status';
import { LogPane } from './log-pane';
import { jobLogFor, parseRunLogLines } from './log-model';
import { duration, shouldExpandJob } from './run-groups';

/**
 * One run: its facts, its job tree, and the log of whichever job is selected.
 *
 * Every state-changing verb links out. Re-run, cancel and approve are writes,
 * and the read-only rule in `channels.ts` is the whole reason a stale cache in
 * this app can never do damage — so the buttons that would change a run open
 * GitHub instead of pretending to be it.
 */
export function RunDetail({
  repoId,
  run,
  jobs,
  loadingJobs,
  jobsError,
}: {
  repoId: string;
  run: ForgeRun;
  jobs: readonly ForgeJob[];
  loadingJobs: boolean;
  jobsError: string | null;
}) {
  const selectedJob = useActionsStore((s) => s.selectedJob[repoId] ?? null);
  const selectJob = useActionsStore((s) => s.selectJob);

  /*
    `full` is stored WITH the run it was asked of, not reset by an effect.

    Asking for the un-capped log is a property of the run being read, and
    carrying the request into the next run would pull an eight-megabyte payload
    nobody asked for. An effect cannot prevent that: `setFull(false)` in an
    effect lands a render too late, and the query's own subscribe effect in the
    same commit has already fired `full: true` against the NEW run. Pairing the
    flag with the run id means the answer is right on the first render.
  */
  const [request, setRequest] = useState<{ runId: string; full: boolean }>({
    runId: run.id,
    full: false,
  });
  const full = request.runId === run.id && request.full;

  /*
    The capped payload is this query's placeholder while the full one loads.

    A second query for the capped key would be the obvious way to keep the pane
    populated, and it does not work: the two keys are different, so the moment
    `full` flips, `log.data` is undefined and the pane replaces the log AND its
    truncation banner with "Reading the log…". `placeholderData` keeps the
    previous answer on screen until the new one arrives, which is what the
    disabled "Loading…" button is there to explain.
  */
  const capped = useForgeRunLog(repoId, run.id, true, false);
  const log = useForgeRunLog(repoId, run.id, true, full, full ? capped.data : undefined);

  /*
    One parse per payload, not one per render.

    Splitting a run's log is a pass over every line of it; the pane re-renders
    on every fold toggle and every job click, and neither changes the bytes.
  */
  const model = useMemo(
    () => parseRunLogLines(log.data?.log?.lines ?? []),
    [log.data?.log?.lines],
  );

  const failed = jobs.filter(shouldExpandJob);
  /*
    Default the log to the first failed job — and only honour a stored job that
    exists in THIS run.

    The pane is open because something is red; making the user find which job
    that was, in a tree where thirty green ones look identical, is asking them
    to do the one piece of work the view exists to do for them.

    The existence check is not paranoia. `selectRun` clears the job, but the
    *effective* run also changes without anyone selecting one — a refresh brings
    in a newer failure, or a stored selection ages out of `gh run list` and the
    view falls back to its auto-pick. A job name from the previous run then
    resolves to no log at all, and the pane says "No log for this job" with
    nothing marked current.
  */
  const stored = selectedJob !== null && jobs.some((job) => job.name === selectedJob);
  const activeJob = (stored ? selectedJob : null) ?? failed[0]?.name ?? jobs[0]?.name ?? null;
  const jobLog = activeJob === null ? null : jobLogFor(model, activeJob);

  return (
    <section aria-label="Run detail" className="flex min-h-0 flex-1 flex-col">
      <RunHeader repoId={repoId} run={run} />

      {/*
        Shrinkable, not `shrink-0`. The tree is capped at 45% of the pane and
        scrolls inside that, so when the pane itself is short — a PR's Checks
        tab under a tall header, or the terminal taken up to half the window —
        the honest response is for the tree to give ground and keep scrolling,
        not to hold its content height and push the log pane off the bottom.
      */}
      <div className="max-h-[45%] min-h-0 overflow-y-auto border-b border-border">
        {jobsError !== null ? (
          <p className="px-3 py-2 text-xs text-destructive">{jobsError}</p>
        ) : loadingJobs && jobs.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Reading jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">This run has no jobs.</p>
        ) : (
          <ul aria-label="Jobs" className="py-1">
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                selected={job.name === activeJob}
                onSelect={() => selectJob(repoId, job.name)}
              />
            ))}
          </ul>
        )}
      </div>

      {log.data?.pending === true ? (
        <Empty>
          This run has not finished, so GitHub has no log for it yet. Refresh once it completes.
        </Empty>
      ) : log.data?.error != null ? (
        <Empty tone="destructive">{log.data.error}</Empty>
      ) : log.isFetching && jobLog === null ? (
        <Empty>Reading the log…</Empty>
      ) : jobLog === null ? (
        <Empty>
          {model.preamble.length > 0
            ? 'GitHub returned no per-job output for this run.'
            : 'No log for this job.'}
        </Empty>
      ) : (
        <LogPane
          /*
            Keyed on the job, so the fold state does not survive the pane.
            `collapsed` holds group ORDINALS; carried into another job they fold
            unrelated groups, and a larger previous job leaves "Expand all"
            showing over a log where nothing is collapsed.
          */
          key={activeJob}
          nodes={jobLog.nodes}
          truncated={log.data?.log?.truncated ?? false}
          omittedLines={log.data?.log?.omittedLines ?? 0}
          totalBytes={log.data?.log?.totalBytes ?? 0}
          runUrl={run.url}
          // Nothing left to ask for once the un-capped fetch is the one showing.
          onLoadFull={full ? null : () => setRequest({ runId: run.id, full: true })}
          loadingFull={full && log.isFetching}
        />
      )}
    </section>
  );
}

/** The run's facts, and every way out of the app. */
function RunHeader({ repoId, run }: { repoId: string; run: ForgeRun }) {
  /*
    The workflow file is the ONE thing a run listing does not carry, so it costs
    a second `gh` call — enabled here, where a link to it is actually rendered,
    and nowhere else.
  */
  const workflows = useForgeWorkflows(repoId, true);
  const file =
    workflows.data?.workflows.find((entry) => entry.id === run.workflowId)?.path ?? null;

  // `updatedAt` is the last state change, which is non-null for a run still
  // going — so an unfinished run would report a finished-looking "Took 4m".
  const took = run.status === 'completed' ? duration(run.startedAt, run.updatedAt) : null;
  const fileUrl = file === null ? null : workflowFileUrl(run.url, run.headBranch ?? 'HEAD', file);

  return (
    <header className="shrink-0 border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <StatusPill status={runStatus(run)} />
        <h3 className="truncate text-sm font-semibold">{run.displayTitle ?? run.name}</h3>
        <IconButton
          icon={SquareArrowOutUpRight}
          label="Open this run on GitHub"
          size="sm"
          className="ml-auto"
          onClick={() => openExternal(run.url)}
        />
      </div>

      <dl className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
        <Fact label="Workflow" value={run.workflowName ?? run.name} />
        <Fact label="Branch" value={run.headBranch ?? 'detached'} />
        {run.event ? <Fact label="Event" value={run.event} /> : null}
        {/*
          Truthiness, not `=== null`.

          The contract says these are `string | null`, and through the real IPC
          path they are — every payload is schema-parsed in main. A test double
          or a hand-built fixture is under no such obligation, and
          `undefined === null` is false, so an absent field would reach `.slice`
          and take the whole view down with it. Nothing is lost either way: an
          empty sha is not a fact worth a row.
        */}
        {run.headSha ? <Fact label="Commit" value={run.headSha.slice(0, 7)} /> : null}
        {took === null ? null : <Fact label="Took" value={took} />}
        {!run.attempt || run.attempt <= 1 ? null : (
          <Fact label="Attempt" value={String(run.attempt)} />
        )}
        {fileUrl === null ? null : (
          <div className="flex items-center gap-1">
            <dt className="sr-only">File</dt>
            <dd>
              <button
                type="button"
                onClick={() => openExternal(fileUrl)}
                className="font-mono underline-offset-2 hover:underline"
              >
                {file}
              </button>
            </dd>
          </div>
        )}
      </dl>
    </header>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1">
      <dt className="shrink-0 opacity-70">{label}</dt>
      <dd className="min-w-0 truncate text-foreground/80">{value}</dd>
    </div>
  );
}

/**
 * One job, its steps folded unless it failed.
 *
 * The initial fold state is derived, not stored: `shouldExpandJob` is the whole
 * rule, and a stored default would be a second answer that could disagree with
 * it the moment a run is re-fetched with a different conclusion.
 */
function JobRow({
  job,
  selected,
  onSelect,
}: {
  job: ForgeJob;
  selected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(() => shouldExpandJob(job));
  const took = duration(job.startedAt, job.completedAt);

  return (
    <li>
      <div
        className={`flex items-center gap-1 border-l-2 pr-2 text-[13px] transition-colors ${
          selected ? 'border-primary bg-accent/40' : 'border-transparent hover:bg-accent/20'
        }`}
      >
        <IconButton
          icon={open ? ChevronDown : ChevronRight}
          label={`Steps in ${job.name}`}
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        />
        {/*
          The pill sits OUTSIDE the button, and that is not cosmetic.

          Inside, it becomes part of the button's accessible name — so the
          control for selecting a job is called "Failed test (ubuntu-latest)"
          and is indistinguishable, to anything matching on names, from the
          "Steps in test (ubuntu-latest)" chevron beside it. A status is a
          reading of the job, not part of what the control does.
        */}
        <StatusPill status={jobStatus(job)} />
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          className="min-w-0 flex-1 truncate py-1 text-left"
        >
          {job.name}
        </button>
        {took === null ? null : (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{took}</span>
        )}
        {job.url.length === 0 ? null : (
          <IconButton
            icon={SquareArrowOutUpRight}
            label={`Open ${job.name} on GitHub`}
            size="sm"
            onClick={() => openExternal(job.url)}
          />
        )}
      </div>

      {open && job.steps.length > 0 ? (
        <ul className="ml-8 border-l border-border/60 pl-2">
          {job.steps.map((step) => (
            <li
              key={`${step.number}:${step.name}`}
              className="flex items-center gap-1.5 py-0.5 text-[12px]"
            >
              <StatusPill status={jobStatus({ ...step, id: '', url: '', steps: [] })} />
              <span className="min-w-0 truncate">{step.name}</span>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {duration(step.startedAt, step.completedAt) ?? ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Empty({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <p
        className={`max-w-sm text-center text-xs leading-relaxed ${
          tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * The `blob` url of a workflow file, derived from the run's own url.
 *
 * `https://host/owner/repo/actions/runs/<id>` carries both the host and the
 * owner/repo pair, so this needs no second question to main — which matters for
 * an Enterprise remote, where the host is not github.com. Returns null on
 * anything it cannot parse rather than throwing: an absent link is a link
 * nobody clicks, while a `new URL` that throws inside render takes the pane
 * down with it.
 */
function workflowFileUrl(runUrl: string, branch: string, file: string): string | null {
  try {
    const url = new URL(runUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return `${url.origin}/${parts[0]}/${parts[1]}/blob/${branch}/${file}`;
  } catch {
    return null;
  }
}
