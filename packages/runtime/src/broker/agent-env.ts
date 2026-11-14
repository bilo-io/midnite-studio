/**
 * Strip a *host* agent's session markers out of an environment before it reaches a terminal.
 *
 * Why this exists: Studio can be (re)started from inside a coding-agent session (e.g. Claude Code's Bash tool).
 * Studio main and its detached pty broker then inherit that tool's environment, and every pty they spawn
 * inherits it in turn. Two things go wrong:
 *   - `NO_COLOR=1` makes every CLI in every terminal render monochrome.
 *   - `CLAUDECODE` / `CLAUDE_CODE_SESSION_ID` / ... make an agent started in Studio believe it is a child of the host session
 *     (Claude Code prints "Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker") and hand it the
 *     host's messaging socket and token, so it can talk to that session.
 *
 * Pure: returns a new object, never touches `process.env`. Apply it right before a pty's own overrides
 * (`TERM`, `COLORTERM`, `TERM_PROGRAM`, ...), so those still win.
 *
 * Always removed (exact names, never a prefix). Evidence: the leaked env (`ps eww` of the broker, 2026-11-14), the
 * review's read of Claude Code 2.1.325's own list of vars it sets on a child, and its host env:
 *   - `CLAUDECODE`, `CLAUDE_PID`, `CLAUDE_EFFORT`
 *   - `CLAUDE_CODE_SESSION_ID`, `_CHILD_SESSION`, `_SESSION_ATTENDED`, `_ENTRYPOINT`, `_EXECPATH`,
 *     `_MESSAGING_SOCKET`, `_MESSAGING_TOKEN`, `_INVOKED_SKILLS`
 *   - `AI_AGENT`, only when it matches the CLI's own marker regex `^claude-code[_/].+[_/]agent$`
 *
 * Why not every `CLAUDE_CODE_*`: that binary references ~921 such names and many are user configuration
 * (`CLAUDE_CODE_USE_BEDROCK`, `_USE_VERTEX`, `_USE_FOUNDRY`, `_OAUTH_TOKEN`, `_MAX_OUTPUT_TOKENS`, ...). Stripping them
 * would reroute or log out the user's agents.
 *
 * Removed only when a host marker is present (`CLAUDECODE=1`, `CLAUDE_CODE_SESSION_ID`, or a matching `AI_AGENT`),
 * because a user may set them on purpose:
 *   - `NO_COLOR` (an accessibility preference) and `FORCE_COLOR=0`; `FORCE_COLOR=1..3` always stays
 *     (`FORCE_COLOR=0` is defensive: it was not in the observed env)
 *   - `GIT_EDITOR=true`: the host sets it so git never blocks on an editor, which breaks `git commit` and
 *     `git rebase -i` in a human's terminal
 *
 * Kept on purpose:
 *   - `CLAUDE_CONFIG_DIR`: it is the user's own choice of where Claude Code keeps its config and credentials, not a
 *     session marker. Dropping it would silently log an agent out of the account the user configured.
 *   - `ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*`: credentials and endpoints the user configured.
 *
 * Other agent CLIs (Codex, Gemini, Antigravity) are deliberately not listed: no marker for them could be verified
 * against a real environment or in this repo, and guessing names would strip variables a user may rely on.
 * Add one here once it has been observed.
 */
const SESSION_KEYS: ReadonlySet<string> = new Set([
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_INVOKED_SKILLS',
]);

const AI_AGENT_RE = /^claude-code[_/].+[_/]agent$/;

export function scrubHostAgentEnv<T extends Record<string, string | undefined>>(env: T): T {
  const aiAgentMarked = AI_AGENT_RE.test(env.AI_AGENT ?? '');
  const hostAgent = env.CLAUDECODE === '1' || 'CLAUDE_CODE_SESSION_ID' in env || aiAgentMarked;
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (SESSION_KEYS.has(key)) continue;
    if (key === 'AI_AGENT' && aiAgentMarked) continue;
    if (hostAgent) {
      if (key === 'NO_COLOR') continue;
      if (key === 'FORCE_COLOR' && value === '0') continue;
      if (key === 'GIT_EDITOR' && value === 'true') continue;
    }
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
