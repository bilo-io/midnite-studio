import { useState } from 'react';

import { LuChevronDown, LuChevronRight, LuCircleCheck, LuCircleX, LuShieldAlert } from 'react-icons/lu';

import { useApiClientStore } from '../../store/api-client-store';

/**
 * The Scripts tab's results half (Phase 70 Theme B) — one row per assertion
 * with a pass/fail glyph and the failure message inline, a `logs`
 * disclosure below it, and — when the collection's scripts are untrusted —
 * the consent bar **instead of** any of that, exactly the phase doc's own
 * wording: a `needs-consent` outcome ran nothing at all, so there is no
 * result list to show alongside the bar, only in its place.
 */
export function TestResultsPanel({ tabId }: { tabId: string }) {
  const state = useApiClientStore((s) => s.scriptRuns[tabId]) ?? { status: 'idle' as const };
  const runTestScript = useApiClientStore((s) => s.runTestScript);
  const setScriptTrust = useApiClientStore((s) => s.setScriptTrust);
  const [logsOpen, setLogsOpen] = useState(false);

  if (state.status === 'idle') return null;

  if (state.status === 'needs-consent') {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-accent/40 px-3 py-2 text-xs">
        <LuShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1">This collection contains scripts. Run them?</span>
        <button
          type="button"
          onClick={() => void runTestScript(tabId, true)}
          className="rounded border border-border px-2 py-1 font-medium transition-colors hover:bg-accent"
        >
          Run once
        </button>
        <button
          type="button"
          onClick={() => void setScriptTrust(tabId, true)}
          className="rounded bg-primary px-2 py-1 font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          Always for this collection
        </button>
        <button
          type="button"
          onClick={() => void setScriptTrust(tabId, false)}
          className="rounded border border-border px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Never
        </button>
      </div>
    );
  }

  if (state.status === 'declined') {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        Scripts won't run for this collection.
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-destructive">{state.message}</div>
    );
  }

  const { run } = state;

  return (
    <div className="flex min-h-0 flex-col border-t border-border text-xs">
      {run.error ? (
        <div className="px-3 py-2 text-destructive">{run.error}</div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {run.results.map((assertion, index) => (
            <li key={`${assertion.name}-${index}`} className="flex items-start gap-2 px-3 py-1.5">
              {assertion.passed ? (
                <LuCircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <LuCircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
              )}
              <div className="flex flex-col">
                <span className={assertion.passed ? '' : 'font-medium'}>{assertion.name}</span>
                {!assertion.passed && assertion.error ? (
                  <span className="text-destructive">{assertion.error}</span>
                ) : null}
              </div>
            </li>
          ))}
          {run.results.length === 0 ? (
            <li className="px-3 py-1.5 text-muted-foreground">No assertions — the script ran with no `pm.test` calls.</li>
          ) : null}
        </ul>
      )}

      {run.logs.length > 0 ? (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setLogsOpen((open) => !open)}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent"
          >
            {logsOpen ? (
              <LuChevronDown className="h-3 w-3" aria-hidden />
            ) : (
              <LuChevronRight className="h-3 w-3" aria-hidden />
            )}
            Console ({run.logs.length})
          </button>
          {logsOpen ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-accent/30 px-3 py-2 font-mono text-[11px]">
              {run.logs.join('\n')}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
