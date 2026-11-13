import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COUNCIL_OUTPUT_CAP_BYTES,
  COUNCIL_RUN_TIMEOUT_MS,
  councilThreadTitle,
  failure,
  isCouncilRunLive,
  isOllamaCloudModelName,
  mergeRedactions,
  redactOutbound,
  redactionTotal,
  ok,
  resolveAgentLaunch,
  toAgentPrompt,
  type CouncilMemberProvider,
  type AgentDefinition,
  type AgentOllamaBinding,
  type CouncilRun,
  type CouncilRunMember,
  type CouncilRunStatus,
  type CouncilTurn,
  type GitOpResult,
  type NewAgentAuditRecord,
  type OutboundSecret,
  type Redaction,
} from '@midnite/studio-shared';

import { appendCapped, cleanCapturedOutput } from '@midnite/studio-runtime';

import { councilCliArgs, councilScript, parseCouncilAnswer, scriptQuote } from './council-cli';
import { buildFollowUpPrompt, buildMemberPrompt, buildSynthesisPrompt, type CouncilSynthesisEntry } from './council-prompts';
import { getCouncil, getRun, saveRun } from './council-service';

/**
 * What the runner needs from the composer. Councils never imports the pty
 * service, the agent roster, the settings mirror or the models feature: the
 * composer hands each over, so the runner runs under bare vitest and Agents can
 * back the same ports with its own broker and vault.
 */
export type CouncilRunnerPorts = {
  /**
   * Spawns a one-shot pty; `initialInput` is typed into the login shell. Phase 121 Theme E: the host's
   * implementation decides whether the member is confined (Studio's `pty-service` follows Settings ▸ Agents ▸
   * "Confine new sessions"; Agents' `shell-runner` takes a `confine` provider), so the runner asks for nothing here.
   */
  createPty(options: {
    sessionId: string;
    cwd: string;
    cols: number;
    rows: number;
    initialInput: string;
    env?: Record<string, string>;
  }): Promise<{ ok: true; ptyId: string } | { ok: false; message: string }>;
  killPty(ptyId: string): void;
  onPty(ptyId: string, onData: (bytes: Uint8Array) => void, onExit: (exitCode: number) => void): void;
  offPty(ptyId: string): void;
  /** The agent roster a member's `provider` resolves against. */
  listAgents(): Promise<AgentDefinition[]>;
  /** The per-agent Ollama binding mirrored from Settings, if any. */
  agentBinding(agentId: string): AgentOllamaBinding | undefined;
  /** The Ollama daemon's base URL (models owns resolving it). */
  ollamaBaseUrl(): string;
  /**
   * The Ollama cloud key, read **in main** for a cloud-bound member and typed
   * into that one pty's environment — it is never an answer to any channel.
   * `null` when unset or when the vault refuses this app.
   */
  ollamaApiKey(): Promise<string | null>;
  /**
   * The one API key this member's engine needs (Phase 121 Theme I), as its environment variable —
   * `{ ANTHROPIC_API_KEY: ... }`, `{}` for none. Read in main at spawn and merged into that member's pty
   * alone, so a council of three engines gets three environments, not one holding three keys. Not asked
   * for an Ollama-bound member. Optional: a composer with no vault access (Agents, for now) supplies none.
   */
  agentKeyEnv?(agentId: string): Promise<Record<string, string>>;
  /**
   * The audit trail's write entry point (Phase 121 Theme G): one `council-run` record when a run finishes.
   * Optional and total — a throw is swallowed.
   */
  audit?(record: NewAgentAuditRecord): void;
  /**
   * The vault's secret values and the canaries (Phase 121 Theme D). Every member and synthesis prompt is scrubbed
   * against them, and against `SECRET_PATTERNS` by shape, before it is typed into a pty. Optional: absent, only the
   * patterns run. A throw is swallowed.
   */
  outboundSecrets?(): Promise<readonly OutboundSecret[]>;
};

/** What outbound redaction scrubbed from a run's prompts so far, for its one audit record. */
const runRedactions = new Map<string, { redactions: Redaction[]; canary: boolean }>();

let ports: CouncilRunnerPorts | null = null;
let timeoutMs = COUNCIL_RUN_TIMEOUT_MS;

/** The composer's one call: hands the runner its ports before any run starts. */
export function configureCouncilRunner(next: CouncilRunnerPorts | null): void {
  ports = next;
}

/** Tests only: a shorter settle timeout. */
export function setCouncilTimeoutForTests(ms: number | null): void {
  timeoutMs = ms ?? COUNCIL_RUN_TIMEOUT_MS;
}

function runnerPorts(): CouncilRunnerPorts {
  if (!ports) throw new Error('The council runner is not configured.');
  return ports;
}

/**
 * Orchestrates a council thread: each turn spawns every member in parallel as
 * a one-shot shell, waits for the settle barrier, then spawns the synthesizer
 * the same way. A follow-up turn (`continueRun`) resumes each member's own CLI
 * session where the CLI has one.
 *
 * **The auto-send exception lives here.** Every other agent launch in this app
 * types a command into a pty and deliberately withholds the trailing Return —
 * see `start-agent.ts`'s own doc comment. A council member never touches a
 * repository, only answers a prompt, which is why this module includes the
 * `\r` in `initialInput` and lets the command run unattended.
 *
 * **The prompt never goes through the shell's line editor (Phase 133 Theme A).**
 * It is written to a `0600` file beside a tiny script that runs the CLI with
 * `"$(cat <file>)"`, and the shell is typed only `/bin/sh '<script>'; exit $?`.
 * Typing the prompt itself, as this module used to, put a single line tens of
 * kilobytes long into zsh's line editor, whose redraw outlasted the timeout —
 * and the captured "answer" was then the shell's echo of the prompt.
 */

const COUNCIL_PTY_COLS = 200;
const COUNCIL_PTY_ROWS = 40;

const INTERRUPTED = 'Interrupted: the app closed while this run was in flight.';
const NO_ANSWERS = 'No member answered, so there was nothing to synthesize.';

type LaunchTarget = {
  memberId: string;
  name: string;
  provider: CouncilMemberProvider;
  role: string;
  model?: string | undefined;
  sessionId?: string | undefined;
};

/** One settled CLI call. */
export type Outcome = {
  status: 'succeeded' | 'failed' | 'timeout';
  text: string;
  truncated: boolean;
  sessionId?: string | undefined;
  error?: string | undefined;
};

/**
 * Runs this process is driving. A run read as live that is not in here was
 * started by a process that has since gone — {@link reconcileRun} settles it.
 */
const liveRuns = new Set<string>();

/** The one way to stop a tracked CLI early: clear its timer, unsubscribe, kill it, remove its files. */
const tracked = new Map<string, () => void>();

/**
 * A run's members are spawned in parallel and settle independently, so more
 * than one read-modify-write of the *same* `CouncilRun` can be in flight at
 * once — `council-service`'s `getRun`/`saveRun` are plain read-then-write with
 * no locking of their own. Every mutation below goes through this per-run
 * queue; two calls for *different* runs never wait on each other.
 */
const runLocks = new Map<string, Promise<unknown>>();

function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const prior = runLocks.get(runId) ?? Promise.resolve();
  const settled = prior.then(fn, fn);
  // A mutation that throws must not wedge every later one for the same run.
  const tail: Promise<void> = settled.then(
    () => undefined,
    () => undefined,
  );
  runLocks.set(runId, tail);
  // `write-queue.ts`'s own `evictIfCurrent` idiom.
  void tail.then(() => evictIfCurrent(runId, tail));
  return settled;
}

function evictIfCurrent(runId: string, tail: Promise<unknown>): void {
  if (runLocks.get(runId) === tail) runLocks.delete(runId);
}

/** Test-only: `runLocks` is otherwise module-private. */
export function runLocksSizeForTests(): number {
  return runLocks.size;
}

/** Test-only: forget which runs this process is driving, as a restart would. */
export function forgetLiveRunsForTests(): void {
  liveRuns.clear();
  tracked.clear();
}

function freshMember(target: LaunchTarget, now: number): CouncilRunMember {
  return {
    memberId: target.memberId,
    name: target.name,
    provider: target.provider,
    role: target.role,
    status: 'running',
    output: '',
    truncated: false,
    startedAt: now,
    ...(target.model === undefined ? {} : { model: target.model }),
    ...(target.sessionId === undefined ? {} : { sessionId: target.sessionId }),
  };
}

function targetOf(member: CouncilRunMember): LaunchTarget {
  return {
    memberId: member.memberId,
    name: member.name,
    provider: member.provider,
    role: member.role,
    model: member.model,
    sessionId: member.sessionId,
  };
}

/** The prompt a member is sent on the run's latest turn. */
function promptFor(run: CouncilRun, target: LaunchTarget): string {
  const previous = run.turns[run.turns.length - 1];
  if (!previous) return buildMemberPrompt(run.prompt, target.role);
  return buildFollowUpPrompt({
    prompt: run.prompt,
    role: target.role,
    previousSynthesis: previous.synthesisOutput,
    firstTopic: councilThreadTitle(run),
    resumed: target.sessionId !== undefined,
  });
}

export async function startRun(councilId: string, prompt: string): Promise<GitOpResult<CouncilRun>> {
  const council = await getCouncil(councilId);
  if (!council) return failure('Council not found.');
  if (council.members.length === 0) return failure('This council has no members yet.');

  const now = Date.now();
  const run: CouncilRun = {
    id: crypto.randomUUID(),
    councilId,
    prompt,
    format: 'brainstorm',
    status: 'running',
    synthProvider: council.synthProvider,
    ...(council.synthModel === undefined ? {} : { synthModel: council.synthModel }),
    members: council.members.map((member) =>
      freshMember({ memberId: member.id, name: member.name, provider: member.provider, role: member.role, model: member.model }, now),
    ),
    turns: [],
    turnStartedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  liveRuns.add(run.id);
  await saveRun(run);

  for (const member of run.members) void launchMember(run.id, targetOf(member), promptFor(run, targetOf(member)));
  return ok(run);
}

/**
 * A follow-up turn on a settled thread (Phase 133 Theme D). The latest turn
 * moves into `turns`; each member keeps its CLI session when its provider did
 * not change, and is sent the new prompt plus an excerpt of the last synthesis.
 * Members come from the council's *current* config, so an edit between turns
 * applies to the next one.
 */
export async function continueRun(runId: string, prompt: string): Promise<GitOpResult<CouncilRun>> {
  const before = await getRun(runId);
  if (!before) return failure('Run not found.');
  const council = await getCouncil(before.councilId);

  const outcome = await withRunLock(runId, async (): Promise<GitOpResult<CouncilRun>> => {
    const current = await getRun(runId);
    if (!current) return failure('Run not found.');
    if (isCouncilRunLive(current.status)) return failure('Wait for this turn to finish, or stop it, before following up.');

    const now = Date.now();
    const turn: CouncilTurn = {
      prompt: current.prompt,
      status: current.status,
      members: current.members.map(({ ptyId: _ptyId, ...member }) => member),
      synthProvider: current.synthProvider,
      ...(current.synthModel === undefined ? {} : { synthModel: current.synthModel }),
      ...(current.synthesisStatus === undefined ? {} : { synthesisStatus: current.synthesisStatus }),
      ...(current.synthesisOutput === undefined ? {} : { synthesisOutput: current.synthesisOutput }),
      ...(current.synthesisError === undefined ? {} : { synthesisError: current.synthesisError }),
      createdAt: current.turnStartedAt ?? current.createdAt,
      endedAt: current.updatedAt,
    };

    const configured = council?.members ?? [];
    const sources: LaunchTarget[] =
      configured.length > 0
        ? configured.map((m) => ({ memberId: m.id, name: m.name, provider: m.provider, role: m.role, model: m.model }))
        : current.members.map((m) => ({ ...targetOf(m), sessionId: undefined }));
    const members = sources.map((source) => {
      const previous = current.members.find((m) => m.memberId === source.memberId);
      const sessionId = previous && previous.provider === source.provider ? previous.sessionId : undefined;
      return freshMember({ ...source, sessionId }, now);
    });

    const synthProvider = council?.synthProvider ?? current.synthProvider;
    const synthModel = council ? council.synthModel : current.synthModel;
    const next: CouncilRun = {
      id: current.id,
      councilId: current.councilId,
      format: current.format,
      prompt,
      status: 'running',
      members,
      synthProvider,
      ...(synthModel === undefined ? {} : { synthModel }),
      ...(synthProvider === current.synthProvider && current.synthSessionId !== undefined
        ? { synthSessionId: current.synthSessionId }
        : {}),
      turns: [...current.turns, turn],
      turnStartedAt: now,
      createdAt: current.createdAt,
      updatedAt: now,
    };
    liveRuns.add(runId);
    await saveRun(next);
    return ok(next);
  });

  if (outcome.ok) {
    for (const member of outcome.value.members) void launchMember(runId, targetOf(member), promptFor(outcome.value, targetOf(member)));
  }
  return outcome;
}

export async function skipMember(runId: string, memberId: string): Promise<GitOpResult> {
  const run = await getRun(runId);
  if (!run) return failure('Run not found.');
  const member = run.members.find((m) => m.memberId === memberId);
  if (!member) return failure('Member not found in this run.');
  if (member.status !== 'running') return failure('Member is not running.');

  if (member.ptyId) stopTracked(member.ptyId);
  await settleMember(runId, memberId, { status: 'failed', text: '', truncated: false }, 'skipped');
  return ok();
}

/**
 * Stop a turn outright (Phase 133 Theme A): every member still answering and
 * the synthesis are killed and recorded as `cancelled`, and so is the run.
 */
export async function cancelRun(runId: string): Promise<GitOpResult> {
  const outcome = await withRunLock(runId, async (): Promise<GitOpResult<CouncilRun>> => {
    const current = await getRun(runId);
    if (!current) return failure('Run not found.');
    if (!isCouncilRunLive(current.status)) return failure('This run is not running.');

    const now = Date.now();
    const members = current.members.map((member) => {
      if (member.status !== 'running') return member;
      if (member.ptyId) stopTracked(member.ptyId);
      const { ptyId: _ptyId, ...rest } = member;
      return { ...rest, status: 'cancelled' as const, endedAt: now };
    });
    if (current.synthesisPtyId) stopTracked(current.synthesisPtyId);
    const { synthesisPtyId: _synthesisPtyId, ...rest } = current;
    const cancelled: CouncilRun = {
      ...rest,
      members,
      status: 'cancelled',
      ...(current.status === 'synthesizing' ? { synthesisStatus: 'cancelled' as const } : {}),
      updatedAt: now,
    };
    await saveRun(cancelled);
    return ok(cancelled);
  });
  if (!outcome.ok) return outcome;
  finishLive(outcome.value);
  return ok();
}

export async function retryMember(runId: string, memberId: string): Promise<GitOpResult> {
  // Re-read the council's *current* member config outside the lock (it's a
  // different entity, not a race on the run itself), so editing a role or
  // provider then retrying picks up the change.
  const run = await getRun(runId);
  if (!run) return failure('Run not found.');
  const council = await getCouncil(run.councilId);

  const outcome = await withRunLock(runId, async (): Promise<GitOpResult<{ run: CouncilRun; target: LaunchTarget }>> => {
    const current = await getRun(runId);
    if (!current) return failure('Run not found.');
    const memberIndex = current.members.findIndex((m) => m.memberId === memberId);
    if (memberIndex === -1) return failure('Member not found in this run.');
    const member = current.members[memberIndex]!;
    if (member.status === 'running') return failure('Member is already running.');

    const configured = council?.members.find((m) => m.id === memberId);
    // Falls back to the run's own snapshot if the member was since removed from the council entirely.
    const provider = configured?.provider ?? member.provider;
    const target: LaunchTarget = {
      memberId,
      name: configured?.name ?? member.name,
      provider,
      role: configured?.role ?? member.role,
      model: configured ? configured.model : member.model,
      // The session this member resumed on this turn, when the provider is unchanged.
      sessionId: provider === member.provider ? (current.turns.length > 0 ? member.sessionId : undefined) : undefined,
    };

    const members = [...current.members];
    members[memberIndex] = freshMember(target, Date.now());
    const {
      synthesisOutput: _o,
      synthesisTruncated: _t,
      synthesisError: _e,
      synthesisPtyId: _p,
      synthesisStatus: _s,
      ...rest
    } = current;
    // A retry re-opens the settle barrier, so a synthesis that already ran off the old answer goes with it.
    const reopened: CouncilRun = { ...rest, members, status: 'running', updatedAt: Date.now() };
    liveRuns.add(runId);
    await saveRun(reopened);
    return ok({ run: reopened, target });
  });

  if (outcome.ok) void launchMember(runId, outcome.value.target, promptFor(outcome.value.run, outcome.value.target));
  return outcome.ok ? ok() : outcome;
}

/**
 * A run read as live that this process is not driving was cut off by a quit
 * or a crash: nothing will ever settle it, so say so instead of showing
 * Running forever (Phase 133 Theme A).
 */
export async function reconcileRun(run: CouncilRun): Promise<CouncilRun> {
  if (!isCouncilRunLive(run.status) || liveRuns.has(run.id)) return run;
  return withRunLock(run.id, async () => {
    const current = await getRun(run.id);
    if (!current || !isCouncilRunLive(current.status) || liveRuns.has(current.id)) return current ?? run;
    const now = Date.now();
    const settled: CouncilRun = {
      ...current,
      members: current.members.map(({ ptyId: _ptyId, ...member }) =>
        member.status === 'running' ? { ...member, status: 'failed' as const, error: INTERRUPTED, endedAt: now } : member,
      ),
      status: 'failed',
      ...(current.status === 'synthesizing' ? { synthesisStatus: 'failed' as const, synthesisError: INTERRUPTED } : {}),
      synthesisPtyId: undefined,
      updatedAt: now,
    };
    await saveRun(settled);
    return settled;
  });
}

/**
 * One question to one CLI, outside any run (Phase 133 Theme E's recommend):
 * the same temp-file script, redaction and settle path a member uses.
 */
export async function askOnce(
  provider: CouncilMemberProvider,
  model: string | undefined,
  prompt: string,
  limitMs: number,
): Promise<Outcome> {
  const key = `ask-${crypto.randomUUID()}`;
  const spawned = await spawnOneShot({ memberId: key, name: 'ask', role: '', provider, model }, prompt, key);
  runRedactions.delete(key);
  if (!spawned.ok) return { status: 'failed', text: '', truncated: false, error: spawned.message };
  return new Promise((resolve) => trackOneShot(spawned, provider, resolve, limitMs));
}

// --- internals ---------------------------------------------------------------

function stopTracked(ptyId: string): void {
  const stop = tracked.get(ptyId);
  if (stop) {
    stop();
    return;
  }
  runnerPorts().offPty(ptyId);
  runnerPorts().killPty(ptyId);
}

/** A run reached a terminal status: it is no longer this process's to drive, and its audit record is written. */
function finishLive(run: CouncilRun): void {
  liveRuns.delete(run.id);
  const sent = runRedactions.get(run.id);
  runRedactions.delete(run.id);
  const status: 'completed' | 'failed' = run.status === 'completed' ? 'completed' : 'failed';
  try {
    ports?.audit?.({
      kind: 'council-run',
      councilId: run.councilId,
      runId: run.id,
      status,
      members: run.members.length,
      succeeded: run.members.filter((m) => m.status === 'succeeded').length,
      synthProvider: run.synthProvider,
      ms: Math.max(0, Date.now() - (run.turnStartedAt ?? run.createdAt)),
      redactions: redactionTotal(sent?.redactions ?? []),
      ...(sent?.canary ? { canary: true } : {}),
    });
  } catch {
    // An audit failure must not break a run.
  }
}

async function launchMember(runId: string, member: LaunchTarget, prompt: string): Promise<void> {
  const spawned = await spawnOneShot(member, prompt, runId);
  if (!spawned.ok) {
    await settleMember(runId, member.memberId, { status: 'failed', text: '', truncated: false, error: spawned.message });
    return;
  }
  const stillWanted = await patchMemberPtyId(runId, member.memberId, spawned.ptyId);
  trackOneShot(spawned, member.provider, (outcome) => void settleMember(runId, member.memberId, outcome));
  // Cancelled or skipped while the shell was starting: stop it now rather than let it answer into nothing.
  if (!stillWanted) stopTracked(spawned.ptyId);
}

/**
 * Checks the settle barrier and, if every member is done, flips the run to
 * `synthesizing` — all under the run's lock, so two members settling back to
 * back can't both start it. The spawn happens *after* the lock releases:
 * nesting a second `withRunLock` call inside this one would deadlock.
 */
async function maybeSynthesize(runId: string): Promise<void> {
  const decision = await withRunLock(runId, async (): Promise<{ kind: 'synthesize' | 'settled'; run: CouncilRun } | null> => {
    const current = await getRun(runId);
    if (!current) return null;
    if (current.status !== 'running') return null;
    if (current.members.some((m) => m.status === 'running')) return null;

    if (!current.members.some((m) => m.status === 'succeeded' && m.output.trim().length > 0)) {
      const failed: CouncilRun = {
        ...current,
        status: 'failed',
        synthesisStatus: 'failed',
        synthesisError: NO_ANSWERS,
        updatedAt: Date.now(),
      };
      await saveRun(failed);
      return { kind: 'settled', run: failed };
    }
    const synthesizing: CouncilRun = { ...current, status: 'synthesizing', synthesisStatus: 'running', updatedAt: Date.now() };
    await saveRun(synthesizing);
    return { kind: 'synthesize', run: synthesizing };
  });
  if (!decision) return;
  if (decision.kind === 'settled') {
    finishLive(decision.run);
    return;
  }
  const run = decision.run;

  const entries: CouncilSynthesisEntry[] = run.members.map((m) => ({
    name: m.name,
    role: m.role,
    output: m.output,
    status: m.status === 'running' ? 'failed' : m.status,
  }));
  const previous = run.turns[run.turns.length - 1];
  const synthesisPrompt = buildSynthesisPrompt(run.prompt, entries, undefined, previous?.synthesisOutput);

  const spawned = await spawnOneShot(
    { memberId: 'synthesis', name: 'Synthesis', role: 'synthesizer', provider: run.synthProvider, model: run.synthModel, sessionId: run.synthSessionId },
    synthesisPrompt,
    runId,
  );
  if (!spawned.ok) {
    await finishSynthesis(runId, { status: 'failed', text: '', truncated: false, error: spawned.message });
    return;
  }

  const stillWanted = await patchSynthesisPtyId(runId, spawned.ptyId);
  trackOneShot(spawned, run.synthProvider, (outcome) => void finishSynthesis(runId, outcome));
  if (!stillWanted) stopTracked(spawned.ptyId);
}

/** The prompt with secrets scrubbed out (Phase 121 D); what it cost is tallied against the run for its audit record. */
async function scrubPrompt(prompt: string, runId: string): Promise<string> {
  let secrets: readonly OutboundSecret[] = [];
  try {
    secrets = (await runnerPorts().outboundSecrets?.()) ?? [];
  } catch {
    // The patterns still run.
  }
  const result = redactOutbound(prompt, secrets);
  const tally = runRedactions.get(runId) ?? { redactions: [], canary: false };
  runRedactions.set(runId, { redactions: mergeRedactions(tally.redactions, result.redactions), canary: tally.canary || result.canary });
  return result.text;
}

type Spawned = { ok: true; ptyId: string; invocation: string; dir: string };

/**
 * Spawn one member's (or the synthesizer's) CLI as an unattended one-shot
 * shell. `\r` is included in `initialInput` deliberately — see this module's
 * own doc comment for why that is the one place this app auto-sends a command.
 */
async function spawnOneShot(
  target: LaunchTarget,
  rawPrompt: string,
  runId: string,
): Promise<Spawned | { ok: false; message: string }> {
  const promptText = await scrubPrompt(rawPrompt, runId);
  const agents = await runnerPorts().listAgents();
  const agent = agents.find((a) => a.id === target.provider);
  if (!agent) return { ok: false, message: `Agent "${target.provider}" is not in the roster.` };

  // Phase 96 Theme H: a member bound to Ollama in Settings ▸ Agent resolves the
  // same way any other launch of this agent id would.
  const binding = runnerPorts().agentBinding(agent.id);
  const authToken =
    binding?.model && isOllamaCloudModelName(binding.model) ? await runnerPorts().ollamaApiKey() : null;
  const launch = resolveAgentLaunch(agent, binding, runnerPorts().ollamaBaseUrl(), authToken ?? undefined);

  // One engine, one key: a member bound to Ollama gets the cloud token above and no agent key.
  const keyEnv = binding?.model ? {} : ((await runnerPorts().agentKeyEnv?.(agent.id).catch(() => ({}))) ?? {});
  const env = { ...keyEnv, ...launch.env };

  const words = [
    launch.command,
    ...launch.argsBefore,
    ...councilCliArgs({
      provider: target.provider,
      model: target.model,
      sessionId: target.sessionId,
      // An Ollama binding already chose the model.
      allowModelFlag: !binding?.model,
    }),
  ];

  let dir: string;
  try {
    dir = await mkdtemp(join(tmpdir(), 'midnite-council-'));
    const promptFile = join(dir, 'prompt.txt');
    const scriptFile = join(dir, 'run.sh');
    await writeFile(promptFile, toAgentPrompt(promptText, agent.id), { encoding: 'utf8', mode: 0o600 });
    await writeFile(scriptFile, councilScript(words, promptFile), { encoding: 'utf8', mode: 0o700 });
    await chmod(scriptFile, 0o700);
  } catch (error) {
    return { ok: false, message: `Could not write the prompt file: ${error instanceof Error ? error.message : String(error)}` };
  }

  /*
    The shell is a real login shell (the same "$SHELL -l, then type" shape every
    agent session uses), so the CLI finishing does not end the pty on its own:
    `exit $?` does, with the CLI's own exit code — the settle barrier's signal.
  */
  const typed = `/bin/sh ${scriptQuote(join(dir, 'run.sh'))}; exit $?`;
  const result = await runnerPorts().createPty({
    sessionId: `council-${crypto.randomUUID()}`,
    cwd: homedir(),
    cols: COUNCIL_PTY_COLS,
    rows: COUNCIL_PTY_ROWS,
    initialInput: `${typed}\r`,
    ...(Object.keys(env).length > 0 ? { env } : {}),
  });
  if (!result.ok) {
    void removeDir(dir);
    return result;
  }
  return { ok: true, ptyId: result.ptyId, invocation: typed, dir };
}

async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Accumulate one CLI's output (capped) and race its exit against the timeout,
 * calling `onSettle` exactly once — or never, when it is stopped early through
 * {@link stopTracked} (cancel, skip), whose caller records the status itself.
 */
function trackOneShot(
  spawned: Spawned,
  provider: CouncilMemberProvider,
  onSettle: (outcome: Outcome) => void,
  limitMs: number = timeoutMs,
): void {
  const { ptyId, invocation, dir } = spawned;
  let buffer: Uint8Array = new Uint8Array(0);
  let truncated = false;
  let settled = false;

  const finish = (): void => {
    settled = true;
    clearTimeout(timer);
    tracked.delete(ptyId);
    runnerPorts().offPty(ptyId);
    void removeDir(dir);
  };

  const timer = setTimeout(() => {
    if (settled) return;
    finish();
    runnerPorts().killPty(ptyId);
    onSettle({
      status: 'timeout',
      text: '',
      truncated,
      error: `Timed out after ${Math.round(limitMs / 1000)} s without an answer.`,
    });
  }, limitMs);
  timer.unref?.();

  tracked.set(ptyId, () => {
    if (settled) return;
    finish();
    runnerPorts().killPty(ptyId);
  });

  runnerPorts().onPty(
    ptyId,
    (bytes) => {
      const capped = appendCapped(buffer, bytes, COUNCIL_OUTPUT_CAP_BYTES);
      buffer = capped.buffer;
      truncated = truncated || capped.truncated;
    },
    (exitCode) => {
      if (settled) return;
      finish();
      const raw = new TextDecoder().decode(buffer).replace(/\r\n/g, '\n');
      const answer = parseCouncilAnswer(provider, cleanCapturedOutput(raw, invocation), exitCode);
      onSettle({
        status: answer.ok ? 'succeeded' : 'failed',
        text: answer.text,
        truncated,
        sessionId: answer.sessionId,
        error: answer.error,
      });
    },
  );
}

async function settleMember(
  runId: string,
  memberId: string,
  outcome: Outcome,
  as?: 'skipped',
): Promise<void> {
  const didSettle = await withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run) return false;
    const index = run.members.findIndex((m) => m.memberId === memberId);
    if (index === -1) return false;
    const member = run.members[index]!;
    if (member.status !== 'running') return false; // already settled — e.g. skip or cancel raced the real exit

    const { ptyId: _ptyId, error: _error, ...rest } = member;
    const members = [...run.members];
    members[index] = {
      ...rest,
      status: as ?? outcome.status,
      output: outcome.text,
      truncated: outcome.truncated,
      endedAt: Date.now(),
      ...(outcome.sessionId === undefined ? {} : { sessionId: outcome.sessionId }),
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    };
    await saveRun({ ...run, members, updatedAt: Date.now() });
    return true;
  });
  // Outside the lock — see `maybeSynthesize`'s doc comment.
  if (didSettle) await maybeSynthesize(runId);
}

const SYNTHESIS_RUN_STATUS: Record<Outcome['status'], CouncilRunStatus> = {
  succeeded: 'completed',
  failed: 'failed',
  timeout: 'timeout',
};

async function finishSynthesis(runId: string, outcome: Outcome): Promise<void> {
  const finished = await withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run) return null;
    if (run.status !== 'synthesizing') return null;

    const { synthesisPtyId: _ptyId, synthesisError: _error, ...rest } = run;
    const next: CouncilRun = {
      ...rest,
      status: SYNTHESIS_RUN_STATUS[outcome.status],
      synthesisStatus: outcome.status,
      synthesisOutput: outcome.text,
      synthesisTruncated: outcome.truncated,
      updatedAt: Date.now(),
      ...(outcome.sessionId === undefined ? {} : { synthSessionId: outcome.sessionId }),
      ...(outcome.error === undefined ? {} : { synthesisError: outcome.error }),
    };
    await saveRun(next);
    return next;
  });
  if (finished) finishLive(finished);
}

/** Records the member's live pty; `false` when the member stopped running meanwhile (cancel, skip). */
async function patchMemberPtyId(runId: string, memberId: string, ptyId: string): Promise<boolean> {
  return withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run) return false;
    const index = run.members.findIndex((m) => m.memberId === memberId);
    if (index === -1 || run.members[index]!.status !== 'running') return false;
    const members = [...run.members];
    members[index] = { ...members[index]!, ptyId };
    await saveRun({ ...run, members, updatedAt: Date.now() });
    return true;
  });
}

async function patchSynthesisPtyId(runId: string, ptyId: string): Promise<boolean> {
  return withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run || run.status !== 'synthesizing') return false;
    await saveRun({ ...run, synthesisPtyId: ptyId, updatedAt: Date.now() });
    return true;
  });
}
