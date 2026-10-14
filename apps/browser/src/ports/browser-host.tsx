import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isLoading?: boolean;
}

export interface BrowserWebApp {
  id: string;
  name: string;
  url: string;
  icon?: string;
  badge?: string;
}

export interface AgentSessionState {
  active: boolean;
  status: 'idle' | 'navigating' | 'inspecting' | 'verifying' | 'interacting';
  goal?: string;
  lastAction?: string;
  logs: string[];
}

export interface BrowserHost {
  getTabs: () => BrowserTab[];
  getActiveTab: () => BrowserTab | undefined;
  openTab: (url?: string) => string;
  closeTab: (id: string) => void;
  selectTab: (id: string) => void;
  navigate: (id: string, url: string) => void;
  goBack: (id: string) => void;
  goForward: (id: string) => void;
  reload: (id: string) => void;

  getWebApps: () => BrowserWebApp[];
  getActiveWebAppId: () => string | null;
  selectWebApp: (id: string | null) => void;
  toggleWebApp: (id: string) => void;

  getAgentSession: () => AgentSessionState;
  startAgentSession: (goal: string) => void;
  stopAgentSession: () => void;
  stepAgentSession: (action: string) => void;

  subscribe: (listener: () => void) => () => void;
}

export function createDefaultBrowserHost(initialTabs?: BrowserTab[]): BrowserHost {
  let tabs: BrowserTab[] = initialTabs ?? [
    {
      id: 'tab-1',
      url: 'https://github.com/bilo-io/midnite-apps',
      title: 'Midnite Apps',
      active: true,
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
    },
  ];

  const webApps: BrowserWebApp[] = [
    { id: 'slack', name: 'Slack', url: 'https://app.slack.com' },
    { id: 'linear', name: 'Linear', url: 'https://linear.app' },
    { id: 'github', name: 'GitHub', url: 'https://github.com' },
    { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com' },
  ];

  let activeWebAppId: string | null = null;

  let agentSession: AgentSessionState = {
    active: false,
    status: 'idle',
    logs: [],
  };

  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    getTabs: () => tabs,
    getActiveTab: () => tabs.find((t) => t.active) ?? tabs[0],
    openTab: (url = 'about:blank') => {
      activeWebAppId = null;
      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      tabs = [
        ...tabs.map((t) => ({ ...t, active: false })),
        { id, url, title: url === 'about:blank' ? 'New Tab' : url, active: true, canGoBack: false, canGoForward: false },
      ];
      emit();
      return id;
    },
    closeTab: (id: string) => {
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const wasActive = tabs[idx]?.active;
      tabs = tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) {
        tabs = [{ id: `tab-${Date.now()}`, url: 'about:blank', title: 'New Tab', active: true }];
      } else if (wasActive) {
        const nextActiveIdx = Math.min(idx, tabs.length - 1);
        const next = tabs[nextActiveIdx];
        if (next) next.active = true;
      }
      emit();
    },
    selectTab: (id: string) => {
      activeWebAppId = null;
      tabs = tabs.map((t) => ({ ...t, active: t.id === id }));
      emit();
    },
    navigate: (id: string, url: string) => {
      tabs = tabs.map((t) => (t.id === id ? { ...t, url, title: url, canGoBack: true } : t));
      emit();
    },
    goBack: (id: string) => {
      tabs = tabs.map((t) => (t.id === id ? { ...t, canGoBack: false, canGoForward: true } : t));
      emit();
    },
    goForward: (id: string) => {
      tabs = tabs.map((t) => (t.id === id ? { ...t, canGoBack: true, canGoForward: false } : t));
      emit();
    },
    reload: (id: string) => {
      tabs = tabs.map((t) => (t.id === id ? { ...t, isLoading: true } : t));
      emit();
      setTimeout(() => {
        tabs = tabs.map((t) => (t.id === id ? { ...t, isLoading: false } : t));
        emit();
      }, 50);
    },

    getWebApps: () => webApps,
    getActiveWebAppId: () => activeWebAppId,
    selectWebApp: (id: string | null) => {
      activeWebAppId = id;
      if (id !== null) {
        tabs = tabs.map((t) => ({ ...t, active: false }));
      } else if (!tabs.some((t) => t.active) && tabs[0]) {
        tabs[0].active = true;
      }
      emit();
    },
    toggleWebApp: (id: string) => {
      activeWebAppId = activeWebAppId === id ? null : id;
      if (activeWebAppId === null && !tabs.some((t) => t.active) && tabs[0]) {
        tabs[0].active = true;
      } else if (activeWebAppId !== null) {
        tabs = tabs.map((t) => ({ ...t, active: false }));
      }
      emit();
    },

    getAgentSession: () => agentSession,
    startAgentSession: (goal: string) => {
      agentSession = {
        active: true,
        status: 'navigating',
        goal,
        lastAction: `Started session: ${goal}`,
        logs: [`[agent] Session started with goal: ${goal}`],
      };
      emit();
    },
    stopAgentSession: () => {
      agentSession = {
        ...agentSession,
        active: false,
        status: 'idle',
        logs: [...agentSession.logs, '[agent] Session stopped by user'],
      };
      emit();
    },
    stepAgentSession: (action: string) => {
      agentSession = {
        ...agentSession,
        lastAction: action,
        status: 'interacting',
        logs: [...agentSession.logs, `[agent] ${action}`],
      };
      emit();
    },

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const BrowserHostContext = createContext<BrowserHost | null>(null);

export function BrowserHostProvider({
  host,
  children,
}: {
  host: BrowserHost;
  children: ReactNode;
}) {
  return <BrowserHostContext.Provider value={host}>{children}</BrowserHostContext.Provider>;
}

export function useBrowserHost(): BrowserHost {
  const host = useContext(BrowserHostContext);
  if (!host) {
    throw new Error('useBrowserHost must be used within a BrowserHostProvider');
  }
  return host;
}

export function useBrowserTabs(): BrowserTab[] {
  const host = useBrowserHost();
  return useSyncExternalStore(host.subscribe, host.getTabs, host.getTabs);
}

export function useActiveBrowserTab(): BrowserTab | undefined {
  const host = useBrowserHost();
  return useSyncExternalStore(host.subscribe, host.getActiveTab, host.getActiveTab);
}

export function useBrowserWebApps(): BrowserWebApp[] {
  const host = useBrowserHost();
  return useSyncExternalStore(host.subscribe, host.getWebApps, host.getWebApps);
}

export function useActiveWebAppId(): string | null {
  const host = useBrowserHost();
  return useSyncExternalStore(host.subscribe, host.getActiveWebAppId, host.getActiveWebAppId);
}

export function useAgentSession(): AgentSessionState {
  const host = useBrowserHost();
  return useSyncExternalStore(host.subscribe, host.getAgentSession, host.getAgentSession);
}
