import { useCallback, useEffect, useState } from 'react';

import { useBottomPanelStore } from './bottom-panel-store';
import { useResizable, type Resizable } from '../resizable/use-resizable';

export type BottomPanelOptions = {
  /** The height before the user chooses one, and what a double-click on the handle restores. */
  initial: number;
  min: number;
  /** The tallest the panel may get, before the window-height cap below. */
  max: number;
  /** Start collapsed until the user opens it. Defaults to expanded. */
  defaultCollapsed?: boolean;
};

export type BottomPanel = {
  /** The height to render while expanded: the live drag value during a drag, else the saved one. */
  height: number;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  /** Give this to a `ResizeHandle` (`axis="y"`) sitting on the panel's top edge. */
  resizable: Resizable;
};

/**
 * The share of the window a bottom panel may take. Past it the viewport above would be squeezed to
 * nothing, so the cap is a fraction of the window rather than a pixel count — a persisted height
 * from a tall monitor is clamped by `useResizable` the next time the window is short.
 */
const MAX_WINDOW_SHARE = 0.6;

const windowCap = (): number => (typeof window === 'undefined' ? Infinity : Math.round(window.innerHeight * MAX_WINDOW_SHARE));

/**
 * A panel docked to the bottom of a column: resizable by a handle on its top edge, collapsible to
 * its header row, and remembered across reloads under `id` (see {@link useBottomPanelStore}).
 *
 * Two call sites with the same `id` agree on state, so a header and the container around it may
 * each call the hook. Dragging well past `min` collapses the panel and keeps the saved height, so
 * re-opening it restores what the user last chose rather than the minimum they dragged through.
 */
export function useBottomPanel(id: string, { initial, min, max, defaultCollapsed = false }: BottomPanelOptions): BottomPanel {
  const saved = useBottomPanelStore((s) => s.panels[id]);
  const setSize = useBottomPanelStore((s) => s.setSize);
  const setCollapsedFor = useBottomPanelStore((s) => s.setCollapsed);
  const collapsed = saved?.collapsed ?? defaultCollapsed;

  const [cap, setCap] = useState(windowCap);
  useEffect(() => {
    const onResize = () => setCap(windowCap());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setCollapsed = useCallback((next: boolean) => setCollapsedFor(id, next), [id, setCollapsedFor]);
  const toggle = useCallback(() => setCollapsedFor(id, !collapsed), [id, collapsed, setCollapsedFor]);
  const onSize = useCallback((size: number) => setSize(id, size), [id, setSize]);
  const onCollapse = useCallback(() => setCollapsedFor(id, true), [id, setCollapsedFor]);

  const resizable = useResizable({
    size: saved?.size ?? initial,
    onSize,
    min,
    max: Math.max(min, Math.min(max, cap)),
    initial,
    axis: 'y',
    // The handle is above the panel, so dragging up (a smaller clientY) grows it.
    edge: 'end',
    onCollapse,
  });

  return { height: resizable.current, collapsed, setCollapsed, toggle, resizable };
}
