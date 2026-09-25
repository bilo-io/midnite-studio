import type { WorkflowNode } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuX } from 'react-icons/lu';

import { useDemoApiStatus, useStartDemoApi } from './use-demo-api';

/**
 * Whether a config field references the reserved `{{demo...}}` root (Phase 97
 * Theme M — `WORKFLOW_RESERVED_INTERPOLATION_ROOTS` in `shared/src/workflow.ts`).
 * Only `http` nodes can reference it today (Theme M's own scope), so this
 * checks exactly the fields `httpExecutor` interpolates.
 */
const REFERENCES_DEMO_ROOT = /\{\{\s*demo\b/;

function referencesDemoApi(node: WorkflowNode): boolean {
  if (node.kind !== 'http') return false;
  const { config } = node;
  const fields = [config.url, config.body, ...Object.values(config.headers), ...Object.values(config.params)];
  return fields.some((field) => field !== undefined && REFERENCES_DEMO_ROOT.test(field));
}

/**
 * "This workflow uses the demo API — it isn't running. [Start demo API]" —
 * shown above the canvas whenever the open workflow has an `http` node
 * referencing `{{demo.baseUrl}}` and the demo API isn't already running.
 *
 * The phase doc scopes this to "opening a template", but Theme L's template
 * gallery doesn't exist yet — checking the open workflow's own nodes is a
 * strict superset (a template opened later is a workflow like any other) and
 * needs no coupling to a gallery that isn't built.
 *
 * Dismissed per workflow id, in memory only — switching away and back (or a
 * reload) shows it again, which is the right default for a prompt whose whole
 * point is "you're about to hit a Demo API is not running failure."
 */
export function DemoApiOfferBanner({ workflowId, nodes }: { workflowId: string; nodes: WorkflowNode[] }) {
  const status = useDemoApiStatus();
  const start = useStartDemoApi();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const usesDemoApi = nodes.some(referencesDemoApi);
  if (!usesDemoApi || status.data.running || dismissedFor === workflowId) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent/40 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">
        This workflow uses the demo API ({'{{demo.baseUrl}}'}) — it isn&apos;t running.
      </span>
      <button
        type="button"
        disabled={start.isPending}
        onClick={() => start.mutate()}
        className="shrink-0 rounded px-2 py-0.5 font-medium text-foreground hover:bg-accent disabled:opacity-50"
      >
        {start.isPending ? 'Starting…' : 'Start demo API'}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => setDismissedFor(workflowId)}
        className="shrink-0 rounded p-0.5 hover:bg-accent"
      >
        <LuX className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
