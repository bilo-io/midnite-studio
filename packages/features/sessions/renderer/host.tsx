import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type {
  GitCascadeReveal,
  GitMultiSelectProps,
  GitTooltipProps,
  IconComponent,
} from '@midnite/studio-frame';
import type { AgentDefinition, ClosedSession, Commit, SessionActivity, TerminalSession } from '@midnite/studio-shared';

import type { ManagedLiveSession, ManagedSession } from './session-order';

/**
 * The sessions feature's host port — what the Sessions view needs from the app that composes it, beyond
 * the frame (Phase 113 Theme O slice 4).
 *
 * The view is the list, its filters and the routing of a selection to a detail pane; what a session *is*
 * belongs to the app. **Studio** owns its terminals: the terminal store (live rows, their connection and
 * activity), the session history (closed rows, their transcripts, purge), the panel a live xterm already
 * sits in (the detail pane hands it off rather than racing it), the graph's commits, Loops and the kill
 * switch. **Coder** owns none of that: it lists the runtime host's sessions as a broker guest and attaches
 * a terminal to one — it starts nothing, resumes nothing and kills nothing it did not start.
 *
 * So the members split in two. The required ones every app answers (a plain answer is fine — no agents,
 * no loops). The optional groups are capabilities an app either has or leaves out, and a group left out
 * is a control the view does not draw, never one that does nothing.
 */

/** A live session's pty, as the view draws its dot (Studio's `terminal-store` `ConnectionState`). */
export type SessionConnectionState = 'idle' | 'starting' | 'open' | 'exited' | 'unavailable';

/** What the view reads about one live row. A hook. */
export type SessionLiveStatus = {
  connectionState: SessionConnectionState | undefined;
  activity: SessionActivity | undefined;
  /** The agent running in it now — which can differ from the one it was opened as. */
  agentId: string | undefined;
};

export type SessionsListWidth = { size: number; setSize: (value: number) => void; initial: number; min: number; max: number };

/** Which row the detail pane shows. Studio's lives in `sessions-store` (the closed half is broadcast). */
export type SessionsSelection = {
  closedId: string | null;
  selectClosed: (id: string | null) => void;
  liveId: string | null;
  selectLive: (id: string | null) => void;
};

/** The closed half: the archive, its transcripts and purge. Absent → a live-only list. */
export type SessionsHistoryPort = {
  /** A hook — the slice of a query result the list reads. */
  useHistory: () => { data: ClosedSession[] | undefined; isPending: boolean; isError: boolean; error: unknown };
  /** A hook answering the refetch. */
  useRefresh: () => () => unknown;
  /** Delete one transcript, or every one (`null`). */
  purge: (sessionId: string | null) => Promise<unknown>;
  TranscriptPane: ComponentType<{ sessionId: string }>;
};

/** The graph's commits an agent session made, and the jump to them. Absent → no commit counts. */
export type SessionsGraphPort = {
  useCommits: () => readonly Commit[];
  showCommits: (session: ManagedSession, commits: Commit[]) => void;
};

/** A workflow run's group header controls. */
export type SessionsWorkflowPort = {
  /** Workflow names by id, for a run group's header. A hook; `undefined` while loading. */
  useWorkflowNames: () => ReadonlyMap<string, string> | undefined;
  Icon: IconComponent;
  revealRun: (ref: { workflowId: string; runId: string }) => void;
  /** The kill switch pre-scoped to this run. Absent → no kill control on the group. */
  openKillSwitch?: (ref: { workflowId: string; runId: string }) => void;
};

/** Loops — which session a loop launched, and the loop's glyph. Absent → no loop marks. */
export type SessionsLoopsPort = {
  useLoopIdBySession: () => ReadonlyMap<string, string>;
  loopIcon: (icon: string) => IconComponent;
};

export type SessionsHost = {
  /** Every live (running or asleep) session the app knows. A hook; it may hydrate on first mount. */
  useLiveSessions: () => readonly TerminalSession[];
  useLiveStatus: (session: ManagedSession) => SessionLiveStatus;
  /** The roster, for labels, icons, accents and the provider filter. A hook. */
  useAgents: () => readonly AgentDefinition[];
  useSelection: () => SessionsSelection;
  useListWidth: () => SessionsListWidth;
  /** The detail pane for a live row — the app's terminal, or its hand-off to the panel already showing it. */
  LivePane: ComponentType<{ session: ManagedLiveSession; rawSession: TerminalSession | null }>;
  useCascadeReveal: (options: { revealKey: string | number }) => GitCascadeReveal;
  useRevealCount: (open: boolean) => number;
  resolveAgentIcon: (agent: { id: string; icon?: string | undefined }) => IconComponent;
  Tooltip: ComponentType<GitTooltipProps>;
  MultiSelectMenu: ComponentType<GitMultiSelectProps>;

  /**
   * The agent audit trail (Phase 121 Theme G), as a second tab beside the list. The pane is the mcp-tools
   * feature's `AgentAuditView`, which a feature may not import, so the composing app hands it over. Absent → no tab.
   */
  AuditPane?: ComponentType;
  history?: SessionsHistoryPort;
  graph?: SessionsGraphPort;
  workflows?: SessionsWorkflowPort;
  loops?: SessionsLoopsPort;
  /** A hook answering how to end a live session (with the app's own confirm), or null when this app may not. */
  useKill?: () => ((session: TerminalSession) => void) | null;
  /** Start an agent again on a conversation. Absent → no resume control. */
  resume?: (request: { repoId: string; cwd: string; title: string; agent: AgentDefinition; args: string[] }) => void;
};

const SessionsHostContext = createContext<SessionsHost | null>(null);

export function SessionsHostProvider({ host, children }: { host: SessionsHost; children: ReactNode }) {
  return <SessionsHostContext.Provider value={host}>{children}</SessionsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the Sessions view would not render. */
export function useSessionsHost(): SessionsHost {
  const host = useContext(SessionsHostContext);
  if (!host) throw new Error('The sessions feature must be rendered inside <SessionsHostProvider>');
  return host;
}
