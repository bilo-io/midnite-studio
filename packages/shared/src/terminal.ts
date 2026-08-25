/**
 * Terminal sessions and the coding agents that can run inside them.
 *
 * A *session* is the durable half of a terminal: an id, where it runs, and what
 * it is. The pty is the disposable half — it dies with the app, and a restored
 * session comes back with no process at all until the user asks for one. The two
 * are kept apart deliberately: `pty:*` owns the process, `terminal:*` owns the
 * record.
 */
import { z } from 'zod';

/**
 * What a session is.
 *
 * `agent` differs from `shell` only in that something was typed into it on
 * startup — the pty is a login shell either way (see `initialInput` on
 * `PtyCreateRequest` for why).
 */
export const TerminalSessionKindSchema = z.enum(['shell', 'agent']);
export type TerminalSessionKind = z.infer<typeof TerminalSessionKindSchema>;

/**
 * A coding agent the `+` menu can start.
 *
 * `accent` is the agent's brand colour, applied to its icon in the session list
 * so a row is identifiable before you read it. It lives in the descriptor rather
 * than in the component because the roster is user-extensible — a hard-coded
 * switch in the renderer would mean a new agent needs a rebuild.
 */
export const AgentDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Typed into a login shell, not passed to `pty.spawn`. */
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  /** CSS colour for the agent's icon. */
  accent: z.string().min(1),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

/**
 * The agents that ship with the app.
 *
 * Overridable per-user by `agents.json` in the Electron userData directory,
 * merged by `id` — so adding one is an edit, not a release.
 */
export const BUILTIN_AGENTS: readonly AgentDefinition[] = [
  { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#D97757' },
] as const;

/**
 * The persisted half of a terminal, as written to `terminals.json`.
 *
 * Note what is *absent*: no `ptyId`, and no liveness flag. Both belong to a
 * running app, and persisting either would let a stale file claim a process that
 * died with the last quit.
 */
export const TerminalSessionSchema = z
  .object({
    id: z.string().min(1),
    kind: TerminalSessionKindSchema,
    /** Set when `kind === 'agent'`; the roster entry that started it. */
    agentId: z.string().min(1).optional(),
    /** Display label — the repo name, by default. */
    title: z.string(),
    cwd: z.string().min(1),
    /** The repo this session was opened against, for grouping and labelling. */
    repoId: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
  })
  .superRefine(agentIdMatchesKind);
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;

/**
 * `kind` and `agentId` are one fact, so neither half may travel alone.
 *
 * `agentId` was declared optional with a comment saying it is set when the kind
 * is `agent` — a rule the schema did not actually hold anyone to. Both halves
 * degrade silently rather than loudly, which is why this is worth a refinement
 * rather than a convention:
 *
 * - An **agent without an id** restores as a row the roster cannot resolve, so
 *   it loses its accent and its Claude mark and reads as a plain shell — and
 *   `agentInput` returns `undefined`, so reviving it starts a bare login shell
 *   instead of the agent. It is still labelled an agent throughout.
 * - A **shell carrying an id** is the inverse: the session list looks the id up
 *   and paints the mark on a terminal that is not running an agent.
 *
 * Both are reachable from `terminals.json`, which is a file on disk that
 * outlives any one build.
 */
export function agentIdMatchesKind(
  session: { kind: TerminalSessionKind; agentId?: string },
  ctx: z.RefinementCtx,
): void {
  if (session.kind === 'agent' && session.agentId === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agentId'],
      message: 'an agent session must name the agent that started it',
    });
  }
  if (session.kind === 'shell' && session.agentId !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agentId'],
      message: 'a shell session has no agent to name',
    });
  }
}

/**
 * How much output is kept per session, in bytes.
 *
 * Sized to hold a few thousand lines — enough that a restored agent session
 * still shows the conversation that produced the state you left it in, and small
 * enough that a dozen of them cost a few megabytes on disk rather than hundreds.
 */
export const SCROLLBACK_BYTES = 256 * 1024;
