import { useEffect, useRef } from 'react';

import { bridge } from '../../services/bridge';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { useWorkflowRevealStore } from '../../store/workflow-reveal-store';

/**
 * The notification bell's "workflow waiting on you" entry (Phase 97 Theme
 * D) — mounted once from `App`, the same way `useWorkflowNodeSessions` is: a
 * gate can start waiting with the Workflows view unmounted entirely, and the
 * bell is the one surface that must still say so.
 *
 * `workflowRunChanged` fires on every node settle in a run, not only when a
 * gate starts waiting — so this tracks which `runId:nodeId` pairs already
 * have a toast (`seen`, a plain ref map since it is write-once-read-once
 * bookkeeping, not render state) and adds one only on the `pending`/`running`
 * → `waiting` transition, removing it again once the gate leaves `waiting`
 * (decided from any of its other three channels, or the run cancelled) —
 * otherwise a bell entry would silently outlive the thing it was reporting.
 */
export function useWaitingGateToasts(): void {
  const seen = useRef(new Map<string, string>());

  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;

    return api.workflow.onRunChanged(({ run }) => {
      for (const node of run.nodes) {
        const key = `${run.id}:${node.nodeId}`;
        const existingToastId = seen.current.get(key);

        if (node.status === 'waiting' && existingToastId === undefined) {
          const id = crypto.randomUUID();
          seen.current.set(key, id);
          useToastStore.setState((state) => ({
            toasts: [
              ...state.toasts,
              {
                id,
                message: `"${run.workflowName}" is waiting on you — ${node.label}`,
                status: 'warning',
                action: {
                  label: 'Review',
                  onAction: () => {
                    useWorkflowRevealStore.getState().reveal({ workflowId: run.workflowId, runId: run.id });
                    useUiStore.getState().setActiveView('workflows');
                  },
                },
              },
            ],
          }));
        } else if (node.status !== 'waiting' && existingToastId !== undefined) {
          useToastStore.getState().removeToast(existingToastId);
          seen.current.delete(key);
        }
      }
    });
  }, []);
}
