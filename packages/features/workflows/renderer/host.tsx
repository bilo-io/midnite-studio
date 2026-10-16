import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type { ActivityGlowSessionInput } from '@midnite/studio-frame';
import type { WorkflowRun } from '@midnite/studio-shared';

/**
 * The workflows feature's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme N).
 *
 * The Graphs view draws on chrome that sits on app state, and every seam is
 * declared here with only the props the view passes, so its call sites read as
 * they always did while the implementation is whichever the composing app
 * installed:
 *
 * - **Chrome with occluders and a dismiss stack** — `Modal`, `Popover`,
 *   `MultiSelectMenu` count occluders and clamp to the content area, and
 *   `useDismiss` is Studio's layered Escape stack (an app with one window
 *   installs a plain Escape listener).
 * - **`TreeSection`** — the sidebar's collapsible group, still an app component.
 * - **Persisted layout** — the list, detail and run-panel sizes and the three
 *   collapse flags live in the app's layout store, so a user's widths survive the move.
 * - **`useNodeSessions`** — an `agent`/`script` node runs in a terminal session in
 *   Studio, which the canvas draws as a live glow and badge. An app with no terminal
 *   (Agents) answers an empty map and the node shows its run-state colour alone.
 */

export type WorkflowsModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  testId?: string;
};

export type WorkflowsPopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

export type WorkflowsMultiSelectOption = {
  value: string;
  label: string;
  keywords?: string;
  icon?: ReactNode;
  meta?: ReactNode;
};

export type WorkflowsMultiSelectMenuProps = {
  options: readonly WorkflowsMultiSelectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  icon: ReactNode;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  label: string;
  summarise: (count: number) => string;
};

export type WorkflowsTreeSectionProps = {
  title: string;
  count?: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
};

export type WorkflowsDismissOptions = { layer?: 'inline'; blocking?: boolean };

/** A persisted pane size: the stored size, how to store one, and its bounds. */
export type WorkflowsPaneSize = {
  size: number;
  setSize: (value: number) => void;
  initial: number;
  min: number;
  max: number;
};

export type WorkflowsLayout = {
  /** The graph list's width. */
  list: WorkflowsPaneSize;
  /** The right-hand inspector / history / run panel's width. */
  detail: WorkflowsPaneSize;
  /** The run output panel's height. */
  runPanel: WorkflowsPaneSize;
  /** The node palette's fixed width (it collapses to zero rather than resizing). */
  paletteWidth: number;
  paletteCollapsed: boolean;
  setPaletteCollapsed: (collapsed: boolean) => void;
  runPanelCollapsed: boolean;
  setRunPanelCollapsed: (collapsed: boolean) => void;
  inspectorCollapsed: boolean;
  setInspectorCollapsed: (collapsed: boolean) => void;
};

export type WorkflowsHost = {
  Modal: ComponentType<WorkflowsModalProps>;
  Popover: ComponentType<WorkflowsPopoverProps>;
  MultiSelectMenu: ComponentType<WorkflowsMultiSelectMenuProps>;
  TreeSection: ComponentType<WorkflowsTreeSectionProps>;
  /** Registers an Escape handler on the app's dismiss stack while `active`. A hook. */
  useDismiss: (active: boolean, onDismiss: () => void, options?: WorkflowsDismissOptions) => void;
  /** The persisted pane sizes and collapse flags. A hook. */
  useLayout: () => WorkflowsLayout;
  /**
   * The live terminal sessions of one run, grouped by node id, in the shape the activity glow
   * reads. A hook; an app with no terminal sessions answers an empty map.
   */
  useNodeSessions: (run: WorkflowRun | null) => ReadonlyMap<string, readonly ActivityGlowSessionInput[]>;
};

const WorkflowsHostContext = createContext<WorkflowsHost | null>(null);

export function WorkflowsHostProvider({ host, children }: { host: WorkflowsHost; children: ReactNode }) {
  return <WorkflowsHostContext.Provider value={host}>{children}</WorkflowsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the view would have no sizes and no chrome. */
export function useWorkflowsHost(): WorkflowsHost {
  const host = useContext(WorkflowsHostContext);
  if (!host) throw new Error('The workflows feature must be rendered inside <WorkflowsHostProvider>');
  return host;
}
