import { Accordion } from '@bilo-io/ui';
import { LuHistory, LuTimer } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';

export const WORKFLOW_TIMEOUT_MIN_S = 5;
export const WORKFLOW_TIMEOUT_MAX_S = 600;
export const WORKFLOW_TIMEOUT_DEFAULT_S = 120;

export const WORKFLOW_RUN_HISTORY_CAP_MIN = 1;
export const WORKFLOW_RUN_HISTORY_CAP_MAX = 100;
export const WORKFLOW_RUN_HISTORY_CAP_DEFAULT = 20;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

/**
 * Workflows (Theme I) — the phase's one settings page, for the two values
 * every run reads: a node's default timeout and how many runs a workflow
 * keeps. Both are `useUiStore` fields, persisted like every other setting,
 * but sending the change to main is a second, explicit step — the same
 * `update.setChannel` shape `updates-page.tsx` uses: `ipcMain.on`, fire on
 * change, never synced on boot. Main starts each launch at `shared/workflow.ts`'s
 * own constants until this page is opened and something is changed.
 */
export function WorkflowsPage() {
  const timeoutS = useUiStore((s) => s.workflowDefaultTimeoutS);
  const setTimeoutS = useUiStore((s) => s.setWorkflowDefaultTimeoutS);
  const historyCap = useUiStore((s) => s.workflowRunHistoryCap);
  const setHistoryCap = useUiStore((s) => s.setWorkflowRunHistoryCap);

  const clampedTimeoutS = Math.min(WORKFLOW_TIMEOUT_MAX_S, Math.max(WORKFLOW_TIMEOUT_MIN_S, timeoutS));
  const clampedCap = Math.min(WORKFLOW_RUN_HISTORY_CAP_MAX, Math.max(WORKFLOW_RUN_HISTORY_CAP_MIN, historyCap));

  const send = (nextTimeoutS: number, nextCap: number) => {
    bridge()?.workflow.setDefaults({
      defaultTimeoutMs: nextTimeoutS * 1000,
      runHistoryCap: nextCap,
    });
  };

  const changeTimeout = (nextTimeoutS: number) => {
    setTimeoutS(nextTimeoutS);
    send(nextTimeoutS, clampedCap);
  };

  const changeCap = (nextCap: number) => {
    setHistoryCap(nextCap);
    send(clampedTimeoutS, nextCap);
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Defaults" icon={<LuTimer className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Default node timeout</p>
              <p className="text-[11px] text-muted-foreground">
                How long a node runs before it's marked timed out, unless it sets its own.
              </p>
            </div>
            <div className="flex h-8 min-w-[3.5rem] items-center justify-center rounded border border-border bg-card px-3 text-sm font-semibold tabular-nums">
              {formatDuration(clampedTimeoutS)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
              {formatDuration(WORKFLOW_TIMEOUT_MIN_S)}
            </span>
            <input
              type="range"
              min={WORKFLOW_TIMEOUT_MIN_S}
              max={WORKFLOW_TIMEOUT_MAX_S}
              step={5}
              value={clampedTimeoutS}
              onChange={(e) => changeTimeout(Number(e.target.value))}
              aria-label="Default node timeout"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
            />
            <span className="w-8 text-xs text-muted-foreground tabular-nums">
              {formatDuration(WORKFLOW_TIMEOUT_MAX_S)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Default {formatDuration(WORKFLOW_TIMEOUT_DEFAULT_S)} (range{' '}
            {formatDuration(WORKFLOW_TIMEOUT_MIN_S)} – {formatDuration(WORKFLOW_TIMEOUT_MAX_S)})
          </p>
        </div>
      </Accordion>

      <Accordion title="Run history" icon={<LuHistory className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Runs kept per workflow</p>
              <p className="text-[11px] text-muted-foreground">
                Oldest finished runs are dropped once a workflow passes this count. A run still in
                progress is never evicted.
              </p>
            </div>
            <div className="flex h-8 min-w-[3.5rem] items-center justify-center rounded border border-border bg-card px-3 text-sm font-semibold tabular-nums">
              {clampedCap}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
              {WORKFLOW_RUN_HISTORY_CAP_MIN}
            </span>
            <input
              type="range"
              min={WORKFLOW_RUN_HISTORY_CAP_MIN}
              max={WORKFLOW_RUN_HISTORY_CAP_MAX}
              step={1}
              value={clampedCap}
              onChange={(e) => changeCap(Number(e.target.value))}
              aria-label="Runs kept per workflow"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
            />
            <span className="w-8 text-xs text-muted-foreground tabular-nums">
              {WORKFLOW_RUN_HISTORY_CAP_MAX}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Default {WORKFLOW_RUN_HISTORY_CAP_DEFAULT} (range {WORKFLOW_RUN_HISTORY_CAP_MIN} –{' '}
            {WORKFLOW_RUN_HISTORY_CAP_MAX})
          </p>
        </div>
      </Accordion>
    </div>
  );
}
