import type { ForgeRun } from '@midnite/git-shared';
import { useMemo, useState } from 'react';

import { useForgeRunDetail, useForgeRuns } from '../../services/queries';
import { RunDetail } from '../actions/run-detail';
import { runStatus, StatusPill } from '../forge/forge-status';

/**
 * A pull request's checks — the Actions view's own job tree, re-pointed.
 *
 * **No third subprocess.** The runs are found by matching the PR's head sha
 * against the run listing the app already caches for the Actions view and the
 * sidebar; `gh pr checks` would be a separate call answering a question two
 * cached payloads can already answer between them.
 *
 * The tree itself is `RunDetail`, mounted unchanged. A PR's checks and a
 * branch's checks are the same run seen from two entrances, and a second
 * job/step renderer here would be a second place for "cancelled" to pick a
 * different colour.
 */
export function PrChecks({
  repoId,
  headSha,
  headBranch,
  loadingDetail,
}: {
  repoId: string;
  headSha: string | null;
  /**
   * The PR's branch, used only to narrow which twenty runs get fetched.
   *
   * The un-branched listing is twenty runs across the WHOLE repository, so on
   * any repo with normal CI traffic a day-old pull request has aged out of it
   * and this tab would report "no run matched" beside a sidebar row showing a
   * green checks pill. Narrowing to the branch spends the same twenty rows on
   * the runs that could possibly match.
   */
  headBranch: string;
  /**
   * Whether the PR's own detail fetch is still in flight.
   *
   * `headSha` arrives with that fetch, and the tab strip renders as soon as the
   * cached LISTING row resolves — so without this, clicking Checks immediately
   * after opening a PR asserts "GitHub did not report this pull request's head
   * commit" for the length of a subprocess, which is a claim about the forge
   * rather than a statement that we are still asking.
   */
  loadingDetail: boolean;
}) {
  const runs = useForgeRuns(repoId, true, headBranch.length > 0 ? headBranch : undefined);

  /*
    Every run for this exact commit, newest first.

    On the SHA, not the branch: a PR's branch keeps moving, and after a force-
    push or a merge from base the branch's newest run describes a commit this
    pull request no longer points at. Matching the sha is what makes "these are
    this PR's checks" true rather than approximately true.
  */
  const matching = useMemo(() => {
    if (headSha === null) return [];
    return (runs.data?.runs ?? [])
      .filter((run) => run.headSha === headSha)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [runs.data?.runs, headSha]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A stored selection is honoured only while it exists in THIS list — a
  // refresh can retire the run it named, the same guard `RunDetail` makes for
  // its stored job.
  const active = matching.find((run) => run.id === selectedId) ?? matching[0] ?? null;

  const detail = useForgeRunDetail(repoId, active?.id ?? null, active !== null);

  // "We are still asking" comes before every claim about what GitHub said.
  if (loadingDetail && headSha === null) return <Note>Reading pull request detail…</Note>;

  if (headSha === null) {
    return (
      <Note>
        GitHub did not report this pull request&rsquo;s head commit, so its runs cannot be matched.
      </Note>
    );
  }

  if (runs.data?.cli.reason === 'not-installed' || runs.data?.cli.reason === 'not-authenticated') {
    return <Note>{runs.data.cli.hint}</Note>;
  }
  if (runs.data?.error != null) return <Note tone="destructive">{runs.data.error}</Note>;
  if (runs.isLoading && matching.length === 0) return <Note>Reading workflow runs…</Note>;

  if (active === null) {
    return (
      <Note>
        No workflow run on {headBranch || 'this branch'} was triggered on {headSha.slice(0, 7)}. The
        listing is capped at the twenty most recent runs, so an older pull request&rsquo;s checks may
        have aged out of it.
      </Note>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        The picker appears only when there is a choice. One workflow is the
        common case, and a strip holding a single un-pressable button is chrome
        that explains nothing.
      */}
      {matching.length > 1 ? (
        <div
          role="tablist"
          aria-label="Workflow runs for this commit"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1"
        >
          {matching.map((run) => (
            <RunTab
              key={run.id}
              run={run}
              selected={run.id === active.id}
              onSelect={() => setSelectedId(run.id)}
            />
          ))}
        </div>
      ) : null}

      <RunDetail
        // Keyed on the run, so the log pane's fold state and the selected job
        // do not survive a switch to a different workflow.
        key={active.id}
        repoId={repoId}
        run={active}
        jobs={detail.data?.detail?.jobs ?? []}
        loadingJobs={detail.isLoading}
        jobsError={detail.data?.error ?? null}
      />
    </div>
  );
}

function RunTab({
  run,
  selected,
  onSelect,
}: {
  run: ForgeRun;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
        selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40'
      }`}
    >
      <StatusPill status={runStatus(run)} />
      <span className="max-w-[14rem] truncate">{run.workflowName ?? run.name}</span>
    </button>
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
    <p
      className={`px-4 py-3 text-xs ${
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {children}
    </p>
  );
}
