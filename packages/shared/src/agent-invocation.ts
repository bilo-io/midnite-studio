/**
 * Turning a roster agent's `command` and a free-text prompt into a one-shot
 * shell invocation.
 *
 * Framework-agnostic on purpose: originally lived in
 * `packages/app/src/features/terminal/start-agent.ts` (renderer-only), and
 * moved here once Phase 34's `council-runner.ts` (main-process, no renderer
 * access) needed the exact same per-agent invocation-args table — a second
 * copy would drift the moment one of the three CLIs' non-interactive flag
 * changed. `start-agent.ts` re-exports these rather than redefining them.
 */

/**
 * Translate the prompt's Claude/Antigravity `/name` skill prefix into
 * whatever the target agent actually expects.
 *
 * Claude and Antigravity's `agy` both auto-import a project skill as a `/name`
 * slash command, so a stored prompt like `/midnite-exec` or `/loop /midnite-exec`
 * needs no change for either. Codex is the odd one out — it doesn't recognise
 * `/name` for a custom skill at all, only `$name` — so this rewrites every
 * leading `/token` to `$token` before it reaches a Codex session. Anything that
 * doesn't start with `/` (a plain sentence) passes through untouched either way.
 */
export function toAgentPrompt(prompt: string, agentId: string): string {
  if (agentId !== 'codex') return prompt;
  return prompt.replace(/(^|\s)\/(\S+)/g, (_match, boundary: string, name: string) =>
    `${boundary}$${name}`,
  );
}

/**
 * The flags a roster agent needs, beyond its command and the prompt, to treat
 * that prompt as a one-shot instruction rather than free text at its own
 * native REPL.
 *
 * Claude and OpenClaude take the prompt as a bare positional and start their
 * usual interactive session with it queued as the first message, so neither
 * needs anything here — which is also why neither is eligible as a council
 * member (see `COUNCIL_MEMBER_PROVIDERS` in `council.ts`): a council spawns
 * unattended and needs a CLI that actually exits once it has answered.
 * Antigravity's `agy` only runs a prompt non-interactively behind `-p`;
 * Codex only does it behind its `exec` subcommand; OpenCode behind
 * `--prompt`.
 */
export function agentInvocationArgs(agentId: string): string[] {
  switch (agentId) {
    case 'agy':
      return ['-p'];
    case 'codex':
      return ['exec'];
    case 'opencode':
      return ['--prompt'];
    default:
      return [];
  }
}

/**
 * One shell word, whatever is in it.
 *
 * Single quotes rather than double: these prompts quote git commands in
 * backticks, and inside double quotes a backtick is command substitution — the
 * one form of quoting that would let a branch name run something. The only
 * character single quotes cannot carry is a single quote, hence the dance.
 */
export function shellQuote(text: string): string {
  return `'${text.replace(/\s+/g, ' ').trim().replace(/'/g, String.raw`'\''`)}'`;
}

/**
 * The flags that make an agent CLI answer once and **exit** — print mode.
 *
 * Distinct from {@link agentInvocationArgs}, and the distinction is the whole
 * reason this exists. That function answers "how do I hand this CLI a prompt
 * to start an interactive session with", which is what a pty wants: Claude and
 * OpenClaude take the prompt as a bare positional and then sit at their own
 * REPL, so they need no flags at all and get `[]`. A *headless* caller needs
 * the opposite — a process that writes an answer to stdout and closes — and
 * for Claude that is `-p`. `council-runner.ts` works around the gap by typing
 * the command into a login shell with `; exit $?` appended, which it has to do
 * because it uses a pty; Phase 79's companion uses `runProcess` and can simply
 * ask for print mode.
 *
 * `null` rather than `[]` for an agent with no known print mode, because the
 * two answers are different facts and only one of them may be spawned: `[]`
 * would mean "run it with no flags", which for an unknown interactive CLI is a
 * process that waits for stdin it will never get (`runProcess` gives it
 * `'ignore'`, so it gets EOF and, if it is well-behaved, exits — and if it is
 * not, sits there until the deadline). A caller that gets `null` skips that
 * agent and looks for another, or tells the user there is nothing installed.
 */
export function agentHeadlessArgs(agentId: string): string[] | null {
  switch (agentId) {
    // Claude Code's print mode. OpenClaude is a fork of its CLI surface and
    // takes the same flag.
    case 'claude':
    case 'openclaude':
      return ['-p'];
    // Antigravity and OpenCode's non-interactive flags happen to be the same
    // ones that make them one-shot, so these agree with `agentInvocationArgs`.
    case 'agy':
      return ['-p'];
    case 'opencode':
      return ['--prompt'];
    case 'codex':
      return ['exec'];
    default:
      // `cursor`, `copilot` and anything a user added through `agents.json`.
      // Guessing `-p` at an unknown CLI is how you get a process holding a
      // slot until the timeout fires.
      return null;
  }
}
