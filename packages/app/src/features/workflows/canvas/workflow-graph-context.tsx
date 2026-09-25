import type { WorkflowEdge, WorkflowNode } from '@midnite/studio-shared';
import { createContext, useContext } from 'react';

/**
 * The live graph a `WorkflowNodeView` needs for connect-drag port dimming
 * (Phase 97 Theme J) — `canConnect` takes the dragged-from node/port plus
 * every existing edge, none of which a React-Flow-mounted node type receives
 * through its own `NodeProps` (that only carries this one node's `data`).
 * `WorkflowCanvasInner` provides this once per render from its own
 * `graphRef`-backed state; a node view reads it only while a connection
 * drag is in progress (`useConnection()`), so this never becomes the
 * rendering source of truth for the graph itself — `graph`/`onChange` keep
 * that role in `workflow-canvas.tsx`.
 */
export type WorkflowGraphContextValue = {
  nodesById: ReadonlyMap<string, WorkflowNode>;
  edges: readonly WorkflowEdge[];
};

export const WorkflowGraphContext = createContext<WorkflowGraphContextValue | null>(null);

/** `null` outside `WorkflowCanvas` (or in a test that mounts a node view standalone) — callers treat that as "no live graph to check against". */
export function useWorkflowGraphContext(): WorkflowGraphContextValue | null {
  return useContext(WorkflowGraphContext);
}
