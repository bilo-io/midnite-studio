import type { WorkflowNodeRun } from '@midnite/studio-shared';
import { LuTriangleAlert } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { NODE_KIND_META } from './node-kind-meta';

const STATUS_LABEL: Record<WorkflowNodeRun['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  timeout: 'Timed out',
  skipped: 'Skipped',
};

const STATUS_TONE: Record<WorkflowNodeRun['status'], string> = {
  pending: 'text-muted-foreground',
  running: 'text-blue-500',
  succeeded: 'text-green-500',
  failed: 'text-destructive',
  timeout: 'text-destructive',
  skipped: 'text-muted-foreground',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/**
 * The right-hand pane's run-mode content (Theme G) — what `NodeInspector`
 * swaps for while a run is being viewed. Shows what `WorkflowNodeRun`
 * actually records: status, duration, output (with the executor's own
 * `truncated` flag surfaced rather than silently dropped, per Theme C's
 * rule), and an error. There is no per-node "input" here — the schema never
 * captured one, so nothing here pretends otherwise.
 */
export function RunNodeDetail({ node }: { node: WorkflowNodeRun | null }) {
  if (!node) {
    return (
      <div className="flex w-80 shrink-0 flex-col border-l border-border">
        <EmptyState title="No node selected" body="Select a node on the canvas to see its result." />
      </div>
    );
  }

  const meta = NODE_KIND_META[node.kind];
  const Icon = meta.icon;
  const duration = node.startedAt !== undefined && node.endedAt !== undefined ? node.endedAt - node.startedAt : null;

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{node.label}</span>
        <span className={`shrink-0 text-[11px] font-medium ${STATUS_TONE[node.status]}`}>
          {STATUS_LABEL[node.status]}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 py-2 text-xs">
        {duration !== null ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Duration</p>
            <p className="mt-0.5">{formatDuration(duration)}</p>
          </div>
        ) : null}

        {node.gatedDownstream ? (
          <p className="flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5 text-muted-foreground">
            <LuTriangleAlert aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
            This condition did not hold — everything downstream of it was skipped.
          </p>
        ) : null}

        {node.error ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Error</p>
            <pre className="mt-0.5 whitespace-pre-wrap break-words rounded-md bg-destructive/10 px-2 py-1.5 text-destructive">
              {node.error}
            </pre>
          </div>
        ) : null}

        {node.output !== undefined ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Output</p>
            <pre className="mt-0.5 whitespace-pre-wrap break-words rounded-md border border-border bg-background px-2 py-1.5">
              {typeof node.output === 'string' ? node.output : JSON.stringify(node.output, null, 2)}
            </pre>
            {node.truncated ? <p className="mt-1 text-[11px] text-muted-foreground">Output truncated.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
