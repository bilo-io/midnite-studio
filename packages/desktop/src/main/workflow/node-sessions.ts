import { randomUUID } from 'node:crypto';

import {
  EVENT_CHANNELS,
  WORKFLOW_SESSION_REPO_ID,
  type TerminalSession,
  type TerminalSessionKind,
} from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { createPty, livePtyFor, type CreateResult } from '../pty-service';
import { saveTerminal } from '../terminal-service';

/**
 * Starting a real terminal session for an `agent`/`script` workflow node
 * (Phase 95 Theme J) — the one place the workflow engine (main) creates a
 * `TerminalSession` directly, without a renderer round trip.
 *
 * Every OTHER session in this app is opened by the renderer's own
 * `openSession`/`startAgent` (`terminal-store.ts`), which mints the id,
 * calls `pty.create` over IPC, then `terminal.save` — because the renderer
 * is what knows a session exists. A workflow run has no renderer in that
 * loop: `workflow-engine.ts` already runs entirely in main, so this module
 * does the renderer's three steps itself (mint the id, `createPty`,
 * `saveTerminal`) and PUSHES the result to whichever window is open
 * (`EVENT_CHANNELS.workflowNodeSessionStarted`) rather than waiting to be
 * asked for it. `use-workflow-node-sessions.ts` is the renderer's other
 * half — it adopts the pushed session into `useTerminalStore` exactly as
 * `hydrate()` adopts a restored one.
 *
 * Still the SAME broker path as every other session
 * (`createPty` → `pty-service.ts` → `broker-client.ts`) — never a second
 * spawn route.
 */

let getWindowThunk: () => BrowserWindow | null = () => null;

export function configureWorkflowNodeSessions(getWindow: () => BrowserWindow | null): void {
  getWindowThunk = getWindow;
}

/** A roomy default — the same rationale `council-runner.ts`'s one-shot ptys use, just larger: this pty is meant to be genuinely watched, not only captured. */
const NODE_SESSION_COLS = 100;
const NODE_SESSION_ROWS = 30;

export type StartNodeSessionParams = {
  workflowId: string;
  runId: string;
  nodeId: string;
  kind: TerminalSessionKind;
  /** Required when `kind === 'agent'`. */
  agentId?: string;
  /**
   * The node's own label — the session's `name` (`managedSessionLabel`'s
   * primary read, `sessions-view.tsx`). `title` is not the workflow's name:
   * these sessions are pulled OUT of the ordinary by-repo grouping entirely
   * (`WORKFLOW_SESSION_REPO_ID`) and shown under their own workflow-run
   * accordion header instead, which already names the workflow — a `title`
   * repeating it on every row would be redundant, so this stays a fixed,
   * generic value.
   */
  nodeLabel: string;
  cwd: string;
  /** Typed into the shell once it is up, WITH the trailing `\r` — a workflow run is unattended by definition, the same auto-send exception `council-runner.ts` takes. */
  initialInput: string;
  /** Per-session env overrides (Phase 96 Theme H) — an Ollama-bound agent node's recipe env. */
  env?: Record<string, string>;
  /** Session identity for an Ollama-backed node (Phase 96 Theme H) — see `TerminalSessionSchema`'s own doc. */
  backend?: 'native' | 'ollama';
  ollamaModel?: string;
};

export type StartNodeSessionResult =
  | { ok: true; session: TerminalSession; ptyId: string }
  | { ok: false; message: string };

/**
 * Create the session row, spawn its pty, persist and announce it — in that
 * order, so a renderer that reacts to the push event can already find the
 * row via `terminal:list` if it asks (persisted first) and already has a
 * live ptyId to bind to (announced last).
 */
export async function startNodeSession(params: StartNodeSessionParams): Promise<StartNodeSessionResult> {
  const id = randomUUID();
  const createResult: CreateResult = await createPty({
    sessionId: id,
    kind: params.kind,
    cwd: params.cwd,
    cols: NODE_SESSION_COLS,
    rows: NODE_SESSION_ROWS,
    ...(params.agentId === undefined ? {} : { agentId: params.agentId }),
    initialInput: params.initialInput,
    ...(params.env === undefined ? {} : { env: params.env }),
  });
  if (!createResult.ok) return { ok: false, message: createResult.message };

  const session: TerminalSession = {
    id,
    kind: params.kind,
    ...(params.agentId === undefined ? {} : { agentId: params.agentId }),
    title: 'Workflow',
    name: params.nodeLabel,
    cwd: params.cwd,
    repoId: WORKFLOW_SESSION_REPO_ID,
    createdAt: Date.now(),
    workflowRunRef: { workflowId: params.workflowId, runId: params.runId, nodeId: params.nodeId },
    ...(params.backend === undefined ? {} : { backend: params.backend }),
    ...(params.ollamaModel === undefined ? {} : { ollamaModel: params.ollamaModel }),
  };
  saveTerminal(session);

  // `createPty` itself answers only `{ptyId}` — `livePtyFor` is the same
  // lookup `terminal-service.ts`'s own `listTerminals()` uses to find a
  // session's live pid, right after the pty this call just made is
  // guaranteed to be registered in `pty-service.ts`'s own session map.
  const live = livePtyFor(id);
  const win = getWindowThunk();
  if (win && !win.isDestroyed() && live) {
    win.webContents.send(EVENT_CHANNELS.workflowNodeSessionStarted, {
      session,
      live: { ptyId: createResult.ptyId, pid: live.pid, cols: NODE_SESSION_COLS, rows: NODE_SESSION_ROWS },
    });
  }

  return { ok: true, session, ptyId: createResult.ptyId };
}
