import { LuSquareArrowOutUpRight } from 'react-icons/lu';

import { openExternal, useForgeRuns } from '../../services/queries';
import { PrDetail } from '../reviews/pr-detail';
import { runStatus, StatusPill } from './forge-status';

/**
 * The tab body for a workflow run — a summary plus a way out.
 *
 * Job logs live on GitHub from here; the Actions view (Phase 19) is where they
 * are read in the app, and this tab is the sidebar's quick answer to "did it
 * pass". It reads the same cached listing the sidebar rendered, so opening it
 * costs no additional `gh` call.
 *
 * The pull-request tab used to be the same shape, and no longer is: Phase 20
 * Theme C gave it files, conversation and checks, which live under
 * `features/reviews/`. `ReviewView` below is what remains of it here.
 */

export function RunView({ repoId, runId }: { repoId: string; runId: string }) {
  const { data, isLoading } = useForgeRuns(repoId, true);
  const run = data?.runs.find((candidate) => candidate.id === runId);

  if (isLoading && !run) return <Empty>Reading workflow runs…</Empty>;
  if (!run) {
    return (
      <Empty>
        That run is no longer in the recent list. It may have aged out — refresh Actions in the
        sidebar, or open it on GitHub.
      </Empty>
    );
  }

  const status = runStatus(run);
  const history = (data?.runs ?? []).filter(
    (candidate) => candidate.name === run.name && candidate.id !== run.id,
  );

  return (
    <Detail
      title={run.name}
      pills={<StatusPill status={status} />}
      url={run.url}
      openLabel="Open this run on GitHub"
      facts={[
        ['Branch', run.headBranch ?? 'detached'],
        ['Commit', run.headSha ? run.headSha.slice(0, 7) : '—'],
        ['Started', run.createdAt],
      ]}
    >
      {history.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recent {run.name} runs
          </h3>
          <ul className="mt-2 divide-y divide-border/60 rounded-md border border-border">
            {history.slice(0, 10).map((other) => (
              <li key={other.id}>
                <button
                  type="button"
                  onClick={() => openExternal(other.url)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/30"
                >
                  <StatusPill status={runStatus(other)} />
                  <span className="truncate text-muted-foreground">
                    {other.headBranch ?? 'detached'}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/70">
                    {other.createdAt.slice(0, 10)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        Job logs live on GitHub — this view keeps the verdict beside your code, not the transcript.
      </p>
    </Detail>
  );
}

/**
 * The pull-request tab, which is now `PrDetail` (Phase 20 Theme C).
 *
 * Kept as a one-line delegation rather than deleted: the workbench tab strip
 * opens reviews through this name, and the Reviews *view* being built beside it
 * mounts the same `PrDetail`. Two entrances, one component — which is the point
 * of the detail living under `features/reviews/` rather than in here.
 */
export function ReviewView({ repoId, number }: { repoId: string; number: number }) {
  return <PrDetail repoId={repoId} number={number} />;
}

function Detail({
  title,
  pills,
  url,
  openLabel,
  facts,
  children,
}: {
  title: string;
  pills: React.ReactNode;
  url: string;
  openLabel: string;
  facts: [string, string][];
  children?: React.ReactNode;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center gap-2">{pills}</div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">{title}</h2>

        <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="truncate" data-selectable>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={() => openExternal(url)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <LuSquareArrowOutUpRight aria-hidden className="h-3.5 w-3.5" />
          {openLabel}
        </button>

        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
