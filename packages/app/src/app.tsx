import { useCallback, useEffect, useMemo } from 'react';

import { ThemeToggle } from '@bilo-io/ui';
import {
  AppFrame,
  ShellProviders,
  TitleBar,
  type NavConfig,
  type NavLinkComponent,
} from '@bilo-io/shell';
import { QueryClient } from '@tanstack/react-query';

import { GraphView } from './features/graph/graph-view';
import { DialogHost } from './components/dialog-host';
import { ReposPanel } from './features/repos/repos-panel';
import { StatusPanel } from './features/status/status-panel';
import { useDefaultSelection } from './features/repos/use-default-selection';
import { hslTokenToHex } from './lib/color';
import { bridge } from './services/bridge';
import { pathForView, useUiStore, viewForPath, type ViewId } from './store/ui-store';

/**
 * A QueryClient tuned for a desktop app talking to its own main process.
 *
 * No network is involved, so the usual web defaults are wrong: refetching on
 * window focus would re-run `git status` every time the user alts back into the
 * app, and retrying a failed call three times just delays an error the UI wants
 * to show. Freshness comes from the repo watcher invalidating precisely what
 * changed (Phase 10), not from polling.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});

/**
 * AppFrame is router-agnostic: it takes an `activePath` string and renders links
 * through an injected component. There's no router here — a desktop window has
 * no address bar and no deep links — so navigation is a store write and the
 * "link" is a button that looks like one.
 */
const ViewLink: NavLinkComponent = ({ href, className, children, ...rest }) => {
  const setActiveView = useUiStore((s) => s.setActiveView);
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        setActiveView(viewForPath(href));
      }}
      {...rest}
    >
      {children}
    </a>
  );
};

/**
 * The app column's box: full viewport height minus the title bar, pushed below
 * it. `--titlebar-h` is published by <TitleBar> while mounted and is absent in a
 * framed window, where the fallback of 0 is exactly right.
 */
const CONTENT_BOX = {
  height: 'calc(100vh - var(--titlebar-h, 0px))',
  marginTop: 'var(--titlebar-h, 0px)',
} as const;

const NAV_ITEMS: { view: ViewId; label: string; icon: string }[] = [
  { view: 'graph', label: 'Graph', icon: '⑂' },
  { view: 'changes', label: 'Changes', icon: '±' },
  { view: 'settings', label: 'Settings', icon: '⚙' },
];

function Placeholder({ view }: { view: ViewId }) {
  const label = NAV_ITEMS.find((i) => i.view === view)?.label ?? view;
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="text-5xl leading-none" aria-hidden>
        🌒
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{label}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {selectedRepoId ? (
          <>
            Active checkout:{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs" data-selectable>
              {selectedWorktreePath ?? 'main worktree'}
            </code>
            . The {label.toLowerCase()} view lands in a later phase — see{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">todo/</code>.
          </>
        ) : (
          <>Select a repository on the left to get started.</>
        )}
      </p>
    </div>
  );
}

function Shell() {
  const activeView = useUiStore((s) => s.activeView);
  useDefaultSelection();

  const nav: NavConfig = useMemo(
    () => ({
      sections: [
        {
          key: 'workspace',
          items: NAV_ITEMS.map((item) => ({
            href: pathForView(item.view),
            label: item.label,
            icon: (
              <span aria-hidden className="text-base leading-none">
                {item.icon}
              </span>
            ),
          })),
        },
      ],
      brand: ({ expanded }) => (
        <div className="flex items-center gap-2 px-1 font-semibold tracking-tight">
          <span aria-hidden className="text-lg leading-none">
            🌒
          </span>
          {expanded ? (
            <span className="text-sm">
              midnite <span className="font-normal text-muted-foreground">git</span>
            </span>
          ) : null}
        </div>
      ),
      footer: () => <ThemeToggle />,
    }),
    [],
  );

  // <TitleBar> renders nothing unless the bridge reports a frameless window, so
  // this is safe in a browser/jsdom context and on platforms that keep their
  // native frame.
  const windowChrome = bridge()?.windowChrome ?? null;

  const titleBar = (
    <TitleBar
      windowChrome={windowChrome}
      left={<span className="text-xs font-medium text-muted-foreground">midnite-git</span>}
    />
  );

  return (
    <AppFrame
      nav={nav}
      activePath={pathForView(activeView)}
      linkComponent={ViewLink}
      navMode="auto"
      navLabel="Views"
      titleBar={titleBar}
    >
      {/*
        The repositories panel is a fixed-width column beside the content, not
        part of AppFrame's rail: the rail is view navigation (which is global),
        while this is the app's primary object list and has to stay visible
        whichever view is active — the same split VS Code makes.

        The offset is the host's job. AppFrame pads `<main>` on the left for the
        fixed rail but NOT on the top for the title bar — the bar publishes its
        height as `--titlebar-h` on :root precisely so the in-flow app column can
        offset itself. Without this the first rows of the panel render behind the
        bar, which looks like a missing header rather than a layout bug.
      */}
      <div className="flex min-h-0" style={CONTENT_BOX}>
        <aside className="w-64 shrink-0">
          <ReposPanel />
        </aside>
        <div className="min-w-0 flex-1">
          {activeView === 'graph' ? (
            <GraphView />
          ) : activeView === 'changes' ? (
            <StatusPanel />
          ) : (
            <Placeholder view={activeView} />
          )}
        </div>
      </div>
    </AppFrame>
  );
}

/**
 * Keeps the native window backing in step with the app theme.
 *
 * Without it a resize or a rounded corner shows the launch background against a
 * light-theme UI — the window's own colour is Electron's, not the DOM's, and
 * nothing in the renderer updates it implicitly.
 */
function useWindowBackgroundSync(): void {
  const sync = useCallback(() => {
    const chrome = bridge()?.windowChrome;
    if (!chrome) return;
    const styles = getComputedStyle(document.documentElement);
    const background = styles.getPropertyValue('--background').trim();
    if (!background) return;
    chrome.setBackgroundColor(hslTokenToHex(background));
  }, []);

  // Re-run whenever the `dark` class flips on <html> — ThemeProvider's only
  // observable signal, and cheaper than subscribing to its context from here.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, [sync]);
}

export function App() {
  useWindowBackgroundSync();
  return (
    <ShellProviders queryClient={queryClient}>
      <DialogHost>
        <Shell />
      </DialogHost>
    </ShellProviders>
  );
}
