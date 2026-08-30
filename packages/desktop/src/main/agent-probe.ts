import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';

import { parseWhichOutput, runInShell } from './login-shell';

/**
 * Whether each agent in the roster is actually installed on this machine.
 *
 * The `+` menu is the only consumer, and it uses the answer for one thing:
 * greying out an item and saying how to install it, instead of opening a
 * session that immediately prints `command not found`.
 *
 * ## The trap
 *
 * Resolving against **Electron's** PATH would be wrong on the machine this was
 * written on. `claude` and `agy` both live in `~/.local/bin`, which reaches the
 * environment only through an interactive rc file — so a `Midnite Git.app`
 * opened from Finder inherits launchd's bare PATH and a naive probe would
 * disable two agents that are sitting right there. Everything goes through
 * `login-shell.ts`'s `-lic` shell instead, which is also the shell the pty will
 * use when the command is finally typed: the probe and the launch agree by
 * construction.
 *
 * ## Failing soft
 *
 * A probe that cannot answer omits the agent from its result rather than
 * reporting `installed: false`. The renderer reads an absent status as "assume
 * it works", so a slow rc file or a broken profile costs the user an
 * explanation, never a working agent.
 */

/**
 * Bounds one batched probe. Generous, because it is one `-lic` shell for the
 * whole roster and an rc file that sources nvm can genuinely take a second —
 * but finite, because the `+` menu awaits it.
 */
export const PROBE_TIMEOUT_MS = 8_000;

/**
 * How long a probe result is trusted.
 *
 * Long enough that opening the menu repeatedly costs one shell rather than one
 * per open; short enough that `npm i -g @gitlawb/openclaude` in the terminal
 * next door un-greys its menu item without quitting the app. That second half
 * is the reason this is a TTL and not a permanent memo: installing an agent
 * *from inside Midnite Git* is the likeliest way this fact ever changes.
 */
export const PROBE_TTL_MS = 30_000;

/**
 * Wrapped around each answer so profile noise cannot be mistaken for a path.
 *
 * The batch runs every `command -v` in ONE shell, so the outputs arrive
 * interleaved with whatever the rc files printed; without a per-agent frame
 * there is no way to tell which path belongs to which command — and
 * `parseWhichOutput`'s "last path line wins" rule would hand every agent the
 * same answer.
 */
const frameStart = (id: string): string => `__MGIT_AGENT_${id}_START__`;
const frameEnd = (id: string): string => `__MGIT_AGENT_${id}_END__`;

/**
 * The id is embedded in a shell string, so it has to be a shell-safe token.
 * A user's `agents.json` can name an agent anything at all; one with a quote or
 * a `$` in it is skipped rather than allowed to compose a command line.
 */
const FRAMEABLE = /^[A-Za-z0-9_-]+$/;

/**
 * One command line resolving the whole roster, framed per agent.
 *
 * `|| true` after each `command -v` so a missing binary's non-zero status
 * cannot end the script under a shell with `set -e` in its profile — a missing
 * agent has to produce an empty frame, not a truncated batch.
 */
export function buildProbeScript(agents: readonly AgentDefinition[]): string {
  return agents
    .filter((agent) => FRAMEABLE.test(agent.id))
    .map(
      (agent) =>
        `printf '\\n%s\\n' ${shellQuote(frameStart(agent.id))}; ` +
        `command -v ${shellQuote(probeTarget(agent.command))} 2>/dev/null || true; ` +
        `printf '\\n%s\\n' ${shellQuote(frameEnd(agent.id))}`,
    )
    .join('; ');
}

/**
 * What to actually look up for an agent whose `command` carries its own flags.
 *
 * A roster `command` is typed into a shell as a whole line — `agents-store`'s
 * own tests document `claude --dangerously-skip-permissions` as a supported
 * override — so it is a command LINE, not a program name. `command -v` takes a
 * name: handed the whole line it finds nothing and reports a working agent as
 * missing, which is the probe disagreeing with the launch about the very thing
 * it exists to predict.
 */
export function probeTarget(command: string): string {
  return command.trim().split(/\s+/)[0] ?? command;
}

/** Single-quote for `sh`, escaping any embedded single quote the POSIX way. */
function shellQuote(value: string): string {
  const escaped = value.split("'").join(`'\\''`);
  return `'${escaped}'`;
}

/**
 * Pull each agent's answer out of the framed batch output.
 *
 * An agent whose frame never appeared is **omitted**, not reported missing:
 * the shell died, or was killed on the timeout partway through, and the agents
 * it never reached are unknown rather than absent. An agent whose frame is
 * present but empty genuinely has no such command.
 *
 * Pure and exported so the whole matcher is reviewable against captured shell
 * output rather than against this machine's PATH.
 */
export function parseProbeOutput(
  output: string,
  agents: readonly AgentDefinition[],
): AgentStatus[] {
  const statuses: AgentStatus[] = [];

  for (const agent of agents) {
    const start = output.indexOf(frameStart(agent.id));
    if (start === -1) continue;
    const end = output.indexOf(frameEnd(agent.id), start);
    if (end === -1) continue;

    const body = output.slice(start + frameStart(agent.id).length, end);
    /*
      `installed` is "the shell found SOMETHING", not "it found a file".
      `command -v` answers with a bare name for a shell function, and with
      `alias foo='…'` for an alias — neither starts with `/`, and both are
      things the pty will happily run when the command is typed. Resolving
      through a login shell to catch exactly those and then discarding them
      would make the extra subprocess pointless. `resolvedPath` stays null for
      them: the schema already allows a path-less install, and a path we did
      not get is not a path to invent.
    */
    const answer = body.trim();
    const resolvedPath = parseWhichOutput(body);
    statuses.push({ id: agent.id, installed: answer.length > 0, resolvedPath });
  }

  return statuses;
}

type Cached = { at: number; statuses: AgentStatus[]; key: string };
let cache: Cached | null = null;
/**
 * Concurrent callers share one shell — but only for the SAME roster. The `+`
 * menu and a react-query refetch on window focus land together often enough
 * that sharing is the common case, not a defensive flourish; an `agents.json`
 * edited while a probe is in flight is rarer, and the caller that triggers on
 * the edit is exactly the one that must not be handed the previous roster's
 * answer.
 */
let inFlight: { key: string; promise: Promise<AgentStatus[]> } | null = null;

/**
 * The roster this cache is about — an edited `agents.json` must not read stale.
 *
 * `JSON.stringify` rather than a joined string with a separator character in
 * it: an id or a command can contain anything a user typed, and a separator
 * that appears in the data makes two different rosters produce one key.
 */
const rosterKey = (agents: readonly AgentDefinition[]): string =>
  JSON.stringify(agents.map((a) => [a.id, a.command]));

/** Injectable seams. Production passes neither; only the tests do. */
export type ProbeDeps = {
  now: () => number;
  run: (command: string, timeoutMs: number) => Promise<{ output: string }>;
};

const REAL: ProbeDeps = { now: () => Date.now(), run: runInShell };

/**
 * Probe the roster, reusing a recent answer.
 *
 * The TTL is stamped when the shell ANSWERS, not when the caller asked. A probe
 * that burns the full timeout would otherwise land already-expired-by-8s, so a
 * machine with a slow rc file — the one machine this cache exists for — would
 * get the shortest cache lifetime rather than the longest.
 */
export async function probeAgents(
  agents: readonly AgentDefinition[],
  deps: Partial<ProbeDeps> = {},
): Promise<AgentStatus[]> {
  const { now, run } = { ...REAL, ...deps };
  const key = rosterKey(agents);

  if (cache && cache.key === key && now() - cache.at < PROBE_TTL_MS) return cache.statuses;
  if (inFlight && inFlight.key === key) return inFlight.promise;

  const script = buildProbeScript(agents);
  if (script.length === 0) return [];

  const promise = (async () => {
    // The exit code is deliberately ignored: whatever reached us is still
    // per-agent framed, so a shell killed on the timeout yields usable partial
    // output and the frames that never arrived stay unknown.
    const { output } = await run(script, PROBE_TIMEOUT_MS);
    const statuses = parseProbeOutput(output, agents);
    cache = { at: now(), statuses, key };
    return statuses;
  })().finally(() => {
    if (inFlight?.key === key) inFlight = null;
  });

  inFlight = { key, promise };
  return promise;
}

/**
 * How long `agent.list()` will wait for a first answer before shipping without
 * one.
 *
 * The roster itself is a file read that never needed a shell. Making the whole
 * response wait on a login shell means the session list's marks and the
 * Settings roster both stall behind an rc file that sources nvm — for a fact
 * whose only job is grey-out styling. Absent status already means "assume
 * installed", so shipping early is correct by design rather than a compromise:
 * the probe keeps running, fills the cache, and the next refetch has it.
 */
export const FIRST_ANSWER_MS = 1_200;

/**
 * The roster's status if the probe can produce one quickly, `[]` otherwise.
 *
 * Never rejects, and never leaves the probe dangling — the losing side of the
 * race still completes into the cache.
 */
export async function agentStatusWithin(
  agents: readonly AgentDefinition[],
  waitMs: number = FIRST_ANSWER_MS,
  deps: Partial<ProbeDeps> = {},
): Promise<AgentStatus[]> {
  const probe = probeAgents(agents, deps).catch((): AgentStatus[] => []);
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<AgentStatus[]>((resolvePromise) => {
    timer = setTimeout(() => resolvePromise([]), waitMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([probe, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Drop the memo. Tests only — the TTL is the production story. */
export function resetAgentProbeCache(): void {
  cache = null;
  inFlight = null;
}
