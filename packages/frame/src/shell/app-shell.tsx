import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';

import { AppFrame, ShellProviders, TitleBar, type NavConfig as ShellNavConfig } from '@bilo-io/shell';
import type { SuiteAppId } from '@midnite/studio-shared';
import { QueryClient } from '@tanstack/react-query';
import { LuSettings } from 'react-icons/lu';

import { bridge } from '../bridge';
import { CONTENT_BOX } from '../layout/content-box';
import { appLogoUrl } from './app-logo';
import { TitleBarCluster } from './titlebar/titlebar-cluster';
import { SETTINGS_VIEW, navChordFor, pathForNavView, type NavConfig } from './nav-config';
import { APP_ACCENT_ACTIVE_CLASS, createViewLink, type ViewLinkOptions, type ViewLinkTooltip } from './view-link';

export type AppShellPanels = {
  terminal?: ComponentType;
  companion?: ComponentType;
  fab?: ComponentType;
};

export type AppShellProps = {
  app: SuiteAppId;
  name: string;
  /** The app's brand colour — the logo tile and the active nav row only (decision 11). */
  accent: string;
  nav: NavConfig;
  activeView: string;
  onNavigate(view: string): void;
  /** Each panel's component, from the app's composer. The frame imports no feature, so it mounts only these. */
  panels?: AppShellPanels;
  /** The status bar (Theme J). */
  footer?: ReactNode;
  /** Studio's agent / Ollama trio — renders ahead of the suite-wide right cluster. */
  titleBarEnd?: ReactNode;
  /** A view's chord for its rail tooltip. Defaults to each view's `command` chord; Studio passes `navChord`. */
  chordFor?: (view: string) => string | undefined;
  /** The rail tooltip. Studio passes its own `Tooltip`; other apps take the frame's default. */
  tooltip?: ViewLinkTooltip;
  /** The query client `ShellProviders` needs. Defaults to one the shell owns; Studio passes `appQueryClient`. */
  queryClient?: QueryClient;
  /** The active view. Fills a slot that clips (`overflow-hidden`) — each view owns its own scroll. */
  children: ReactNode;
};

/**
 * The shell every suite app wears (Phase 123 Theme B): `ShellProviders` > `AppFrame` with the
 * frameless `TitleBar`, a rail built from the manifest's `nav` with the app's logo at its head and
 * Settings at its foot, and named slots for the panels, the status bar and Studio's title-bar extras.
 *
 * Under a framed window (`windowChrome.frameless === false`, or no bridge at all) `TitleBar` renders
 * nothing, so the shell draws the same slim strip Studio's `framed` branch does, inside the content box
 * so the document never grows taller than the viewport.
 */
export function AppShell({ queryClient, ...props }: AppShellProps) {
  const [ownClient] = useState(() => queryClient ?? new QueryClient());
  return (
    <ShellProviders queryClient={queryClient ?? ownClient}>
      <AppShellFrame {...props} />
    </ShellProviders>
  );
}

function AppShellFrame({
  app,
  name,
  accent,
  nav,
  activeView,
  onNavigate,
  panels,
  footer,
  titleBarEnd,
  chordFor,
  tooltip,
  children,
}: Omit<AppShellProps, 'queryClient'>) {
  const windowChrome = bridge()?.windowChrome ?? null;
  const framed = !windowChrome?.frameless;
  const logo = appLogoUrl(app);

  const resolvedChordFor = useMemo(() => chordFor ?? navChordFor(nav), [chordFor, nav]);
  // The link component's identity must not follow a caller's inline `onNavigate` / `chordFor`: a new
  // component type on every render would remount every rail row and drop keyboard focus mid-Tab. So the
  // component is built once per tooltip and reads the latest callbacks through refs.
  const navigateRef = useRef(onNavigate);
  const chordRef = useRef(resolvedChordFor);
  useLayoutEffect(() => {
    navigateRef.current = onNavigate;
    chordRef.current = resolvedChordFor;
  });
  const navigate = useCallback((view: string) => navigateRef.current(view), []);
  const ViewLink = useMemo(() => {
    const options: ViewLinkOptions = tooltip === undefined ? {} : { Tooltip: tooltip };
    return createViewLink(navigate, (view) => chordRef.current(view), options);
  }, [navigate, tooltip]);

  const settingsActive = activeView === SETTINGS_VIEW;
  const shellNav = useMemo<ShellNavConfig>(
    () => ({
      // A grouped nav (Phase 124 Theme E) is one titled section per module; a flat one is pinned rows.
      pinned:
        nav.groups !== undefined
          ? []
          : nav.views.map(({ id, label, icon: Icon }) => ({
              href: pathForNavView(id),
              label,
              icon: <Icon className="h-4 w-4" />,
            })),
      sections: (nav.groups ?? []).map((group) => ({
        key: group.id,
        title: group.label,
        collapsible: false,
        items: group.views.map(({ id, label, icon: Icon }) => ({
          href: pathForNavView(id),
          label,
          icon: <Icon className="h-4 w-4" />,
        })),
      })),
      brand: ({ expanded }) => (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <span
            data-testid="app-logo-tile"
            className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md"
            style={{ backgroundColor: 'var(--app-accent)' }}
          >
            <img src={logo} alt={name} className="h-full w-full object-cover" draggable={false} />
          </span>
          {expanded ? (
            <span aria-hidden className="truncate text-sm font-semibold">
              {name}
            </span>
          ) : null}
        </div>
      ),
      // Settings, last in the rail's footer — Studio's markup (`app.tsx`'s footer slot), so the row
      // reads as a nav item even though the shell's footer is free-form.
      footer: ({ expanded }) => (
        <div className="flex w-full flex-col gap-1 pb-3">
          <button
            type="button"
            onClick={() => navigate(SETTINGS_VIEW)}
            aria-label="Settings"
            aria-current={settingsActive ? 'page' : undefined}
            title="Settings"
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
              settingsActive
                ? `bg-primary/10 text-foreground ${APP_ACCENT_ACTIVE_CLASS}`
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            } ${expanded ? '' : 'justify-center'}`}
          >
            <LuSettings aria-hidden className="h-4 w-4 shrink-0" />
            {expanded ? <span>Settings</span> : null}
          </button>
        </div>
      ),
    }),
    [nav, logo, name, navigate, settingsActive],
  );

  // The suite-wide right cluster (Theme J.4): the status pill, the battery and the theme toggle, always
  // after `titleBarEnd`.
  const rightCluster = (
    <div className="flex items-center gap-2" data-testid="app-shell-titlebar-end">
      {titleBarEnd}
      <TitleBarCluster />
    </div>
  );

  const titleBar = (
    <TitleBar
      className="titlebar-root"
      windowChrome={windowChrome}
      left={<span className="truncate text-xs font-medium text-muted-foreground">{name}</span>}
      right={rightCluster}
    />
  );

  const Terminal = panels?.terminal;
  const Companion = panels?.companion;
  const Fab = panels?.fab;

  return (
    <div className="app-shell" data-app={app} style={{ '--app-accent': accent } as CSSProperties}>
      <AppFrame nav={shellNav} activePath={pathForNavView(activeView)} linkComponent={ViewLink} navLabel="Views" titleBar={titleBar}>
        <div className="flex flex-col" style={CONTENT_BOX}>
          {framed ? (
            <div
              data-testid="app-shell-framed-strip"
              className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3"
            >
              <span className="truncate text-xs font-medium text-muted-foreground">{name}</span>
              {rightCluster}
            </div>
          ) : null}
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div data-testid="app-shell-view" className="relative min-h-0 flex-1 overflow-hidden">
                {children}
              </div>
              {Terminal ? (
                <div data-shell-panel="terminal" className="shrink-0">
                  <Terminal />
                </div>
              ) : null}
            </div>
            {Companion ? (
              <div data-shell-panel="companion" className="shrink-0">
                <Companion />
              </div>
            ) : null}
          </div>
          {footer}
        </div>
        {Fab ? (
          <div data-shell-panel="fab">
            <Fab />
          </div>
        ) : null}
      </AppFrame>
    </div>
  );
}
