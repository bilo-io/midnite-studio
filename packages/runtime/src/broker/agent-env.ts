/**
 * Strip a *host* agent's session markers out of an environment before it reaches a terminal.
 *
 * Why this exists: Studio can be (re)started from inside a coding-agent session (e.g. Claude Code's Bash tool).
 * Studio main and its detached pty broker then inherit that tool's environment, and every pty they spawn
 * inherits it in turn. Two things go wrong:
 *   - `NO_COLOR=1` makes every CLI in every terminal render monochrome.
 *   - `CLAUDECODE` / `CLAUDE_CODE_*` make an agent started in Studio believe it is a child of the host session
 *     (Claude Code prints "Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker") and hand it the
 *     host's messaging socket and token, so it can talk to that session.
 *
 * Pure: returns a new object, never touches `process.env`. Apply it right before a pty's own overrides
 * (`TERM`, `COLORTERM`, `TERM_PROGRAM`, ...), so those still win.
 *
 * Removed (each observed in a real leaked environment, `ps eww` of the broker, 2026-11-14):
 *   - `NO_COLOR` (any value: the spec says presence alone disables colour)
 *   - `FORCE_COLOR` only when `0`, the "force colour off" value; `FORCE_COLOR=1..3` is a user choice and stays
 *   - `CLAUDECODE`
 *   - every `CLAUDE_CODE_*` (CHILD_SESSION, SESSION_ID, SESSION_ATTENDED, MESSAGING_SOCKET, MESSAGING_TOKEN,
 *     ENTRYPOINT, EXECPATH, ...)
 *   - `CLAUDE_PID`, `CLAUDE_EFFORT`: set alongside them by the same host session (seen in the same environment)
 *
 * Kept on purpose:
 *   - `CLAUDE_CONFIG_DIR`: it is the user's own choice of where Claude Code keeps its config and credentials, not a
 *     session marker. Dropping it would silently log an agent out of the account the user configured.
 *     (A host session that *sets* it for its own sandboxing is indistinguishable from a user who exports it in
 *     their shell profile, so the safe side is to leave it.)
 *   - `ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*`: credentials and endpoints the user configured.
 *
 * Other agent CLIs (Codex, Gemini, Antigravity) are deliberately not listed: no marker for them could be verified
 * against a real environment or in this repo, and guessing names would strip variables a user may rely on.
 * Add one here once it has been observed.
 */
const EXACT_KEYS: ReadonlySet<string> = new Set(['NO_COLOR', 'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT']);

const PREFIXES: readonly string[] = ['CLAUDE_CODE_'];

export function scrubHostAgentEnv<T extends Record<string, string | undefined>>(env: T): T {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (EXACT_KEYS.has(key)) continue;
    if (PREFIXES.some((p) => key.startsWith(p))) continue;
    if (key === 'FORCE_COLOR' && value === '0') continue;
    out[key] = value;
  }
  return out as T;
}

/** Delete the same keys from `process.env` itself, once, at boot — before anything is spawned from it. */
export function scrubHostAgentProcessEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const kept = scrubHostAgentEnv(env);
  const removed = Object.keys(env).filter((k) => !(k in kept));
  for (const k of removed) delete env[k];
  return removed;
}
