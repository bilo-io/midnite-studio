import { randomUUID } from 'node:crypto';

import type { StartNodeSessionParams, StartNodeSessionResult } from '@midnite/studio-feature-workflows/main';
import { WORKFLOW_SESSION_REPO_ID, type TerminalSession } from '@midnite/studio-shared';

import type { ShellRunner } from './shell-runner';

/**
 * How a workflow node runs in Midnite Agents (Phase 113 Theme N) — without a terminal.
 *
 * Studio starts an `agent` or `script` node as a pty in its broker and lists the session in its
 * Terminal view. Agents has neither, so a **script** node runs as the user's login shell with piped
 * stdio — the same {@link ShellRunner} a council member uses, killed as a process group on cancel and
 * on quit — and the session it returns is a record the engine stores on the run, never a row anywhere.
 *
 * An **agent** node drives an interactive agent CLI and waits for it to go idle, which needs a real
 * terminal (a CLI started with no tty behaves differently). Until Agents ships the pty broker, that
 * node fails with a plain message rather than hanging; an `ai-prompt` node runs the same CLI
 * headlessly and works here.
 */
export const AGENT_NODE_NEEDS_TERMINAL =
  'Agent steps need a terminal session, which Midnite Agents does not have yet. Run this graph in Midnite Studio, or use an AI prompt step.';

export function createNodeSessionStarter(
  runner: Pick<ShellRunner, 'createPty'>,
): (params: StartNodeSessionParams) => Promise<StartNodeSessionResult> {
  return async (params) => {
    if (params.kind !== 'shell') return { ok: false, message: AGENT_NODE_NEEDS_TERMINAL };
    const id = randomUUID();
    const created = await runner.createPty({
      sessionId: id,
      cwd: params.cwd,
      cols: 100,
      rows: 30,
      initialInput: params.initialInput,
      ...(params.env === undefined ? {} : { env: params.env }),
    });
    if (!created.ok) return { ok: false, message: created.message };
    const session: TerminalSession = {
      id,
      kind: params.kind,
      title: 'Workflow',
      name: params.nodeLabel,
      cwd: params.cwd,
      repoId: WORKFLOW_SESSION_REPO_ID,
      createdAt: Date.now(),
      workflowRunRef: { workflowId: params.workflowId, runId: params.runId, nodeId: params.nodeId },
    };
    return { ok: true, session, ptyId: created.ptyId };
  };
}
