import { useMemo } from 'react';

import type { ForgeIssue, ForgePull, ForgeRun } from '@midnite/studio-shared';

import { openExternal } from '../../../services/queries';
import { checksStatus, pullStatus, runStatus, StatusPill } from '../../forge/forge-status';
import { WidgetState } from '../widget-frame';

/**
 * The three tiles that read GitHub, sharing one shape.
 *
 * Every row here links OUT — the phase's read-only rule means nothing on this
 * board merges, closes, approves or re-runs, so a row's only action is to open
 * the thing on the forge. That is why they are `<button>`s calling
 * `openExternal` rather than anchors: the renderer is a `file://` origin in the
 * packaged app, and a real `href` would either do nothing or navigate the whole
 * window out of the application.
 */

/**
 * Four different empties, as `forge-sections.tsx` established. Same rules here.
 *
 * A plain function rather than a component: it returns the three strings a
 * `WidgetState` needs, so the caller can override one of them (a disabled issue
 * tracker) before rendering. A component could only return the finished markup,
 * and every widget would then need its own copy of the four-way distinction.
 */
function forgeEmptyState({
  result,
  isFetching,
  empty,
}: {
  result: { cli: { reason: string; hint: string }; error: string | null } | undefined;
  isFetching: boolean;
  empty: string;
}): { loading: boolean; error: string | null; emptyLabel: string } {
  if (!result) return { loading: isFetching, error: null, emptyLabel: empty };
  if (result.cli.reason !== 'ready') {
    return {
      loading: false,
      error: null,
      emptyLabel: result.cli.hint || 'The GitHub CLI is unavailable.',
    };
  }
  if (result.error) return { loading: false, error: result.error, emptyLabel: empty };
  return { loading: false, error: null, emptyLabel: empty };
}

export function PullsWidget({
  result,
  isFetching,
}: {
  result: { cli: { reason: string; hint: string }; pulls: ForgePull[]; error: string | null } | undefined;
  isFetching: boolean;
}) {
  const state = forgeEmptyState({ result, isFetching, empty: 'No open pull requests.' });
  const pulls = result?.pulls ?? [];

  return (
    <WidgetState
      loading={state.loading}
      error={state.error}
      empty={pulls.length === 0}
      emptyLabel={state.emptyLabel}
    >
      <ul className="flex flex-col">
        {pulls.map((pull) => (
          <ForgeListRow
            key={pull.number}
            onOpen={() => openExternal(pull.url)}
            title={pull.title}
            openLabel={`Open pull request #${pull.number} on GitHub`}
            meta={<PullMeta pull={pull} />}
            subtitle={`#${pull.number} · ${pull.headBranch}${pull.author ? ` · ${pull.author}` : ''}`}
          />
        ))}
      </ul>
    </WidgetState>
  );
}

export function IssuesWidget({
  result,
  isFetching,
}: {
  result:
    | {
        cli: { reason: string; hint: string };
        issues: ForgeIssue[];
        disabled: boolean;
        error: string | null;
      }
    | undefined;
  isFetching: boolean;
}) {
  const state = forgeEmptyState({ result, isFetching, empty: 'No open issues.' });
  const issues = result?.issues ?? [];

  /*
    A disabled tracker outranks every other empty. It is not a failure, not a
    missing CLI and not "no issues yet" — it is a repository that has chosen to
    track its work somewhere else, and saying so is the difference between the
    user shrugging and the user going looking for a bug.
  */
  const emptyLabel = result?.disabled
    ? 'Issues are disabled for this repository.'
    : state.emptyLabel;

  return (
    <WidgetState
      loading={state.loading}
      error={result?.disabled ? null : state.error}
      empty={issues.length === 0}
      emptyLabel={emptyLabel}
    >
      <ul className="flex flex-col">
        {issues.map((issue) => (
          <ForgeListRow
            key={issue.number}
            onOpen={() => openExternal(issue.url)}
            title={issue.title}
            openLabel={`Open issue #${issue.number} on GitHub`}
            meta={
              <span className="flex shrink-0 items-center gap-1">
                {issue.labels.slice(0, 3).map((label) => (
                  <span
                    key={label.name}
                    title={label.name}
                    className="max-w-[6rem] truncate rounded-full px-1.5 py-px text-[9px] font-medium"
                    style={
                      label.color
                        ? {
                            backgroundColor: `#${label.color}33`,
                            // The forge's own colour as the text, over a 20%
                            // wash of itself — legible on either theme's ground
                            // without the app having to know how dark it is.
                            color: `#${label.color}`,
                          }
                        : { backgroundColor: 'hsl(var(--muted))' }
                    }
                  >
                    {label.name}
                  </span>
                ))}
              </span>
            }
            subtitle={`#${issue.number}${issue.author ? ` · ${issue.author}` : ''}`}
          />
        ))}
      </ul>
    </WidgetState>
  );
}

export function RunsWidget({
  result,
  isFetching,
}: {
  result: { cli: { reason: string; hint: string }; runs: ForgeRun[]; error: string | null } | undefined;
  isFetching: boolean;
}) {
  const state = forgeEmptyState({ result, isFetching, empty: 'No workflow runs yet.' });

  /*
    Grouped by the workflow's display name, which is what `gh run list` gives
    today. Theme C adds the workflow FILE to the payload and the grouping key
    moves to it — at which point two workflows that happen to share a display
    name stop being one group. Doing it by name now is the honest version of
    what this data can support, not a shortcut around the better key.

    Keyed on `result?.runs` rather than on a `?? []` default: the default is a
    fresh array on every render, so the memo would rebuild the whole grouping
    each time and be no memo at all.
  */
  const runs = result?.runs;
  const groups = useMemo(() => {
    const byName = new Map<string, ForgeRun[]>();
    for (const run of runs ?? []) {
      const list = byName.get(run.name);
      if (list) list.push(run);
      else byName.set(run.name, [run]);
    }
    return [...byName.entries()];
  }, [runs]);

  return (
    <WidgetState
      loading={state.loading}
      error={state.error}
      empty={(runs?.length ?? 0) === 0}
      emptyLabel={state.emptyLabel}
    >
      <div className="flex flex-col gap-2">
        {groups.map(([name, groupRuns]) => (
          <div key={name}>
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {name}
            </p>
            <ul className="flex flex-col">
              {groupRuns.slice(0, 5).map((run) => (
                <ForgeListRow
                  key={run.id}
                  onOpen={() => openExternal(run.url)}
                  title={run.headBranch ?? 'detached'}
                  openLabel="Open run on GitHub"
                  meta={<StatusPill status={runStatus(run)} />}
                  subtitle={new Date(run.createdAt).toLocaleString()}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </WidgetState>
  );
}

/** The review verdict and, where the PR has any checks at all, their rollup. */
function PullMeta({ pull }: { pull: ForgePull }) {
  const checks = checksStatus(pull);
  return (
    <>
      <StatusPill status={pullStatus(pull)} />
      {checks ? <StatusPill status={checks} /> : null}
    </>
  );
}

function ForgeListRow({
  onOpen,
  openLabel,
  title,
  subtitle,
  meta,
}: {
  onOpen: () => void;
  openLabel: string;
  title: string;
  subtitle: string;
  meta?: React.ReactNode;
}) {
  return (
    <li className="border-b border-border/40 last:border-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        className="flex w-full min-w-0 items-start gap-1.5 py-1 text-left transition-colors hover:bg-accent/30"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{title}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>
        </span>
        {meta}
      </button>
    </li>
  );
}
