/**
 * Live agent sessions bound to roadmap nodes (surface 'kanban' + taskRef) — the
 * shape a relaunch restores, so `useGraphAgentStates` lights those nodes with
 * the running `agent-run-glow` ring and an identity badge.
 */
import { BOARD, itemId, MAIN } from './roadmap';

export type AgentRun = { n: number; agentId: string; slug: string; title: string; pty: string };

export const RUNS: AgentRun[] = [
  { n: 950, agentId: 'claude', slug: 'phase-116-test-suite-diet', title: 'Phase 116 · Test suite diet', pty: 'pty-116' },
  { n: 925, agentId: 'codex', slug: 'phase-111-voice-agent', title: 'Phase 111 · Voice agent', pty: 'pty-111' },
  { n: 910, agentId: 'claude', slug: 'phase-106-2d-assets', title: 'Phase 106 · 2D Assets', pty: 'pty-106' },
  { n: 860, agentId: 'agy', slug: 'phase-89-knowledge-variants', title: 'Phase 89 · Knowledge variants', pty: 'pty-89' },
];

export function terminalSessions(runs: AgentRun[] = RUNS, scrollback: Record<string, string> = {}) {
  return runs.map((r, i) => ({
    session: {
      id: `sess-${r.n}`,
      kind: 'agent',
      agentId: r.agentId,
      title: r.title,
      cwd: `${MAIN}/.worktrees/${r.slug}`,
      repoId: 'repo-1',
      createdAt: Date.now() - (i + 1) * 7 * 60_000,
      surface: 'kanban',
      taskRef: { projectId: BOARD.id, itemId: itemId(r.n) },
    },
    scrollback: scrollback[r.pty] ?? '',
    live: { ptyId: r.pty, pid: 4100 + i, cols: 120, rows: 32 },
  }));
}
