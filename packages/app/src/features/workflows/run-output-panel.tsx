import type { WorkflowNode, WorkflowRun } from '@midnite/studio-shared';
import { Fragment, useState } from 'react';
import { LuChevronDown, LuChevronUp, LuDownload, LuPlay } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { bridge } from '../../services/bridge';
import { activityStatusVar } from '../activity/activity-status-color';
import { NODE_KIND_META } from './canvas/node-kind-meta';
import { GateDecideRow } from './gate-decide-row';

/**
 * The run panel's own Resume control (Phase 97 Theme G), shown only for a
 * run left `interrupted` (the app quit while it was in flight). A plain
 * direct `bridge()` call with local pending/error state, the same idiom
 * `GateDecideRow` already uses right above — not a `useMutation` hook, so
 * this component (and `RunOutputPanel` itself) keeps working in every test
 * that renders it with no `QueryClientProvider` around it.
 */
function ResumeRunButton({ runId }: { runId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resume = async () => {
    setPending(true);
    setError(null);
    const result = await bridge()?.workflow.resume({ runId });
    setPending(false);
    if (result && !result.ok) setError(result.kind === 'error' ? result.message : 'Could not resume.');
  };

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        title="Resume this run from where it left off"
        aria-label="Resume run"
        disabled={pending}
        onClick={(event) => {
          event.stopPropagation();
          void resume();
        }}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[hsl(var(--activity-waiting))] hover:bg-background disabled:opacity-50"
      >
        <LuPlay aria-hidden className="h-3 w-3" />
        {pending ? 'Resuming…' : 'Resume'}
      </button>
      {error ? <span className="text-destructive">{error}</span> : null}
    </span>
  );
}

const STATUS_LABEL: Record<WorkflowRun['nodes'][number]['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  timeout: 'Timed out',
  skipped: 'Skipped',
  waiting: 'Waiting for approval',
};

const STATUS_TO_ACTIVITY = {
  pending: 'queued',
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
  timeout: 'failed',
  skipped: 'queued',
  waiting: 'waiting',
} as const;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false });
}

/**
 * The run's log, synthesised from `WorkflowNodeRun`'s own start/end/status
 * fields — this schema records no separate stdout stream (an `http`/`delay`
 * node has nothing to stream; there is no pty here the way Theme J's
 * `agent`/`script` nodes will have one), so "Logs" is a chronological replay
 * of the same events the Nodes tab shows as a table, not a second data
 * source. **Decision (unattended run, Theme I):** honest about that rather
 * than inventing a richer log the executor never produced.
 */
function buildLogLines(run: WorkflowRun): string[] {
  type Event = { at: number; text: string };
  const events: Event[] = [];
  for (const node of run.nodes) {
    if (node.startedAt !== undefined) events.push({ at: node.startedAt, text: `${node.label} — started` });
    if (node.endedAt !== undefined) {
      const suffix = node.error ? ` — ${node.error}` : '';
      events.push({ at: node.endedAt, text: `${node.label} — ${STATUS_LABEL[node.status]}${suffix}` });
    }
  }
  events.sort((a, b) => a.at - b.at);
  return events.map((e) => `[${formatClock(e.at)}] ${e.text}`);
}

/** The run as a markdown document — the panel's "Export as Markdown" button. */
export function runToMarkdown(run: WorkflowRun): string {
  const duration = run.endedAt !== undefined ? formatDuration(run.endedAt - run.startedAt) : 'in progress';
  const lines: string[] = [
    `# ${run.workflowName} — run ${run.id}`,
    '',
    `Status: **${run.status}** · Duration: ${duration}`,
    '',
    '## Nodes',
    '',
    '| Node | Kind | Status | Duration | Output / error |',
    '|---|---|---|---|---|',
  ];
  for (const node of run.nodes) {
    const nodeDuration =
      node.startedAt !== undefined && node.endedAt !== undefined ? formatDuration(node.endedAt - node.startedAt) : '—';
    const detail = (node.error ?? (node.output !== undefined ? JSON.stringify(node.output) : '—')).replace(/\|/g, '\\|').slice(0, 200);
    lines.push(`| ${node.label} | ${node.kind} | ${STATUS_LABEL[node.status]} | ${nodeDuration} | ${detail} |`);
  }
  lines.push('', '## Log', '', '```', ...buildLogLines(run), '```', '');
  return lines.join('\n');
}

function downloadMarkdown(run: WorkflowRun): void {
  const blob = new Blob([runToMarkdown(run)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${run.workflowName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow'}-run-${run.id.slice(0, 8)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type Tab = 'nodes' | 'logs';

/**
 * The workflow canvas's collapsible bottom run panel (Phase 95 Theme I,
 * ported from midnite's `run-output-panel.tsx`) — **Nodes** (each node's
 * status, duration and output/error) and **Logs** (the same events as a
 * chronological stream), plus a markdown export of the whole run.
 *
 * Shown whenever `workflows-view.tsx` has a "focused" run — either one
 * picked from history or one currently `running` — live or historical, edit
 * mode or run mode; see that file's own docblock for why editing keeps
 * working while a run's status paints the canvas ("live run state on the
 * editing canvas", the phase doc's own bullet).
 */
export function RunOutputPanel({
  run,
  workflowNodes,
  collapsed,
  onToggleCollapsed,
  height,
}: {
  run: WorkflowRun | null;
  /** The live workflow's own nodes (Theme D) — a `WorkflowNodeRun` carries no config, so a waiting `gate`'s title/instructions are read from here by `nodeId`, not from the run. */
  workflowNodes?: readonly WorkflowNode[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Live drag height from `workflows-view.tsx`'s `useResizable` — the panel is dumb about its own size. */
  height: number;
}) {
  const [tab, setTab] = useState<Tab>('nodes');

  return (
    <div className="flex shrink-0 flex-col border-t border-border">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleCollapsed}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggleCollapsed();
          }
        }}
        aria-expanded={!collapsed}
        className="flex w-full shrink-0 cursor-pointer items-center gap-1.5 border-b border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {collapsed ? <LuChevronUp aria-hidden className="h-3 w-3" /> : <LuChevronDown aria-hidden className="h-3 w-3" />}
        Run output
        {run ? (
          <span
            className="ml-1 font-normal"
            style={{
              color: activityStatusVar(
                STATUS_TO_ACTIVITY[
                  run.nodes.some((n) => n.status === 'waiting')
                    ? 'waiting'
                    : run.nodes.find((n) => n.status === 'running')
                      ? 'running'
                      : run.status === 'completed'
                        ? 'succeeded'
                        : run.status === 'failed'
                          ? 'failed'
                          // Phase 97 Theme G — an interrupted run is paused
                          // for the user, same token a waiting gate uses.
                          : run.status === 'interrupted'
                            ? 'waiting'
                            : 'pending'
                ],
              ),
            }}
          >
            {run.status}
          </span>
        ) : null}
        {!collapsed && run ? (
          <div className="ml-auto flex items-center gap-1">
            {run.status === 'interrupted' ? <ResumeRunButton runId={run.id} /> : null}
            <button
              type="button"
              title="Export run as Markdown"
              aria-label="Export run as Markdown"
              onClick={(event) => {
                event.stopPropagation();
                downloadMarkdown(run);
              }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background hover:text-foreground"
            >
              <LuDownload aria-hidden className="h-3 w-3" />
              Export
            </button>
          </div>
        ) : null}
      </div>

      {collapsed ? null : (
        <div className="flex min-h-0 flex-col" style={{ height }}>
          {!run ? (
            <EmptyState bodySize="xs" title="No run yet" body="Hit Run to see its nodes and logs here." />
          ) : (
            <>
              <div role="tablist" aria-label="Run output" className="flex shrink-0 gap-1 border-b border-border px-2 pt-1.5">
                {(['nodes', 'logs'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`rounded-t-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                      tab === id ? 'border border-b-0 border-border bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {id}
                  </button>
                ))}
              </div>

              <div className="hide-scrollbar min-h-0 flex-1 overflow-auto">
                {tab === 'nodes' ? (
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-background text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 font-medium">Node</th>
                        <th className="px-2 py-1 font-medium">Status</th>
                        <th className="px-2 py-1 font-medium">Duration</th>
                        <th className="px-2 py-1 font-medium">Output / error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.nodes.map((node) => {
                        const duration =
                          node.startedAt !== undefined && node.endedAt !== undefined
                            ? formatDuration(node.endedAt - node.startedAt)
                            : '—';
                        const detail = node.error ?? (node.output !== undefined ? (typeof node.output === 'string' ? node.output : JSON.stringify(node.output)) : '—');
                        const workflowNode = workflowNodes?.find((n) => n.id === node.nodeId);
                        const gateConfig = node.kind === 'gate' && workflowNode?.kind === 'gate' ? workflowNode.config : undefined;
                        return (
                          <Fragment key={node.nodeId}>
                            <tr className="border-t border-border/50">
                              <td className="px-2 py-1">
                                <span className="text-muted-foreground">{NODE_KIND_META[node.kind].label}</span>{' '}
                                {node.label}
                              </td>
                              <td className="px-2 py-1" style={{ color: activityStatusVar(STATUS_TO_ACTIVITY[node.status]) }}>
                                {STATUS_LABEL[node.status]}
                              </td>
                              <td className="px-2 py-1 tabular-nums text-muted-foreground">{duration}</td>
                              <td className={`max-w-[320px] truncate px-2 py-1 ${node.error ? 'text-destructive' : 'text-muted-foreground'}`} title={detail}>
                                {detail}
                                {node.truncated ? ' (truncated)' : ''}
                              </td>
                            </tr>
                            {node.status === 'waiting' ? (
                              <GateDecideRow runId={run.id} nodeId={node.nodeId} config={gateConfig} />
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <pre className="whitespace-pre-wrap break-words px-2 py-1.5 text-[11px] text-muted-foreground">
                    {buildLogLines(run).join('\n') || 'Nothing logged yet.'}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
