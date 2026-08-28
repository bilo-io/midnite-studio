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
 * What a live agent session appears to be doing, guessed from its own output.
 *
 * There is no channel that tells the app this directly — an agent CLI is just a
 * process writing bytes to a pty — so it is inferred from the same markers a
 * human reads off the screen. Crosses the wire (`mgit:pty:activity`), which is
 * why it lives here rather than in the renderer's own `terminal-store.ts` —
 * that module re-exports this type so no renderer import has to change.
 */
export const SessionActivitySchema = z.enum(['thinking', 'waiting', 'idle']);
export type SessionActivity = z.infer<typeof SessionActivitySchema>;

/**
 * The classic catastrophic-backtracking shape: a quantified group nested
 * inside another quantifier — `(a+)+`, `(a*)*`, `([a-z]+)+$`. A length cap and
 * a per-call time budget both help *after* a slow match has already started,
 * but main's activity detector runs synchronously on the pty data hot path —
 * one call into a truly exponential pattern can hang the whole process before
 * either defense gets a chance to react. This heuristic cannot catch every
 * ReDoS shape (that is undecidable in general), but it catches the one the
 * detector's own time-budget test is modelled on.
 */
const NESTED_QUANTIFIER = /\([^()]*[+*][^()]*\)[+*]/;

/**
 * A regular expression an agent's roster entry supplies, compiled at load time
 * rather than trusted as a literal.
 *
 * `agents.json` is a file a user hand-edits, and a pattern that reaches
 * `RegExp` unchecked is either a crash (invalid syntax) or a hang (catastrophic
 * backtracking against live pty output). The length cap, the compile check and
 * the nested-quantifier refusal all run at *parse* time, so a malformed or
 * dangerous entry is rejected the same way every other bad field in this file
 * is — before it ever reaches a hot path.
 */
export const RegexSource = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (source) => {
      try {
        new RegExp(source, 'i');
        return true;
      } catch {
        return false;
      }
    },
    { message: 'not a valid regular expression' },
  )
  .refine((source) => !NESTED_QUANTIFIER.test(source), {
    message: 'looks like a catastrophic-backtracking pattern (a quantifier nested inside another)',
  });

/**
 * A coding agent the `+` menu can start.
 *
 * `accent` is the agent's brand colour and `icon` is the key to its mark. Both
 * live in the descriptor rather than in the component because the roster is
 * user-extensible — a hard-coded switch in the renderer would mean a new agent
 * needs a rebuild, which is exactly the bargain `BUILTIN_AGENTS` promises and
 * the renderer spent a phase not keeping.
 *
 * Note what is *absent*: whether the command is actually on this machine. That
 * is a runtime fact about the host, not a property of the roster, and it
 * travels beside these objects as {@link AgentStatusSchema} — so this schema
 * stays exactly the shape `agents.json` is validated against.
 */
export const AgentDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Typed into a login shell, not passed to `pty.spawn`. */
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  /**
   * CLI arguments passed to resume a previous conversation on revive.
   *
   * Roster data beside `args`; absent means no Resume button is offered.
   * Merging via `agents.json` replaces a builtin whole, so an override
   * that wants `resume` must restate `id`, `label`, `command`, `accent`, etc.
   */
  resume: z.array(z.string()).optional(),
  /** CSS colour for the agent's icon. */
  accent: z.string().min(1),
  /**
   * Key into the renderer's `AGENT_ICONS` registry. Absent means the agent's
   * own `id`, which keeps the builtins from repeating themselves; an
   * unrecognised key costs the user their glyph, not their row.
   */
  icon: z.string().min(1).optional(),
  /**
   * One-line hint shown as the `+` menu's `disabledReason` when the install
   * probe cannot find `command` — e.g. `npm i -g @gitlawb/openclaude`. A
   * session that would open and immediately print `command not found` becomes
   * an explanation instead.
   */
  install: z.string().min(1).optional(),
  /**
   * Two markers this agent's own TUI prints, used to guess whether it is
   * thinking or waiting on you — see main's `activity-detect.ts`. Roster data
   * beside `resume` and `install`, for the same reason: a second agent CLI
   * needs an `agents.json` entry, not a release.
   *
   * Absent means no detector. A missing marker set is never guessed at — an
   * agent with no `activity` draws the honest "unknown" mark rather than a
   * borrowed pattern that would silently misreport.
   */
  activity: z
    .object({
      /** Matches while the agent is generating — a spinner glyph, a token counter. */
      thinking: RegexSource,
      /** Matches the agent's frame-ending footer — the mode line, a shortcut hint. */
      frameEnd: RegexSource,
    })
    .optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

/**
 * Whether an agent's command exists on *this* machine, resolved by main.
 *
 * Kept apart from {@link AgentDefinitionSchema} on purpose: the definition is
 * config a user hand-edits, this is a probe result with a lifetime measured in
 * seconds. Folding them into one object would mean `mergeAgents` validating a
 * runtime fact, and `agents.json` gaining two fields nobody should write.
 *
 * `installed: false` is only ever asserted by a probe that *ran and answered*.
 * A probe that could not answer at all omits the agent entirely, and the
 * renderer treats an absent status as "assume it works" — a probe that failed
 * must not disable an agent that is sitting right there on the PATH.
 */
export const AgentStatusSchema = z.object({
  id: z.string().min(1),
  installed: z.boolean(),
  /** Absolute path the command resolved to, when it resolved at all. */
  resolvedPath: z.string().min(1).nullable(),
});
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/**
 * The agents that ship with the app.
 *
 * Overridable per-user by `agents.json` in the Electron userData directory,
 * merged by `id` — so adding one is an edit, not a release.
 */
export const BUILTIN_AGENTS: readonly AgentDefinition[] = [
  {
    id: 'claude',
    label: 'Claude',
    command: 'claude',
    args: [],
    resume: ['--continue'],
    accent: '#D97757',
    install: 'npm i -g @anthropic-ai/claude-code',
    /*
      Two independent tells, because Claude Code's spinner row grows and
      shrinks with the width it is given and with how long the turn has run:
      the spinner glyph (`✢✳✶✻✽`) followed by a verb ending in an ellipsis, the
      `↓ 4.5k tokens` counter, or "esc to interrupt" — any one is enough. The
      frame-end marker is the mode footer printed on EVERY repaint, generating
      or not, so it is read as a boundary first and "waiting" only when no
      spinner tell appears before it in the same frame — see
      `activity-detect.ts` for why keying on "esc to interrupt" alone left
      thinking undetected from Claude Code 2.1.x onward.
    */
    activity: {
      thinking:
        '[\\u2722\\u2733\\u2736\\u273B\\u273D][^\\n]{0,200}\\u2026|\\u2193[^\\n]{0,40}tokens|esc to interrupt',
      frameEnd: 'shift\\+tab to cycle|auto mode on|\\? for shortcuts',
    },
  },
  {
    /*
      `agy`, not `antigravity-ide`: the latter is a shim that opens the IDE,
      which is not a thing a terminal session can host. The id follows the
      command so a user reading `terminals.json` can tell what ran; the mark is
      named separately because "agy" is not what the brand is called.
    */
    id: 'agy',
    label: 'Antigravity',
    command: 'agy',
    args: [],
    accent: '#4285F4',
    icon: 'antigravity',
    install: 'See antigravity.google/docs/cli for the Antigravity CLI',
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    args: [],
    resume: ['resume', '--last'],
    accent: '#10A37F',
    install: 'npm i -g @openai/codex',
  },
  {
    id: 'openclaude',
    label: 'OpenClaude',
    command: 'openclaude',
    args: [],
    accent: '#8B5CF6',
    install: 'npm i -g @gitlawb/openclaude',
  },
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
    /**
     * The session's own name, shown after the repo name in the terminal list.
     *
     * User-set only — an auto-detected title (from the shell's OSC title, or a
     * shell session's last command) lives in the renderer's runtime state, not
     * here, so a live guess is never written to disk as if the user had chosen
     * it themselves.
     */
    name: z.string().min(1).optional(),
    cwd: z.string().min(1),
    /** The repo this session was opened against, for grouping and labelling. */
    repoId: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    /**
     * Whether this session was deliberately put to sleep (process killed,
     * transcript kept). Persisted in `terminals.json` so a slept row survives
     * a reload or relaunch as asleep, not ended.
     */
    asleep: z.boolean().optional(),
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
 * Sized to hold 1 MB — enough that a restored agent session still shows the
 * conversation that produced the state you left it in, and the buffer now lives
 * in the detached broker process.
 */
export const SCROLLBACK_BYTES = 1024 * 1024;
