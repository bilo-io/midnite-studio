import type { ComponentType, ReactNode } from 'react';

import { moduleOfView, type NavConfig } from './nav-config';

/** What a host renders for one module: its pane, given the active view id. */
export type ModulePane = ComponentType<{ view: string; onView: (view: string) => void }>;

/**
 * The host's view router (Phase 124 Theme E.3): finds the nav group the active view belongs to and renders
 * that module's pane (given the view and a way to report its own view changes). Each pane brings its own providers, so a module's host ports never leak into a sibling's
 * views. A view in no group renders `fallback` (nothing by default) rather than throwing.
 */
export function ModuleViewRouter({
  nav,
  view,
  onView,
  panes,
  fallback = null,
}: {
  nav: NavConfig;
  view: string;
  /** Hands a pane's own view change (its tab strip) back to the host's shell. */
  onView: (view: string) => void;
  panes: Readonly<Record<string, ModulePane | undefined>>;
  fallback?: ReactNode;
}) {
  const module = moduleOfView(nav, view);
  const Pane = module === undefined ? undefined : panes[module];
  return Pane === undefined ? <>{fallback}</> : <Pane key={module} view={view} onView={onView} />;
}
