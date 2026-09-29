import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import {
  inspectorAutoCollapsed,
  inspectorAutoKey,
  useInspectorCollapse,
  type InspectorPanelKind,
} from './use-inspector-collapse';

/**
 * The inspector's auto-collapse/expand rule and its manual override. A hook
 * test, not a view mount: the rule is store state plus one layout effect, and
 * the canvas half (Escape, delete, pane click all arriving as an empty
 * selection) is `canvas/inspector-escape.test.tsx`'s.
 */
type Props = { selection: ReadonlySet<string>; panelKind: InspectorPanelKind };

function setup(initial: Props) {
  return renderHook((props: Props) => useInspectorCollapse(props), { initialProps: initial });
}

const none = (): ReadonlySet<string> => new Set();
const ids = (...values: string[]): ReadonlySet<string> => new Set(values);

describe('inspectorAutoCollapsed', () => {
  it('collapses only with nothing selected on the inspector entry', () => {
    expect(inspectorAutoCollapsed(0, 'inspector')).toBe(true);
    expect(inspectorAutoCollapsed(1, 'inspector')).toBe(false);
    expect(inspectorAutoCollapsed(3, 'inspector')).toBe(false);
    expect(inspectorAutoCollapsed(0, 'history')).toBe(false);
    expect(inspectorAutoCollapsed(0, 'run')).toBe(false);
  });

  it('keys on selection members, not their order or Set identity', () => {
    expect(inspectorAutoKey(ids('b', 'a'), 'inspector')).toBe(inspectorAutoKey(ids('a', 'b'), 'inspector'));
    expect(inspectorAutoKey(ids('a'), 'inspector')).not.toBe(inspectorAutoKey(ids('a'), 'history'));
  });
});

describe('useInspectorCollapse', () => {
  beforeEach(() => {
    // A persisted "open" from a previous session must not survive load.
    useUiStore.setState({ workflowInspectorCollapsed: false });
  });

  it('is collapsed on load, when nothing is selected', () => {
    const { result } = setup({ selection: none(), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(true);
  });

  it('expands when a node is selected, and collapses again when the selection empties', () => {
    const { result, rerender } = setup({ selection: none(), panelKind: 'inspector' });
    rerender({ selection: ids('n1'), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(false);
    // Empty-canvas click, Escape and deleting the selected node all land here.
    rerender({ selection: none(), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(true);
  });

  it('keeps a manual collapse while the selection is unchanged, and drops it when the selection changes', () => {
    const { result, rerender } = setup({ selection: ids('n1'), panelKind: 'inspector' });
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);

    // Same member, fresh Set — a re-render, not a selection change.
    rerender({ selection: ids('n1'), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(true);

    rerender({ selection: ids('n2'), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(false);
  });

  it('keeps a manual expand with nothing selected until the selection changes', () => {
    const { result, rerender } = setup({ selection: none(), panelKind: 'inspector' });
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    rerender({ selection: none(), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(false);
    rerender({ selection: ids('n1'), panelKind: 'inspector' });
    rerender({ selection: none(), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(true);
  });

  it('opens for run history and a run with nothing selected', () => {
    const { result, rerender } = setup({ selection: none(), panelKind: 'inspector' });
    rerender({ selection: none(), panelKind: 'history' });
    expect(result.current.collapsed).toBe(false);
    rerender({ selection: none(), panelKind: 'run' });
    expect(result.current.collapsed).toBe(false);
    rerender({ selection: none(), panelKind: 'inspector' });
    expect(result.current.collapsed).toBe(true);
  });

  it('writes the state to ui-store, beside the node palette’s own flag', () => {
    const { result } = setup({ selection: ids('n1'), panelKind: 'inspector' });
    act(() => result.current.toggle());
    expect(useUiStore.getState().workflowInspectorCollapsed).toBe(true);
  });
});
