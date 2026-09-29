import { useLayoutEffect } from 'react';

import { useUiStore } from '../../store/ui-store';

/** Which entry the right-hand panel stack is showing — `workflows-view.tsx`'s `WorkflowPanelEntry['kind']`. */
export type InspectorPanelKind = 'inspector' | 'history' | 'run';

/**
 * The auto rule for the Workflows editor's right-hand panel: **open whenever
 * it has something to show** — a node selected on the canvas, or the panel
 * navigated to run history / a run — and **collapsed otherwise**: on load,
 * after a click on the empty canvas, after Escape, after the selected node is
 * deleted.
 */
export function inspectorAutoCollapsed(selectionSize: number, panelKind: InspectorPanelKind): boolean {
  return selectionSize === 0 && panelKind === 'inspector';
}

/**
 * What the auto rule is keyed on — the selected ids (order-free) plus the
 * panel entry. It re-applies only when this changes, which is what makes a
 * manual toggle stick: collapse the inspector with a node selected and it
 * stays collapsed until the selection (or the panel entry) changes; selecting
 * the same node again is not a change, selecting another one is.
 */
export function inspectorAutoKey(selection: ReadonlySet<string>, panelKind: InspectorPanelKind): string {
  return `${panelKind}|${Array.from(selection).sort().join(',')}`;
}

/**
 * The inspector's collapsed state — held in `ui-store` as
 * `workflowInspectorCollapsed`, beside the node palette's own
 * `workflowPaletteCollapsed`, and toggled the same way. What the palette does
 * not have is the auto rule above, applied in a layout effect so the first
 * paint after a selection change already has the right width (a plain effect
 * would paint the stale width for a frame, and the width transition would
 * then animate away from it).
 */
export function useInspectorCollapse({
  selection,
  panelKind,
}: {
  selection: ReadonlySet<string>;
  panelKind: InspectorPanelKind;
}): { collapsed: boolean; toggle: () => void } {
  const collapsed = useUiStore((s) => s.workflowInspectorCollapsed);
  const setCollapsed = useUiStore((s) => s.setWorkflowInspectorCollapsed);
  const key = inspectorAutoKey(selection, panelKind);

  useLayoutEffect(() => {
    setCollapsed(inspectorAutoCollapsed(selection.size, panelKind));
    // Keyed on `key` alone: it already encodes `selection` and `panelKind`,
    // and a new Set with the same members is deliberately NOT a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCollapsed]);

  return { collapsed, toggle: () => setCollapsed(!collapsed) };
}
