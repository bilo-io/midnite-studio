import { useMemo } from 'react';

import type { WorkflowsHost } from '@midnite/studio-feature-workflows/renderer';
import type { ActivityGlowSessionInput } from '@midnite/studio-frame';

import { Modal } from '../components/modal';
import { MultiSelectMenu } from '../components/multi-select-menu';
import { Popover } from '../components/popover';
import { TreeSection } from '../components/tree-section';
import { useDismiss } from '../components/use-dismiss';
import { resolveSessionAgentId, sessionPhase, useTerminalStore } from '../features/terminal/terminal-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's side of the workflows feature's host port (Phase 113 Theme N).
 *
 * The pane sizes and the three collapse flags stay in `ui-store`
 * (`layout.workflowListWidth`, `workflowDetailWidth`, `workflowRunPanelHeight`,
 * `workflowPaletteWidth`, `workflowPaletteCollapsed`, `workflowRunPanelCollapsed`,
 * `workflowInspectorCollapsed`), so moving the feature into a package changed no
 * stored key. A run's terminal sessions are the ones in the terminal store,
 * stamped with the run's own `workflowRunRef`.
 */
export const STUDIO_WORKFLOWS_HOST = {
  Modal,
  Popover,
  MultiSelectMenu,
  TreeSection,
  useDismiss,
  useLayout: () => {
    const layout = useUiStore((s) => s.layout);
    const setLayout = useUiStore((s) => s.setLayout);
    const paletteCollapsed = useUiStore((s) => s.workflowPaletteCollapsed);
    const setPaletteCollapsed = useUiStore((s) => s.setWorkflowPaletteCollapsed);
    const runPanelCollapsed = useUiStore((s) => s.workflowRunPanelCollapsed);
    const setRunPanelCollapsed = useUiStore((s) => s.setWorkflowRunPanelCollapsed);
    const inspectorCollapsed = useUiStore((s) => s.workflowInspectorCollapsed);
    const setInspectorCollapsed = useUiStore((s) => s.setWorkflowInspectorCollapsed);
    return {
      list: {
        size: layout.workflowListWidth,
        setSize: (value: number) => setLayout('workflowListWidth', value),
        initial: DEFAULT_LAYOUT.workflowListWidth,
        ...LAYOUT_BOUNDS.workflowListWidth,
      },
      detail: {
        size: layout.workflowDetailWidth,
        setSize: (value: number) => setLayout('workflowDetailWidth', value),
        initial: DEFAULT_LAYOUT.workflowDetailWidth,
        ...LAYOUT_BOUNDS.workflowDetailWidth,
      },
      runPanel: {
        size: layout.workflowRunPanelHeight,
        setSize: (value: number) => setLayout('workflowRunPanelHeight', value),
        initial: DEFAULT_LAYOUT.workflowRunPanelHeight,
        ...LAYOUT_BOUNDS.workflowRunPanelHeight,
      },
      paletteWidth: layout.workflowPaletteWidth,
      paletteCollapsed,
      setPaletteCollapsed,
      runPanelCollapsed,
      setRunPanelCollapsed,
      inspectorCollapsed,
      setInspectorCollapsed,
    };
  },
  useNodeSessions: (run) => {
    const sessions = useTerminalStore((s) => s.sessions);
    const states = useTerminalStore((s) => s.states);
    const activity = useTerminalStore((s) => s.activity);
    const liveAgentId = useTerminalStore((s) => s.liveAgentId);

    return useMemo(() => {
      const map = new Map<string, ActivityGlowSessionInput[]>();
      if (!run) return map;
      for (const session of sessions) {
        const ref = session.workflowRunRef;
        // Filtered on `runId`, not just `workflowId`: a workflow re-run while the previous run's
        // sessions are still winding down must not glow the NEW run's canvas with the OLD run's.
        if (!ref || ref.workflowId !== run.workflowId || ref.runId !== run.id) continue;
        const entry: ActivityGlowSessionInput = {
          sessionId: session.id,
          agentId: resolveSessionAgentId(session, liveAgentId),
          activity: activity[session.id],
          running: sessionPhase(session, states[session.id]) === 'live',
        };
        const existing = map.get(ref.nodeId);
        if (existing) existing.push(entry);
        else map.set(ref.nodeId, [entry]);
      }
      return map;
    }, [run, sessions, states, activity, liveAgentId]);
  },
} satisfies WorkflowsHost;
