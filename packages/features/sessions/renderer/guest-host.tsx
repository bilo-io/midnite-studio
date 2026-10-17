import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useMemo, useState, type ComponentType } from 'react';
import { LuBot } from 'react-icons/lu';
import type { z } from 'zod';
import { create } from 'zustand';

import {
  bridge,
  ExplorerNotice,
  RingSpinner,
  type GitMultiSelectProps,
  type GitTooltipProps,
} from '@midnite/studio-frame';
import { BUILTIN_AGENTS, type schemas, type TerminalSession } from '@midnite/studio-shared';

import type { SessionsHost, SessionsSelection } from './host';
import type { ManagedLiveSession, ManagedSession } from './session-order';

type TerminalList = z.infer<typeof schemas.TerminalListResponse>;

/** Where a guest app's listing is cached — one query, read by the list and by the live pane. */
export const GUEST_SESSIONS_KEY = ['sessions', 'guest', 'list'] as const;

/** How often the list is re-read. A guest hears no create or exit for sessions it did not open. */
const POLL_MS = 3000;

function useGuestList() {
  return useQuery<TerminalList>({
    queryKey: GUEST_SESSIONS_KEY,
    queryFn: async () => (await bridge()?.terminal.list()) ?? { sessions: [] },
    refetchInterval: POLL_MS,
  });
}

const NO_SESSIONS: readonly TerminalSession[] = [];

function useGuestLiveSessions(): readonly TerminalSession[] {
  const sessions = useGuestList().data?.sessions;
  return useMemo(() => (sessions ? sessions.map((row) => row.session) : NO_SESSIONS), [sessions]);
}

/** xterm in its own chunk: it loads the first time a live row is opened, not with the app. */
const GuestTerminal = lazy(() => import('./guest-terminal').then((m) => ({ default: m.GuestTerminal })));

/** The pane for a live row: the host broker's pty, attached; or why there is nothing to attach to. */
function GuestLivePane({ session }: { session: ManagedLiveSession; rawSession: TerminalSession | null }) {
  const list = useGuestList();
  const row = list.data?.sessions.find((r) => r.session.id === session.id);
  if (!row?.live) return <ExplorerNotice>This session is not running in the shared terminal broker any more.</ExplorerNotice>;
  return (
    <Suspense fallback={<RingSpinner label="Attaching to the session" size="sm" />}>
      <GuestTerminal key={row.live.ptyId} ptyId={row.live.ptyId} title={session.name ?? session.title} />
    </Suspense>
  );
}

export type GuestSessionsHostOptions = {
  /** Where the list's width persists, in this window's localStorage. */
  storageKey: string;
  Tooltip: ComponentType<GitTooltipProps>;
  MultiSelectMenu: ComponentType<GitMultiSelectProps>;
};

const WIDTH = { initial: 300, min: 220, max: 560 };
const NO_CASCADE = { active: false, styleFor: () => ({}) };

/**
 * The host an app with no pty server composes the Sessions view with (Coder, Phase 113 Theme O
 * slice 4): the runtime host's sessions over the guest channels (`main/guest-sessions.ts`), polled; a
 * live row attaches a {@link GuestTerminal}. Live rows only — the closed-session archive is the host
 * app's — and none of the controls that would start or end a session: no resume and no kill, since this
 * app starts nothing (the broker would refuse a guest's kill of a session it did not create anyway).
 */
export function createGuestSessionsHost(options: GuestSessionsHostOptions): SessionsHost {
  const selection = create<SessionsSelection>((set) => ({
    closedId: null,
    liveId: null,
    selectClosed: (closedId) => set({ closedId }),
    selectLive: (liveId) => set({ liveId }),
  }));

  function useListWidth() {
    const [size, setState] = useState(() => {
      try {
        const stored = Number(window.localStorage.getItem(`${options.storageKey}.listWidth`));
        return Number.isFinite(stored) && stored > 0 ? stored : WIDTH.initial;
      } catch {
        return WIDTH.initial;
      }
    });
    const setSize = useCallback((value: number) => {
      setState(value);
      try {
        window.localStorage.setItem(`${options.storageKey}.listWidth`, String(value));
      } catch {
        // Private window or blocked storage: the width lasts for this session.
      }
    }, []);
    return { size, setSize, ...WIDTH };
  }

  function useLiveStatus(session: ManagedSession) {
    const list = useGuestList();
    const live = list.data?.sessions.find((r) => r.session.id === session.id)?.live;
    return { connectionState: live ? ('open' as const) : undefined, activity: live?.activity ?? undefined, agentId: session.agentId };
  }

  return {
    useLiveSessions: useGuestLiveSessions,
    useLiveStatus,
    useAgents: () => BUILTIN_AGENTS,
    useSelection: () => selection(),
    useListWidth,
    LivePane: GuestLivePane,
    useCascadeReveal: () => NO_CASCADE,
    useRevealCount: () => 0,
    resolveAgentIcon: () => LuBot,
    Tooltip: options.Tooltip,
    MultiSelectMenu: options.MultiSelectMenu,
  };
}
