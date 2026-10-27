import { useCallback, useEffect, useMemo } from 'react';

import { AgentAuditView } from '@midnite/studio-feature-mcp-tools/renderer';
import { useWorkflowRevealStore, useWorkflows } from '@midnite/studio-feature-workflows/renderer';
import type { ManagedSession, SessionsHost } from '@midnite/studio-feature-sessions/renderer';
import { useGraphStore } from '@midnite/studio-frame';
import type { Commit, TerminalSession } from '@midnite/studio-shared';

import { useDialogs } from '../components/dialog-host';
import { resolveAgentIcon } from '../components/icons';
import { MultiSelectMenu } from '../components/multi-select-menu';
import { VIEW_ICON } from '../components/nav-icons';
import { Tooltip } from '../components/tooltip';
import { loopIcon } from '../features/loops/loop-icons';
import { useLoopRuns } from '../features/loops/use-loop-runs';
import { LiveSessionDetail } from '../features/sessions/live-session-pane';
import { TranscriptView } from '../features/sessions/transcript-view';
import { closeSessionWithConfirm } from '../features/terminal/close-session';
import { startAgent } from '../features/terminal/start-agent';
import { resolveSessionAgentId, useTerminalStore } from '../features/terminal/terminal-store';
import { useAgents } from '../features/terminal/use-agents';
import { useCascadeReveal, useRevealCount } from '../lib/use-cascade-reveal';
import { bridge } from '../services/bridge';
import { requestHandoff } from '../services/handoff';
import { useRefreshSessionHistory, useSessionHistory } from '../services/queries';
import { useSessionsStore } from '../store/sessions-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's side of the sessions feature's host port (Phase 113 Theme O slice 4).
 *
 * Every member is the store, hook or component the Sessions view imported directly before it moved into
 * `packages/features/sessions`, so the view looks and behaves exactly as it did, and nothing it stores
 * moved: the list width stays `ui-store`'s `layout.sessionsListWidth`, the selection `sessions-store`
 * (the closed half still broadcast to every window). The live pane and the transcript stay here — they
 * are the terminal's own (`live-session-pane.tsx`, `transcript-view.tsx`).
 */

/**
 * Restore saved sessions once, on first read — `terminal-panel.tsx` and `fab-panel.tsx` each do the
 * identical thing on their own mount, but neither is guaranteed to have mounted: a user who opens
 * Sessions straight from launch would otherwise read the store before anything populated it, and every
 * still-live session would render as if it did not exist. `hydrate()` guards a second call, so racing
 * whichever panel gets there first costs nothing.
 */
function useLiveSessions(): readonly TerminalSession[] {
  useEffect(() => {
    void useTerminalStore.getState().hydrate();
  }, []);
  return useTerminalStore((s) => s.sessions);
}

function useLiveStatus(record: ManagedSession) {
  const connectionState = useTerminalStore((s) => s.states[record.id]);
  const activity = useTerminalStore((s) => s.activity[record.id]);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  return { connectionState, activity, agentId: resolveSessionAgentId(record, liveAgentId) };
}

function useSelection() {
  return {
    closedId: useSessionsStore((s) => s.selectedClosedSessionId),
    selectClosed: useSessionsStore((s) => s.selectClosedSession),
    liveId: useSessionsStore((s) => s.selectedLiveSessionId),
    selectLive: useSessionsStore((s) => s.selectLiveSession),
  };
}

function useListWidth() {
  const size = useUiStore((s) => s.layout.sessionsListWidth);
  const setLayout = useUiStore((s) => s.setLayout);
  const setSize = useCallback((value: number) => setLayout('sessionsListWidth', value), [setLayout]);
  return { size, setSize, initial: DEFAULT_LAYOUT.sessionsListWidth, ...LAYOUT_BOUNDS.sessionsListWidth };
}

/** The graph's commits, re-read when its row count changes (the rows are a large array). */
function useCommits(): readonly Commit[] {
  const rowCount = useGraphStore((s) => s.rows.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => useGraphStore.getState().rows.map((r) => r.commit), [rowCount]);
}

function useLoopIdBySession(): ReadonlyMap<string, string> {
  const runs = useLoopRuns().data;
  return useMemo(() => new Map(runs.map((run) => [run.sessionId, run.loopId])), [runs]);
}

function useWorkflowNames(): ReadonlyMap<string, string> | undefined {
  const data = useWorkflows().data;
  return useMemo(() => (data ? new Map(data.map((w) => [w.id, w.name])) : undefined), [data]);
}

/** Ending a session from the list is the terminal panel's own close — the confirm the user already knows. */
function useKill() {
  const dialogs = useDialogs();
  return useCallback((session: TerminalSession) => closeSessionWithConfirm(dialogs, session), [dialogs]);
}

export const STUDIO_SESSIONS_HOST = {
  useLiveSessions,
  useLiveStatus,
  useAgents: () => useAgents().agents,
  useSelection,
  useListWidth,
  LivePane: LiveSessionDetail,
  useCascadeReveal,
  useRevealCount,
  resolveAgentIcon,
  Tooltip,
  MultiSelectMenu,
  AuditPane: AgentAuditView,
  history: {
    useHistory: useSessionHistory,
    useRefresh: useRefreshSessionHistory,
    purge: (sessionId) => bridge()?.sessions.purge({ sessionId }) ?? Promise.resolve(),
    TranscriptPane: TranscriptView,
  },
  graph: {
    useCommits,
    showCommits: (session, commits) => {
      useUiStore.getState().setGraphSessionFilter(session.id);
      useUiStore.getState().setGraphShaFilter(commits.map((c) => c.sha));
      useUiStore.getState().setActiveView('graph');
    },
  },
  workflows: {
    useWorkflowNames,
    Icon: VIEW_ICON.workflows,
    revealRun: (ref) => {
      useWorkflowRevealStore.getState().reveal(ref);
      // Workflows belong to the Agents app; Studio's hand-off seam navigates in-process.
      void requestHandoff({ app: 'agents', view: 'workflows' });
    },
    openKillSwitch: (ref) => useUiStore.getState().openKillSwitch(ref),
  },
  loops: { useLoopIdBySession, loopIcon },
  useKill,
  // Resume restores a conversation rather than acting on the repository, so it auto-sends — a
  // deliberate exception to `startAgent`'s `autoSend: false` default.
  resume: ({ repoId, cwd, title, agent, args }) =>
    startAgent({ repoId, cwd, title, agentId: agent.id, command: agent.command, extraArgs: args, autoSend: true }),
} satisfies SessionsHost;
