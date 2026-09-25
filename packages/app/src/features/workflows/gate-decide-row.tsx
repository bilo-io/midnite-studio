import { useState } from 'react';
import { LuCheck, LuX } from 'react-icons/lu';

import type { WorkflowGateConfig } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';

/**
 * The run panel's own approve/reject control (Phase 97 Theme D) — rendered
 * as a second row directly under a `gate` node whose `WorkflowNodeRun.status`
 * is `'waiting'`. One of the phase doc's four decide surfaces; the others are
 * the notification bell (`use-waiting-gate-toasts.ts`), an MCP tool
 * (`workflow_gate_decide`), and — when the gate's own `linkedRef` is set — a
 * PR/issue comment (`gate-forge-service.ts`, main-only).
 *
 * No local "decided" state to hide behind: the row disappears on its own
 * once the node's `status` moves off `'waiting'`, which arrives over the
 * same `workflowRunChanged` push every other live cell in this panel already
 * repaints from — a second local flag here would just be a second source of
 * truth that could say something different from the run itself.
 */
export function GateDecideRow({
  runId,
  nodeId,
  config,
}: {
  runId: string;
  nodeId: string;
  /** `undefined` when the run outlived the node it belonged to (a deleted/renamed node) — the row still renders, just with no instructions to show. */
  config: WorkflowGateConfig | undefined;
}) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'approved' | 'rejected') => {
    setPending(decision);
    setError(null);
    const result = await bridge()?.workflow.gateDecide({
      runId,
      nodeId,
      decision,
      note: note.trim() === '' ? undefined : note.trim(),
    });
    setPending(null);
    // `GitOpResult`'s `kind: 'conflict'` arm is structurally possible but
    // never actually produced by `decideWorkflowGate` — there is no merge
    // here to conflict — so it gets a generic fallback rather than a branch
    // this call site can never really reach.
    if (result && !result.ok) setError(result.kind === 'error' ? result.message : 'Could not decide.');
  };

  return (
    <tr className="border-t border-border/50 bg-[hsl(var(--activity-waiting)/0.08)]">
      <td colSpan={4} className="px-2 py-2">
        <div className="flex flex-col gap-1.5">
          {config?.title ? <p className="text-xs font-medium text-foreground">{config.title}</p> : null}
          {config?.instructions ? (
            <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">{config.instructions}</p>
          ) : null}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note"
              aria-label="Decision note"
              className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-[11px] text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void decide('rejected')}
              className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LuX aria-hidden className="h-3 w-3" />
              Reject
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void decide('approved')}
              className="flex h-6 items-center gap-1 rounded-md bg-[hsl(var(--success))] px-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LuCheck aria-hidden className="h-3 w-3" />
              Approve
            </button>
          </div>
          {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
        </div>
      </td>
    </tr>
  );
}
