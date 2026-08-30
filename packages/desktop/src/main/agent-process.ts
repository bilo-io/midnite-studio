import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { AgentDefinition } from '@midnite/studio-shared';

import { probeTarget } from './agent-probe';

/**
 * What is running inside a terminal, read off the machine's own process table.
 *
 * `agent-probe.ts` next door answers a different question — whether an agent is
 * *installed* — and answers it through a login shell. This one answers whether
 * an agent is *running right now*, and needs no shell at all: `ps` is on the
 * bare PATH and its answer is a snapshot, not a resolution.
 *
 * ## Why the app needs to ask at all
 *
 * A session's `kind` and `agentId` are decided by which `+` menu item opened it
 * and then frozen. Type `codex` into a plain shell and the sidebar row goes on
 * claiming to be a bare terminal; quit Claude Code inside an agent session and
 * the row goes on wearing Claude's mark over a shell prompt. Both facts are
 * knowable from the pty's own descendants, and until this file existed nobody
 * asked.
 *
 * ## Reads, and acts on nothing
 *
 * There is no kill, no restart and no auto-spawn here, deliberately: the probe
 * exists so the UI can stop lying about what is running. A button that stops an
 * agent is a write path and wants its own confirm story.
 *
 * ## The shape of the answer
 *
 * `null` is a real answer — "looked, recognised nothing" — and is what lets a
 * quit agent hand its row's glyph back. Where a process form cannot be matched
 * *confidently* the answer is also `null`, and that is the whole posture of the
 * matcher below: a wrong mark is worse than no mark. `activity-detect.ts`
 * arrived at the same conclusion the expensive way.
 *
 * Everything except {@link readProcessRows} is pure, so the interesting cases
 * are tested against captured `ps` output in `__fixtures__/` rather than
 * against whatever happens to be running on the machine at test time.
 */

const exec = promisify(execFile);

/** One row of the process table, as much of it as this file cares about. */
export type ProcessRow = {
  pid: number;
  ppid: number;
  /**
   * `ps`'s STAT column, e.g. `S+`, `Ss`, `R+`. The `+` flag marks a process
   * in its terminal's foreground process group — what {@link foregroundOf}
   * reads to say what the user is actually running, as opposed to scanning
   * argv for a name.
   */
  stat: string;
  /** The full command line, space-joined, exactly as `ps` printed it. */
  args: string;
};

/**
 * `ps` output is bounded by the machine's process count, not by anything we
 * control — but a laptop with 2000 processes averaging 200 characters is still
 * under half a megabyte, and truncating the table would silently drop the row
 * the walk is looking for. The cap exists so a pathological argv (a command
 * line with a megabyte of arguments in it) cannot grow the buffer without
 * limit; it is far above any real listing.
 */
const PS_MAX_BUFFER = 8 * 1024 * 1024;

/** A probe that cannot answer in this long is not worth waiting for. */
export const PS_TIMEOUT_MS = 3_000;

/**
 * The whole process table, or `null` if it could not be read.
 *
 * The `=` suffix on each `-o` field suppresses that column's header, which is
 * what keeps the parser from needing to recognise and skip a header line — and
 * more importantly what stops a localised header ("PID PPID COMANDO") from
 * being parsed as data. `args` is last on purpose: it is the only field that
 * can contain spaces, so everything before it splits unambiguously.
 *
 * The one impure function here. It fails soft to `null`: a machine where `ps`
 * is missing, restricted or slow gets no live agent detection, which costs the
 * user an icon that follows their shell and nothing else.
 */
export async function readProcessRows(): Promise<ProcessRow[] | null> {
  try {
    const { stdout } = await exec('ps', ['-axo', 'pid=,ppid=,stat=,args='], {
      timeout: PS_TIMEOUT_MS,
      maxBuffer: PS_MAX_BUFFER,
    });
    return parsePsOutput(stdout);
  } catch {
    return null;
  }
}

/**
 * `  1234  1200 S+   /bin/zsh -l` → `{ pid: 1234, ppid: 1200, stat: 'S+', args: '/bin/zsh -l' }`.
 *
 * Header-suppressed `ps` pads its numeric columns with leading spaces, so the
 * leading `\s*` is load-bearing rather than defensive. A line that does not
 * start with two integers and a STAT token is skipped rather than guessed
 * at — a wrapped argv or a stray banner has no pid, and inventing one would
 * attach a real command line to the wrong parent. Four columns, always: a
 * parser that tolerated three (pre-Theme-E output with no STAT) would be a
 * trap the next column change springs the same way.
 */
export function parsePsOutput(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const args = match[4]?.trim() ?? '';
    if (args === '') continue;
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      stat: match[3] ?? '',
      args,
    });
  }
  return rows;
}

/** A descendant, and how many generations below the root it sits. */
export type Descendant = { row: ProcessRow; depth: number };

/**
 * Every process below `rootPid`, breadth-first, each carrying its depth.
 *
 * Depth is what {@link matchRunningAgent} breaks ties on, so it is collected
 * here rather than recomputed: an agent launched from *inside* another agent is
 * deeper, and depth is the only thing that says so.
 *
 * The `seen` set is not paranoia about a cyclic process tree — that cannot
 * happen — but about `ps` reporting a process whose parent has already exited
 * and been reaped, which on macOS is reparented to pid 1. Two roots claiming
 * the same child would otherwise walk it twice.
 */
export function descendantsOf(rows: readonly ProcessRow[], rootPid: number): Descendant[] {
  const children = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    // A process that is its own parent would loop the walk forever. pid 0 on
    // darwin reports `ppid: 0`, and it is in every listing.
    if (row.pid === row.ppid) continue;
    const bucket = children.get(row.ppid);
    if (bucket) bucket.push(row);
    else children.set(row.ppid, [row]);
  }

  const found: Descendant[] = [];
  const seen = new Set<number>([rootPid]);
  let frontier = children.get(rootPid) ?? [];
  let depth = 1;

  while (frontier.length > 0) {
    const next: ProcessRow[] = [];
    for (const row of frontier) {
      if (seen.has(row.pid)) continue;
      seen.add(row.pid);
      found.push({ row, depth });
      next.push(...(children.get(row.pid) ?? []));
    }
    frontier = next;
    depth += 1;
  }

  return found;
}

/**
 * Interpreters whose argv[0] names the *runtime*, not the program.
 *
 * A `#!/usr/bin/env node` script — which is what `codex` actually is on this
 * machine — appears in the process table as `node /opt/homebrew/bin/codex`, so
 * matching argv[0] alone would report nothing for an agent sitting right there.
 * Version-suffixed forms (`node22`, `python3.12`) are covered by stripping
 * trailing digits and dots below.
 */
const RUNTIMES = new Set(['node', 'bun', 'deno', 'python', 'ruby', 'perl', 'php', 'tsx', 'ts-node']);

/** Extensions a script argument wears; stripped before matching a command name. */
const SCRIPT_EXTENSIONS = /\.(?:js|mjs|cjs|ts|mts|cts|py|rb|sh)$/;

/**
 * Runtime flags whose value is a *separate* token, and a path.
 *
 * Without this, "the first token that is not a flag" finds the flag's argument
 * rather than the script: `node --require /opt/codex/preload.js /opt/run.js`
 * would report Codex for a program that merely preloads something living under
 * a directory of that name. That is the same false positive the never-scan-
 * arguments rule exists to prevent, sneaking back in through script detection —
 * so the flags that can carry a path are skipped along with their value.
 *
 * `--flag=value` needs no entry: it is one token, and it starts with `-`.
 */
const VALUE_FLAGS = new Set([
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader',
  '--env-file',
  '--inspect-brk',
  '--conditions',
  '-C',
]);

/** The last path segment, for a POSIX path. Deliberately not `node:path`. */
function basename(value: string): string {
  const segments = value.split('/');
  return segments[segments.length - 1] ?? value;
}

/** `cli.mjs` → `cli`; `codex` → `codex`. */
const stripExtension = (value: string): string => value.replace(SCRIPT_EXTENSIONS, '');

/** `node22` → `node`, `python3.12` → `python`; anything else unchanged. */
const stripVersion = (value: string): string => value.replace(/[\d.]+$/, '');

/**
 * Command names to agent ids, keyed by basename.
 *
 * `probeTarget` is reused rather than `agent.command` split again: a roster
 * `command` is a command *line* (`agents-store`'s tests document
 * `claude --dangerously-skip-permissions` as a supported override), and the
 * install probe already owns the rule for reducing one to a program name. Two
 * copies of that rule would let the install probe and this one disagree about
 * the very same roster entry.
 *
 * Later entries do not overwrite earlier ones: two agents whose commands share
 * a basename are ambiguous by construction, and the first one in the roster
 * winning at least makes the outcome stable rather than dependent on
 * `agents.json`'s ordering.
 */
function commandIndex(agents: readonly AgentDefinition[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const agent of agents) {
    const name = stripExtension(basename(probeTarget(agent.command)));
    if (name !== '' && !index.has(name)) index.set(name, agent.id);
  }
  return index;
}

/**
 * Which agent, if any, this one command line is.
 *
 * Three rules, in order, and nothing beyond them:
 *
 * 1. **argv[0]'s basename.** Covers a bare `claude` (a compiled binary, which
 *    is what Claude Code and `agy` both are here) and an absolute
 *    `/opt/homebrew/bin/codex`.
 * 2. **A runtime's script argument.** `node /opt/homebrew/bin/codex` — the
 *    shebang form — matches on the script's basename.
 * 3. **A path segment of that script argument, deepest first.** Catches a
 *    package layout like `node …/node_modules/codex/bin/index.js`, where the
 *    basename names the entry file rather than the tool. Deepest first because
 *    the segments nearest the entry file say what is running and the outer ones
 *    say where it lives. The segment must match a command name *exactly*:
 *    `…/@anthropic-ai/claude-code/cli.js` does **not** match `claude`, and that
 *    is the intended outcome rather than an oversight — a substring rule there
 *    would be a guess, and the phase's posture is that an unmatched form returns
 *    `null`. `agent-watcher.ts` is built around that answer: a `null` may only
 *    take away a mark some probe has actually *seen*, so an agent installed in
 *    that shape simply keeps the mark its session was opened with.
 *
 * Arguments are never scanned for command names, which is the false positive
 * this function exists to *not* produce: `git commit -m 'try codex'` and
 * `vim codex.md` are a plain shell doing plain things, and either would have
 * worn Codex's mark under a scan-everything rule.
 */
export function matchAgentInArgv(
  args: string,
  agents: readonly AgentDefinition[],
): string | null {
  const index = commandIndex(agents);
  const tokens = args.trim().split(/\s+/).filter((token) => token !== '');
  const argv0 = tokens[0];
  if (argv0 === undefined) return null;

  // Rule 1.
  const direct = index.get(stripExtension(basename(argv0)));
  if (direct !== undefined) return direct;

  // Rules 2 and 3 apply only under a runtime.
  const runtime = stripVersion(stripExtension(basename(argv0)));
  if (!RUNTIMES.has(runtime)) return null;

  const script = findScript(tokens.slice(1));
  if (script === undefined) return null;

  // Rule 2.
  const byBasename = index.get(stripExtension(basename(script)));
  if (byBasename !== undefined) return byBasename;

  /*
    Rule 3 — whole segments only, never the file itself (rule 2 had that), and
    walked from the DEEPEST segment outwards.

    Direction matters: the segments nearest the entry file describe what is
    running, and the ones further out describe where it happens to live. Walking
    left to right made `node ~/codex/node_modules/claude/bin/cli.js` report Codex
    — a checkout named after one agent, holding another agent's script.
  */
  const segments = script.split('/').slice(0, -1);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (segment === undefined) continue;
    const bySegment = index.get(segment);
    if (bySegment !== undefined) return bySegment;
  }

  return null;
}

/**
 * The script a runtime was handed, skipping its own flags and their values.
 *
 * "The first token that is not a flag" is nearly right and wrong in one specific
 * way — see {@link VALUE_FLAGS}.
 */
function findScript(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === undefined) continue;
    if (VALUE_FLAGS.has(token)) {
      i += 1; // Its value is a path, and it is not the script.
      continue;
    }
    if (!token.startsWith('-')) return token;
  }
  return undefined;
}

/**
 * The agent running under `rootPid`, or `null` for none and for ambiguity.
 *
 * **Deepest wins.** A `claude` that shelled out and had `codex` run inside it
 * should read as Codex: the innermost recognised process is the one the user is
 * actually talking to, and the outer one is a launcher at that point.
 *
 * **A tie is `null`.** Two *different* agents at the same depth is genuinely
 * ambiguous — nothing in the process table says which of them owns the screen —
 * and the same agent twice at the same depth is not a tie at all, it is one
 * answer arrived at twice (an agent that forked a worker of its own).
 */
export function matchRunningAgent(
  rows: readonly ProcessRow[],
  rootPid: number,
  agents: readonly AgentDefinition[],
): string | null {
  let best: { depth: number; ids: Set<string> } | null = null;

  for (const { row, depth } of descendantsOf(rows, rootPid)) {
    const agentId = matchAgentInArgv(row.args, agents);
    if (agentId === null) continue;
    if (best === null || depth > best.depth) best = { depth, ids: new Set([agentId]) };
    else if (depth === best.depth) best.ids.add(agentId);
  }

  if (best === null) return null;
  // More than one distinct agent at the winning depth: no confident answer.
  return best.ids.size === 1 ? ([...best.ids][0] ?? null) : null;
}

/**
 * The process actually holding the terminal's foreground right now, for
 * naming — as opposed to {@link matchRunningAgent}'s "which roster entry is
 * this", which the shell auto-namer has no use for.
 *
 * Every descendant carrying the `+` flag is a candidate: a shell at its own
 * prompt carries it too (excluded automatically, since `descendantsOf` never
 * includes the root itself), and a pipeline's every member does (`git log |
 * less` marks both). **Resolved — the last one by pid wins**: a shell forks a
 * pipeline's members left to right, so the highest pid is the rightmost
 * command — `less` in that example, which is what the user is actually
 * looking at. `null` when nothing in the tree is in the foreground, which
 * reads as "back at a bare prompt".
 */
export function foregroundOf(rows: readonly ProcessRow[], rootPid: number): ProcessRow | null {
  let best: ProcessRow | null = null;
  for (const { row } of descendantsOf(rows, rootPid)) {
    if (!row.stat.includes('+')) continue;
    if (best === null || row.pid > best.pid) best = row;
  }
  return best;
}

/** How long a shell's auto-name can run before it is truncated. */
const COMMAND_LABEL_MAX = 40;

/**
 * `/usr/local/bin/pnpm dev` → `'pnpm dev'`.
 *
 * `argv[0]` is reduced to its basename — the label is for a session-list row,
 * not a shell prompt — and the rest of the line rides along unchanged. A line
 * past {@link COMMAND_LABEL_MAX} is cut short with a trailing `…` rather than
 * wrapping or reflowing the row.
 */
export function commandLabel(args: string): string {
  const tokens = args.trim().split(/\s+/).filter((token) => token !== '');
  const argv0 = tokens[0];
  const full = [argv0 === undefined ? '' : basename(argv0), ...tokens.slice(1)].join(' ');
  return full.length <= COMMAND_LABEL_MAX
    ? full
    : `${full.slice(0, COMMAND_LABEL_MAX - 1)}…`;
}
