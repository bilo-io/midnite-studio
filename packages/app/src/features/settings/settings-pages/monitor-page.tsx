import {
  METRICS_ACTIVE_INTERVAL_MS,
  METRICS_IDLE_INTERVAL_MS,
  METRIC_IDS,
  commandLine,
  type MetricId,
} from '@midnite/git-shared';

import {
  useDiagTrust,
  useRepos,
  useRunDiagnostics,
  useUntrustDiagnostics,
} from '../../../services/queries';
import { useActiveWorktree } from '../../../services/use-status';
import { useUiStore } from '../../../store/ui-store';
import { METRIC_LABELS, metricColor } from '../../monitor/metric-palette';
import { Choice, Field } from './controls';

/**
 * Monitor & Diagnostics — the settings behind the footer's right cluster.
 *
 * Two halves that sit together because they share one strip of chrome, but they
 * are not the same kind of setting at all. The monitor half is preference:
 * which readouts you want, how often they refresh. The diagnostics half is
 * **consent** — the only place in the app where you can see, in one list, which
 * repositories you have allowed to execute their own code, and take it back.
 * That second one is the reason this page has to exist rather than living as a
 * checkbox somewhere.
 */
export function MonitorPage() {
  const hidden = useUiStore((s) => s.hiddenMetrics);
  const toggleMetric = useUiStore((s) => s.toggleMetric);
  const idleMs = useUiStore((s) => s.metricsIdleIntervalMs);
  const setIdleMs = useUiStore((s) => s.setMetricsIdleInterval);

  const { repoId } = useActiveWorktree();
  const trust = useDiagTrust(repoId);
  const runner = useRunDiagnostics(repoId);
  const revoke = useUntrustDiagnostics(repoId);
  // Same reason as the footer segment: the workdir belongs to the repo
  // registry, not to the trust record, so a moved repo cannot show a stale one.
  const repos = useRepos();
  const workdir = repos.data?.find((repo) => repo.id === repoId)?.path ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Metrics shown"
        hint="Readouts in the footer's right cluster. A metric this machine cannot report is never shown, whatever is ticked here."
      >
        <ul className="flex flex-col gap-1.5">
          {METRIC_IDS.map((id: MetricId) => (
            <li key={id}>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!hidden.includes(id)}
                  onChange={() => toggleMetric(id)}
                  className="accent-[hsl(var(--primary))]"
                />
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: metricColor(id) }}
                />
                {METRIC_LABELS[id]}
              </label>
            </li>
          ))}
        </ul>
      </Field>

      <Choice<string>
        label="Refresh interval"
        hint={`How often the footer samples when the flyout is closed. Opening it always escalates to ${
          METRICS_ACTIVE_INTERVAL_MS / 1000
        }s, and sampling stops entirely when the window is not in front.`}
        value={String(idleMs)}
        onChange={(value) => setIdleMs(Number(value))}
        options={[
          [String(METRICS_ACTIVE_INTERVAL_MS), '2 seconds'],
          [String(METRICS_IDLE_INTERVAL_MS), '5 seconds'],
          ['15000', '15 seconds'],
          ['30000', '30 seconds'],
        ]}
      />

      <Field
        label="Diagnostics"
        hint="Problem counts come from running the repository's own linter. That is code from a folder you opened, so it runs only for repositories you have explicitly enabled."
      >
        {repoId === null ? (
          <p className="text-xs text-muted-foreground">Select a repository to configure it.</p>
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">This repository</span>
              <span className="font-medium">{trustLabel(trust.data?.state)}</span>
            </div>

            {trust.data?.command ? (
              <>
                <div className="rounded border border-border bg-muted/40 px-2 py-1.5">
                  {/*
                    The literal command, again. It is shown at the moment of
                    consent and it has to remain visible afterwards — consent
                    you can no longer inspect is not much better than none.
                  */}
                  <code className="block break-all font-mono text-[11px]">
                    {commandLine(trust.data.command)}
                  </code>
                  {workdir ? (
                    <p className="mt-1 break-all text-[10px] text-muted-foreground">
                      in {workdir}
                    </p>
                  ) : null}
                </div>
                {trust.data.state === 'command-changed' ? (
                  <p className="text-[11px] text-[hsl(var(--health-warn))]">
                    This is not the command you approved. Diagnostics stay off until you approve
                    the new one from the footer.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">No linter detected in this repository.</p>
            )}

            {trust.data?.state === 'trusted' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runner.mutate()}
                  disabled={runner.isPending}
                  className="rounded border border-border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {runner.isPending ? 'Running…' : 'Run now'}
                </button>
                <button
                  type="button"
                  data-testid="diag-revoke"
                  onClick={() => revoke.mutate()}
                  className="rounded border border-destructive/40 px-2 py-1 text-destructive transition-colors hover:bg-destructive/10"
                >
                  Revoke trust
                </button>
              </div>
            ) : null}

            <p className="text-[10px] text-muted-foreground">
              Diagnostics never re-run because a file changed — the watcher fires on every save,
              and a linter on that cadence would be the most expensive thing in the app.
            </p>
          </div>
        )}
      </Field>
    </div>
  );
}

const trustLabel = (state: string | undefined): string => {
  switch (state) {
    case 'trusted':
      return 'Enabled';
    case 'command-changed':
      return 'Needs re-approval';
    case 'untrusted':
      return 'Not enabled';
    default:
      return 'No linter found';
  }
};
