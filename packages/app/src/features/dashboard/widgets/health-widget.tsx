import { MetricDial, RadialGauge } from '@bilo-io/ui';

import type { RepoStats } from '@midnite/studio-shared';

import { formatNumber } from '../../../lib/format-number';
import { formatBytes } from '../../monitor/format-bytes';
import { StatTile, WidgetState } from '../widget-frame';
import { relativeDays } from './contributors-widget';

/**
 * The repository's own condition, as opposed to what people did in it.
 *
 * Two of these figures are a bounded fraction of a known total — stale branches
 * out of local branches, merged branches out of local branches — and those take
 * `@bilo-io/ui`'s `RadialGauge` and `MetricDial`, which exist for exactly that
 * and had no caller until now. The rest (repository size, loose objects, ref
 * counts, the age of the oldest un-merged branch) are unbounded numbers with no
 * meaningful full scale, and a dial for one of those would have to invent a
 * maximum in order to draw an arc. Those stay flat stat tiles.
 *
 * `sizeBytes` and `looseObjects` are `null` when `count-objects` could not be
 * read, and render as `—`. Same rule as everywhere else in this contract: not
 * measured is not zero.
 */
export function HealthWidget({
  stats,
  loading,
}: {
  stats: RepoStats | undefined;
  loading: boolean;
}) {
  const health = stats?.health;
  const local = health?.localBranches ?? 0;

  return (
    <WidgetState
      loading={loading}
      empty={health === undefined}
      emptyLabel="Repository health is not available."
    >
      {health ? (
        <div className="flex flex-wrap items-start gap-4">
          {/*
            The gauge is a byte gauge by name only — every string it renders is
            overridable, which is what its `labels` API is for. Handing it plain
            counts and a formatter that just stringifies them gives a
            branches-out-of-branches ring rather than a second hand-rolled one.
          */}
          <div className="w-[9rem] shrink-0">
            <RadialGauge
              usedBytes={health.staleByAge}
              totalBytes={Math.max(local, 1)}
              labels={{
                bytes: (value) => String(Math.round(value)),
                aria: (pct) => `${pct}% of local branches are stale`,
                of: (total) => `of ${total} local`,
                used: (pct) => `${pct}% stale`,
                free: (fresh) => `${fresh} fresh`,
              }}
            />
            <p className="pt-1 text-center text-[10px] text-muted-foreground">
              Stale branches (no commit in 90 days)
            </p>
          </div>

          <div className="w-[6rem] shrink-0">
            <MetricDial
              pct={local === 0 ? 0 : (health.mergedBranches / local) * 100}
              label="Merged"
              hueVar="--primary"
              sublabel={`${formatNumber(health.mergedBranches)} of ${formatNumber(local)}`}
              ariaLabel={`${formatNumber(health.mergedBranches)} of ${formatNumber(local)} local branches are already merged`}
            />
            <p className="pt-1 text-center text-[10px] text-muted-foreground">
              Already in the default branch — safe to delete
            </p>
          </div>

          <div className="grid min-w-[16rem] flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile
              label="Repo size"
              value={health.sizeBytes === null ? '—' : formatBytes(health.sizeBytes)}
              sublabel={
                health.looseObjects === null ? undefined : `${formatNumber(health.looseObjects)} loose objects`
              }
            />
            <StatTile label="Local branches" value={formatNumber(health.localBranches)} />
            <StatTile label="Remote branches" value={formatNumber(health.remoteBranches)} />
            <StatTile label="Tags" value={formatNumber(health.tags)} />
            <StatTile
              label="Oldest un-merged"
              value={
                health.oldestUnmergedAt === null ? '—' : relativeDays(health.oldestUnmergedAt)
              }
              sublabel={health.oldestUnmergedAt === null ? 'nothing un-merged' : undefined}
            />
            <StatTile
              label="Commits scanned"
              value={formatNumber(stats?.commitsScanned ?? 0)}
              sublabel={stats?.truncated ? 'traversal truncated' : undefined}
            />
          </div>
        </div>
      ) : null}
    </WidgetState>
  );
}
