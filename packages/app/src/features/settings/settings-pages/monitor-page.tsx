import { useEffect, useState } from 'react';

import { Accordion } from '@bilo-io/ui';
import { LuActivity, LuShieldCheck } from 'react-icons/lu';

import {
  METRICS_ACTIVE_INTERVAL_MS,
  METRICS_IDLE_INTERVAL_MS,
  METRIC_IDS,
  NEW_ISSUE_URL,
  commandLine,
  type MetricId,
} from '@midnite/studio-shared';

import {
  useDiagTrust,
  useRepos,
  useRunDiagnostics,
  useUntrustDiagnostics,
} from '../../../services/queries';
import { bridge } from '../../../services/bridge';
import { openExternal } from '../../../services/queries';
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
 * checkbox somewhere. Split into two accordions for the same reason.
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
    <div className="flex flex-col gap-3">
      <Accordion title="Metrics" icon={<LuActivity className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
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
        </div>
      </Accordion>

      <Accordion title="Diagnostics" icon={<LuShieldCheck className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          <CrashReporting />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Problem counts come from running the repository's own linter. That is code from a folder
            you opened, so it runs only for repositories you have explicitly enabled.
          </p>

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
        </div>
      </Accordion>
    </div>
  );
}

/**
 * Phase 65 Theme E — the user-facing half of the crash log.
 *
 * Themes A–D built the whole machine: a size-capped rotating NDJSON sink, the
 * `mstudio:report:*` channels, main's own `uncaughtException` hooks. None of it
 * was reachable. A user on a support thread could not say where the log was,
 * let alone attach it, and `grep -rni "report a bug"` over the repo returned
 * nothing at all.
 *
 * Three controls, inside the **existing** Diagnostics accordion rather than an
 * eighteenth settings page — a new page is four coupled edits (`ui-store`'s
 * union, `SETTINGS_PAGES`, `PAGE_CONTENT`, `SETTINGS_PAGE_ICON`) for buttons
 * that belong beside the two already here.
 *
 * The path is printed beside the reveal button, not just opened by it, because
 * a user answering "where is your log?" needs to be able to *say* it.
 *
 * Report a bug is here as well as in the release-notes panel, and this is the
 * copy that matters: `version-pill.tsx` hides itself on `'0.0.0'`, so in a dev
 * build that panel never opens. This accordion renders in every build.
 */
function CrashReporting() {
  const api = bridge();
  const hasBridge = api !== null;
  const [logPath, setLogPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!api) return;
    void api.report
      .logPath()
      .then((res) => setLogPath(res.path))
      .catch(() => setLogPath(null));
  }, [api]);

  const reveal = async (): Promise<void> => {
    setError(null);
    const result = await api?.report.reveal();
    // `GitOpResult`'s failure arm is a union — revealing a file can only ever
    // produce the `error` kind, but the envelope is shared, so narrow rather
    // than reach for a field the `conflict` arm does not have.
    if (result && !result.ok && result.kind === 'error') setError(result.message);
  };

  const copyBundle = async (): Promise<void> => {
    setError(null);
    try {
      const { text } = (await api?.report.bundle()) ?? { text: '' };
      // Already redacted main-side through `redactPaths` — this is one block a
      // user can paste into an issue without being asked three follow-ups.
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Crashes and errors are written to a rotating log on this machine. Nothing leaves the app
        unless you send it.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={!hasBridge}
          onClick={() => void reveal()}
          className="rounded border border-border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-50"
        >
          Reveal log
        </button>
        <button
          type="button"
          data-testid="diag-copy-bundle"
          disabled={!hasBridge}
          onClick={() => void copyBundle()}
          className="rounded border border-border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-50"
        >
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
        <button
          type="button"
          disabled={!hasBridge}
          onClick={() => openExternal(NEW_ISSUE_URL)}
          className="rounded border border-border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-50"
        >
          Report a bug
        </button>
      </div>

      {logPath ? (
        <code className="block break-all font-mono text-[10px] text-muted-foreground" data-selectable>
          {logPath}
        </code>
      ) : null}

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
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
