import { homedir } from 'node:os';

import {
  COMPANION_ASK_FALLBACK,
  COMPANION_COMMAND_IDS,
  agentHeadlessArgs,
  failure,
  ok,
  parseAskReply,
  toAgentPrompt,
  type AgentDefinition,
  type CompanionAskReply,
  type CompanionSnapshot,
  type GitOpResult,
} from '@midnite/studio-shared';

import { OUTPUT_TAIL_CAP, runProcess, type ProcessSink, type SpawnFn } from '../process-runner';
import { listAgents } from '../terminal-service';

/**
 * The companion's one headless question — Phase 79 Theme E, Decision 9.
 *
 * **`runProcess` directly, not the council runner.** Both spawn an agent CLI
 * unattended, but a council run carries a per-run lock, member/synthesiser
 * roles, a persisted `CouncilRun` record and a settle barrier — none of which a
 * single question has any use for. What it *does* need is the three properties
 * `process-runner.ts` already guarantees: an argument vector with no shell in
 * it, a deadline enforced by our own timer and `SIGKILL`, and an output tail
 * cap. So this is thirty lines over that engine rather than a second
 * orchestrator.
 *
 * **Print mode rather than a pty.** `council-runner.ts` spawns its members
 * *through* a login shell with `; exit $?` appended, because a pty's exit is
 * its only completion signal and a CLI finishing does not end a shell. There
 * is no pty here, so `agentHeadlessArgs` asks the CLI to answer once and exit
 * — which is what `-p` means to Claude — and `runProcess` reports the close
 * directly.
 *
 * **Nothing here is a new inference path.** The model is whatever the user
 * already installed and already runs in the terminal panel; there is no SDK, no
 * API key, and no second provider. If nothing on the roster has a known print
 * mode, this answers `{ok:false}` and the companion's script has a line for it.
 */

/**
 * Thirty seconds, from the phase doc.
 *
 * Well under `process-runner.ts`'s own two-minute default, and deliberately:
 * this runs between a person finishing a sentence and hearing an answer. Past
 * about ten seconds the companion is already filling the silence (Theme G);
 * past thirty it should stop pretending and say so.
 */
export const COMPANION_ASK_TIMEOUT_MS = 30_000;

/**
 * How much of the text being summarised is actually sent.
 *
 * An agent scrollback runs to hundreds of kilobytes and a print-mode CLI is
 * billed by the token. The read-back has already been cut to one turn by
 * `extractLastAgentTurn` before it reaches here; this is the belt to that
 * braces, and it cuts the *head* rather than the tail because the end of an
 * agent's answer is its conclusion.
 */
export const COMPANION_ASK_INPUT_CAP = 8000;

/** How much unparseable output reaches the thread. A debug tail, not a transcript. */
export const COMPANION_ASK_RAW_CAP = 2000;

export type CompanionAskInput = {
  kind: 'route' | 'summarise';
  text: string;
  repoPath: string | null;
  agentId?: string | undefined;
  snapshot?: CompanionSnapshot | null | undefined;
  /**
   * Settings ▸ Companion ▸ Personality's two free-text fields (Ad Hoc),
   * layered onto {@link buildAskPrompt}'s system prompt as optional sections.
   * Both undefined/empty by default — see that function's own doc for why
   * an unset value must not leave a dangling header behind.
   */
  personality?: string | undefined;
  aboutUser?: string | undefined;
};

export type CompanionAskDeps = {
  /** Injected so a test can hand in a roster without a userData directory. */
  agents: () => Promise<AgentDefinition[]>;
  /** Injected so a test can answer with fixed stdout, garbage, or ENOENT. */
  spawn?: SpawnFn | undefined;
  timeoutMs?: number | undefined;
  /** Where an agent runs when no repo is open. Injected only so a test need not touch `$HOME`. */
  home?: (() => string) | undefined;
};

export const defaultAskDeps: CompanionAskDeps = { agents: listAgents };

/**
 * The system prompt, per job.
 *
 * Two properties are load-bearing and both are about what the CLI must *not*
 * do. It is told to answer with **one JSON object and nothing else** — the
 * reply is machine-read, and `parseAskReply` recovers an object from prose but
 * should not have to. And for `'route'` it is given the closed list of command
 * ids and told to omit `intent` rather than invent one, because an invented id
 * is the one failure mode that would start the wrong agent: `CompanionIntent`'s
 * zod enum rejects it, so the worst case is a spoken sentence with no action,
 * which is the outcome we want.
 */
export function buildAskPrompt(input: CompanionAskInput): string {
  const grounding =
    input.snapshot == null
      ? 'No repository is open.'
      : `Repository state as JSON:\n${JSON.stringify(input.snapshot)}`;

  // `personaBlock`: `[]` when neither field is set, so both prompts below
  // read EXACTLY as they did before this pair of fields existed — the
  // default state, and the one most likely to regress into a dangling
  // "About the user:" header with nothing under it. Non-empty, it slots in
  // as its own blank-line-delimited paragraph, same shape `grounding` already
  // gets.
  const personaBlock = personaLines(input);

  if (input.kind === 'summarise') {
    return [
      'You are summarising a coding agent\'s last answer so it can be read aloud.',
      'Reply with ONE JSON object and nothing else, in the form {"say": string}.',
      '`say` must be 2 to 4 plain sentences, no markdown, no code, no lists, no file paths —',
      'it is going through a speech synthesiser. Say what the agent did and whether it worked.',
      '',
      grounding,
      ...(personaBlock.length > 0 ? ['', ...personaBlock] : []),
      '',
      "The agent's answer follows.",
      '---',
      capHead(input.text, COMPANION_ASK_INPUT_CAP),
    ].join('\n');
  }

  return [
    "You are routing one sentence a user said to a desktop git client's companion.",
    'Reply with ONE JSON object and nothing else, in the form',
    '{"say": string, "intent": object | omitted}.',
    '`say` is one short sentence, spoken aloud, confirming what you are about to do.',
    '',
    '`intent` is optional. Include it ONLY if the sentence clearly asks to start one of',
    'these workflows, and only with an `id` from this exact list:',
    COMPANION_COMMAND_IDS.join(', '),
    'as {"kind":"command","id":"<one of the above>","body":"<the rest of the request>"}.',
    'If it asks to change repository, use {"kind":"switchRepo","name":"<name>"}.',
    'If none of that fits, OMIT `intent` entirely — never guess an id that is not listed.',
    '',
    grounding,
    ...(personaBlock.length > 0 ? ['', ...personaBlock] : []),
    '',
    'The sentence follows.',
    '---',
    capHead(input.text, COMPANION_ASK_INPUT_CAP),
  ].join('\n');
}

/**
 * `input.personality`/`input.aboutUser` → the lines to splice into the
 * prompt, or `[]` when both are unset. Trimmed again here rather than
 * trusted pre-trimmed: `CompanionAskInput` is also built directly in tests
 * and by any future caller that skips the IPC boundary where
 * `CompanionPersonalitySchema`/`CompanionAboutUserSchema` already trim.
 */
function personaLines(input: CompanionAskInput): string[] {
  const lines: string[] = [];
  const personality = input.personality?.trim();
  if (personality) lines.push(`The companion's personality: ${personality}`);
  const aboutUser = input.aboutUser?.trim();
  if (aboutUser) lines.push(`About the user: ${aboutUser}`);
  return lines;
}

/** Keep the tail — an agent's conclusion is at the end of its answer, not the start. */
function capHead(text: string, cap: number): string {
  return text.length <= cap ? text : `…${text.slice(-cap)}`;
}

/**
 * Which roster entry to actually run.
 *
 * The renderer's `primaryAgent` first, because that is the user's stated
 * choice; then anything on the roster with a known print mode, because a
 * companion that refuses to think because the *primary* agent happens to be
 * Cursor is worse than one that quietly uses the Claude CLI sitting right
 * there. `null` when nothing qualifies, which is the "no CLI installed" arm.
 */
export function resolveHeadlessAgent(
  agents: readonly AgentDefinition[],
  preferredId?: string,
): { agent: AgentDefinition; args: string[] } | null {
  const preferred = agents.find((agent) => agent.id === preferredId);
  const preferredArgs = preferred ? agentHeadlessArgs(preferred.id) : null;
  if (preferred && preferredArgs) return { agent: preferred, args: preferredArgs };

  for (const agent of agents) {
    const args = agentHeadlessArgs(agent.id);
    if (args) return { agent, args };
  }
  return null;
}

/**
 * Collect stdout, capped, and let the caller parse it.
 *
 * A `ProcessSink` that parses nothing: `parseAskReply` is pure and lives in
 * `shared`, and running it inside `finish()` would fold "the CLI printed
 * something unexpected" into `runProcess`'s `parse-failed` reason — which is
 * the wrong shape, because unparseable output still has a spoken answer
 * ({@link COMPANION_ASK_FALLBACK}) and a raw string worth putting in the
 * thread.
 */
function textSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer = (buffer + chunk).slice(-OUTPUT_TAIL_CAP);
    },
    finish: () => ({ ok: true, data: buffer }),
  };
}

/**
 * Ask, once.
 *
 * Never throws and never rejects — every outcome is the `GitOpResult`
 * envelope, because "no CLI", "it timed out" and "it printed nonsense" are all
 * things the script says out loud rather than things the renderer catches.
 *
 * The unparseable case is deliberately a **success**: the reply carries
 * {@link COMPANION_ASK_FALLBACK} as `say` and no `intent`, so the companion
 * admits it did not follow and posts the raw text in the thread. Returning a
 * failure there would lose the raw output, which is the only thing that makes
 * the miss debuggable.
 */
export async function askCompanion(
  input: CompanionAskInput,
  deps: CompanionAskDeps = defaultAskDeps,
): Promise<GitOpResult<CompanionAskReply>> {
  const roster = await deps.agents();
  const resolved = resolveHeadlessAgent(roster, input.agentId);
  if (!resolved) {
    return failure(
      'No agent CLI with a headless mode is installed, so I cannot think about that one.',
    );
  }

  const prompt = toAgentPrompt(buildAskPrompt(input), resolved.agent.id);
  const cwd = input.repoPath ?? (deps.home ?? homedir)();

  const outcome = await runProcess<string>(
    resolved.agent.command,
    [...resolved.args, prompt],
    cwd,
    {
      sink: textSink(),
      timeoutMs: deps.timeoutMs ?? COMPANION_ASK_TIMEOUT_MS,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
    },
  );

  if (!outcome.ok) {
    return failure(
      outcome.reason === 'timed-out'
        ? 'That took too long, so I stopped waiting.'
        : `I could not run ${resolved.agent.label}: ${outcome.hint}`,
    );
  }

  const reply = parseAskReply(outcome.data);
  if (reply) return ok(reply);

  // Not a failure: the raw text is the only evidence of what went wrong, and
  // the companion has a sentence for exactly this. `raw` is capped again on the
  // way out — `OUTPUT_TAIL_CAP` is 200 KB, which is a reasonable ceiling for a
  // debug tail and an unreasonable one for a chat bubble.
  return ok<CompanionAskReply>({
    say: COMPANION_ASK_FALLBACK,
    raw: outcome.data.trim().slice(-COMPANION_ASK_RAW_CAP),
  });
}
