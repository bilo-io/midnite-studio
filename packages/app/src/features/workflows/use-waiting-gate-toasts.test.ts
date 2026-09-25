import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, WorkflowRun } from '@midnite/studio-shared';

import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { useWorkflowRevealStore } from '../../store/workflow-reveal-store';
import { useWaitingGateToasts } from './use-waiting-gate-toasts';

type Listener = (event: { workflowId: string; run: WorkflowRun }) => void;

function installBridge() {
  let listener: Listener | null = null;
  const onRunChanged = vi.fn((handler: Listener) => {
    listener = handler;
    return () => {
      listener = null;
    };
  });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: { onRunChanged } as unknown as MidniteStudioBridge['workflow'],
  } as Partial<MidniteStudioBridge>;
  return {
    emit: (run: WorkflowRun) => listener?.({ workflowId: run.workflowId, run }),
  };
}

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    workflowName: 'Ship it',
    status: 'running',
    nodes: [],
    edges: [],
    startedAt: 0,
    ...overrides,
  };
}

describe('useWaitingGateToasts (Phase 97 Theme D)', () => {
  afterEach(() => {
    cleanup();
    useToastStore.setState({ toasts: [] });
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('adds a toast the moment a gate node starts waiting', () => {
    const { emit } = installBridge();
    renderHook(() => useWaitingGateToasts());

    emit(
      run({
        nodes: [
          { nodeId: 'g1', kind: 'gate', label: 'Ship it?', status: 'waiting', truncated: false, gatedDownstream: false },
        ],
      }),
    );

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.message).toBe('"Ship it" is waiting on you — Ship it?');
    expect(toasts[0]!.status).toBe('warning');
  });

  it('never adds a second toast for the same node while it is still waiting', () => {
    const { emit } = installBridge();
    renderHook(() => useWaitingGateToasts());

    const waitingRun = run({
      nodes: [
        { nodeId: 'g1', kind: 'gate', label: 'Ship it?', status: 'waiting', truncated: false, gatedDownstream: false },
      ],
    });
    emit(waitingRun);
    emit(waitingRun); // a later, unrelated settle in the same run re-fires the event

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('removes the toast once the gate is decided', () => {
    const { emit } = installBridge();
    renderHook(() => useWaitingGateToasts());

    emit(
      run({
        nodes: [
          { nodeId: 'g1', kind: 'gate', label: 'Ship it?', status: 'waiting', truncated: false, gatedDownstream: false },
        ],
      }),
    );
    expect(useToastStore.getState().toasts).toHaveLength(1);

    emit(
      run({
        nodes: [
          {
            nodeId: 'g1',
            kind: 'gate',
            label: 'Ship it?',
            status: 'succeeded',
            settledPort: 'approved',
            truncated: false,
            gatedDownstream: false,
          },
        ],
      }),
    );
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("the toast's action reveals the run and switches to the Workflows view", () => {
    const { emit } = installBridge();
    renderHook(() => useWaitingGateToasts());

    emit(
      run({
        nodes: [
          { nodeId: 'g1', kind: 'gate', label: 'Ship it?', status: 'waiting', truncated: false, gatedDownstream: false },
        ],
      }),
    );

    useToastStore.getState().toasts[0]!.action!.onAction();

    expect(useWorkflowRevealStore.getState().pending).toEqual({ workflowId: 'wf-1', runId: 'run-1' });
    expect(useUiStore.getState().activeView).toBe('workflows');
  });
});
