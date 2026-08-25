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

const NAV_ITEMS: { view: ViewId; label: string; icon: string }[] = [
  { view: 'graph', label: 'Graph', icon: '⑂' },
  { view: 'changes', label: 'Changes', icon: '±' },
  { view: 'settings', label: 'Settings', icon: '⚙' },
];

function Placeholder({ view }: { view: ViewId }) {
  const label = NAV_ITEMS.find((i) => i.view === view)?.label ?? view;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="text-5xl leading-none" aria-hidden>
        🌒
      </div>
      <h1 className="text-lg font-semibold tracking-tight">midnite-git</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The shell is up. <span className="font-medium text-foreground">{label}</span> lands in a
        later phase — see <code className="rounded bg-muted px-1 py-0.5 text-xs">todo/</code>.
      </p>
    </div>
  );
}

function Shell() {
  const activeView = useUiStore((s) => s.activeView);

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
      <Placeholder view={activeView} />
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
      <Shell />
    </ShellProviders>
  );
}
