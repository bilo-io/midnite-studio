import { homedir } from 'node:os';

import {
  COUNCIL_OUTPUT_CAP_BYTES,
  COUNCIL_RUN_TIMEOUT_MS,
  agentInvocationArgs,
  failure,
  ok,
  shellQuote,
  toAgentPrompt,
  type CouncilMemberProvider,
  type CouncilRun,
  type GitOpResult,
} from '@midnite/studio-shared';

import { appendCapped, cleanCapturedOutput } from './council-output';
import { buildMemberPrompt, buildSynthesisPrompt, type CouncilSynthesisEntry } from './council-prompts';
import { getCouncil, getRun, saveRun } from './council-service';
import { createPty, killPty, offPty, onPty } from './pty-service';
import { listAgents } from './terminal-service';

/**
 * Orchestrates one council run: spawn every member in parallel as a one-shot
 * pty, wait for the settle barrier (every member `succeeded`/`failed`/
 * `timeout`/`skipped`), then spawn the synthesizer the same way.
 *
 * **The auto-send exception lives here.** Every other agent launch in this app
 * types a command into a pty and deliberately withholds the trailing Return —
 * see `start-agent.ts`'s own doc comment. A council member never touches a
 * repository, only answers `prompt`, which is why this module includes the
 * `\r` in `initialInput` and lets the command run unattended. See
 * `council.ts`'s `CouncilRunSchema` doc comment for the fuller justification.
 *
 * Council member/synthesizer ptys are spawned directly through `pty-service`,
 * independent of `terminal-store`/`TerminalSession` — they are never a row in
 * the Terminal/Sessions sidebar (a deliberate scope decision: a member run is
 * an implementation detail of this feature, not a session the user manages
 * elsewhere).
 */

const COUNCIL_PTY_COLS = 120;
const COUNCIL_PTY_ROWS = 40;

type LaunchTarget = { memberId: string; name: string; provider: CouncilMemberProvider; role: string };

/**
 * A run's members are spawned in parallel and settle independently, so more
 * than one read-modify-write of the *same* `CouncilRun` can be in flight at
 * once (two members exiting back to back, or a patch racing a settle) —
 * `council-service`'s `getRun`/`saveRun` are plain read-then-write with no
 * locking of their own. Every mutation below goes through this per-run queue
 * so a run is only ever read-modified-written by one caller at a time; two
 * calls for *different* runs never wait on each other.
 */
const runLocks = new Map<string, Promise<unknown>>();

function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const prior = runLocks.get(runId) ?? Promise.resolve();
  const settled = prior.then(fn, fn);
  // Chain the *next* lock off this settling regardless of outcome — a
  // mutation that throws must not wedge every later one for the same run.
  const tail: Promise<void> = settled.then(
    () => undefined,
    () => undefined,
  );
  runLocks.set(runId, tail);
  // `write-queue.ts`'s own `evictIfCurrent` idiom: delete only if the map
  // still holds *this* tail, so a lock re-taken while the old one settles is
  // not dropped out from under the newer chain.
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
    members: council.members.map((member) => ({
      memberId: member.id,
      name: member.name,
      provider: member.provider,
      role: member.role,
      status: 'running' as const,
      output: '',
      truncated: false,
      startedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
  await saveRun(run);

  for (const member of run.members) {
    void launchMember(
      run.id,
      { memberId: member.memberId, name: member.name, provider: member.provider, role: member.role },
      prompt,
    );
  }

  return ok(run);
}

export async function skipMember(runId: string, memberId: string): Promise<GitOpResult> {
  const run = await getRun(runId);
  if (!run) return failure('Run not found.');
  const member = run.members.find((m) => m.memberId === memberId);
  if (!member) return failure('Member not found in this run.');
  if (member.status !== 'running') return failure('Member is not running.');

  if (member.ptyId) {
    offPty(member.ptyId);
    killPty(member.ptyId);
  }
  await settleMember(runId, memberId, 'skipped', new Uint8Array(0), '', false);
  return ok();
}

export async function retryMember(runId: string, memberId: string): Promise<GitOpResult> {
  // Re-read the council's *current* member config outside the lock (it's a
  // different entity, not a race on the run itself), so editing a role or
  // provider then retrying picks up the change.
  const run = await getRun(runId);
  if (!run) return failure('Run not found.');
  const council = await getCouncil(run.councilId);

  const outcome = await withRunLock(runId, async (): Promise<GitOpResult<LaunchTarget>> => {
    const current = await getRun(runId);
    if (!current) return failure('Run not found.');
    const memberIndex = current.members.findIndex((m) => m.memberId === memberId);
    if (memberIndex === -1) return failure('Member not found in this run.');
    const member = current.members[memberIndex]!;
    if (member.status === 'running') return failure('Member is already running.');

    const configured = council?.members.find((m) => m.id === memberId);
    // Falls back to the run's own snapshot if the member was since removed
    // from the council entirely.
    const name = configured?.name ?? member.name;
    const provider = configured?.provider ?? member.provider;
    const role = configured?.role ?? member.role;

    const members = [...current.members];
    members[memberIndex] = {
      memberId,
      name,
      provider,
      role,
      status: 'running',
      output: '',
      truncated: false,
      startedAt: Date.now(),
    };
    await saveRun({
      ...current,
      members,
      // In case synthesis already ran off the old (failed/timed-out) answer —
      // a retry re-opens the settle barrier, so the stale synthesis goes with it.
      status: 'running',
      synthesisOutput: undefined,
      synthesisTruncated: undefined,
      synthesisError: undefined,
      synthesisPtyId: undefined,
      updatedAt: Date.now(),
    });

    return ok({ memberId, name, provider, role });
  });

  if (outcome.ok) void launchMember(runId, outcome.value, run.prompt);
  return outcome.ok ? ok() : outcome;
}

// --- internals ---------------------------------------------------------------

async function launchMember(
  runId: string,
  member: LaunchTarget,
  topic: string,
): Promise<void> {
  const spawned = await spawnOneShot(member.provider, buildMemberPrompt(topic, member.role));
  if (!spawned.ok) {
    await settleMember(runId, member.memberId, 'failed', new Uint8Array(0), '', false, spawned.message);
    return;
  }

  const { ptyId, invocation } = spawned;
  await patchMemberPtyId(runId, member.memberId, ptyId);
  trackOneShot(ptyId, COUNCIL_RUN_TIMEOUT_MS, (status, buffer, truncated, error) => {
    void settleMember(runId, member.memberId, status, buffer, invocation, truncated, error);
  });
}

/**
 * Checks the settle barrier and, if every member is done, flips the run to
 * `synthesizing` — all under the run's lock, so two members settling back to
 * back can't both see "not synthesizing yet" and both try to start it. The
 * actual spawn happens *after* the lock releases: it is not itself a mutation
 * of this run (that's `patchSynthesisPtyId`/`finishSynthesis`, each locked on
 * their own), and nesting a second `withRunLock` call inside this one would
 * deadlock against itself.
 */
async function maybeSynthesize(runId: string): Promise<void> {
  const run = await withRunLock(runId, async () => {
    const current = await getRun(runId);
    if (!current) return null;
    if (current.status !== 'running') return null;
    if (current.members.some((m) => m.status === 'running')) return null;

    const synthesizing: CouncilRun = { ...current, status: 'synthesizing', updatedAt: Date.now() };
    await saveRun(synthesizing);
    return synthesizing;
  });
  if (!run) return;

  const entries: CouncilSynthesisEntry[] = run.members.map((m) => ({
    name: m.name,
    role: m.role,
    output: m.output,
    status: m.status === 'running' ? 'failed' : m.status,
  }));
  const synthesisPrompt = buildSynthesisPrompt(run.prompt, entries);

  const spawned = await spawnOneShot(run.synthProvider, synthesisPrompt);
  if (!spawned.ok) {
    await finishSynthesis(runId, 'failed', new Uint8Array(0), '', false, spawned.message);
    return;
  }

  const { ptyId, invocation } = spawned;
  await patchSynthesisPtyId(runId, ptyId);
  trackOneShot(ptyId, COUNCIL_RUN_TIMEOUT_MS, (status, buffer, truncated, error) => {
    void finishSynthesis(runId, status === 'succeeded' ? 'completed' : 'failed', buffer, invocation, truncated, error);
  });
}

/**
 * Spawn one member/synthesizer command as an unattended one-shot pty. `\r` is
 * included in `initialInput` deliberately — see this module's own doc comment
 * for why that is the one place this app auto-sends a command.
 */
async function spawnOneShot(
  provider: CouncilMemberProvider,
  promptText: string,
): Promise<{ ok: true; ptyId: string; invocation: string } | { ok: false; message: string }> {
  const agents = await listAgents();
  const agent = agents.find((a) => a.id === provider);
  if (!agent) return { ok: false, message: `Agent "${provider}" is not in the roster.` };

  const words = [
    agent.command,
    ...agentInvocationArgs(agent.id),
    shellQuote(toAgentPrompt(promptText, agent.id)),
  ];
  const invocation = words.join(' ');
  /*
    The pty is a real login shell with the command typed into it — the same
    "$SHELL -l, then type" shape every other agent session in this app uses —
    not `pty.spawn(command)` directly. That means the CLI finishing does NOT
    make the pty exit: the shell just returns to a fresh prompt and sits
    there. `trackOneShot`'s only "this member is done" signal is the pty's own
    exit event, so without an explicit `exit` the settle barrier would never
    fire on a real run and every member would hit the 120s timeout regardless
    of how fast it actually answered. `$?` is read before `exit` consumes it,
    so the shell's own exit code ends up mirroring the CLI's.
  */
  const typed = `${invocation}; exit $?`;

  const result = await createPty({
    sessionId: `council-${crypto.randomUUID()}`,
    cwd: homedir(),
    cols: COUNCIL_PTY_COLS,
    rows: COUNCIL_PTY_ROWS,
    initialInput: `${typed}\r`,
  });
  if (!result.ok) return result;
  // `invocation` here is what the pty actually echoes back — see
  // `cleanCapturedOutput`'s echo-strip — so it has to be the full typed line,
  // `; exit $?` included, not just the CLI's own command.
  return { ok: true, ptyId: result.ptyId, invocation: typed };
}

/**
 * Accumulate one pty's output (capped) and race its exit against `timeoutMs`,
 * calling `onSettle` exactly once either way. Shared between a member and the
 * synthesizer — the two differ only in what `onSettle` does with the result.
 */
function trackOneShot(
  ptyId: string,
  timeoutMs: number,
  onSettle: (
    status: 'succeeded' | 'failed' | 'timeout',
    buffer: Uint8Array,
    truncated: boolean,
    error?: string,
  ) => void,
): void {
  let buffer: Uint8Array = new Uint8Array(0);
  let truncated = false;
  let settled = false;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    offPty(ptyId);
    killPty(ptyId);
    onSettle('timeout', buffer, truncated, 'Timed out waiting for a response.');
  }, timeoutMs);
  timer.unref?.();

  onPty(
    ptyId,
    (bytes) => {
      const capped = appendCapped(buffer, bytes, COUNCIL_OUTPUT_CAP_BYTES);
      buffer = capped.buffer;
      truncated = truncated || capped.truncated;
    },
    (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onSettle(
        exitCode === 0 ? 'succeeded' : 'failed',
        buffer,
        truncated,
        exitCode === 0 ? undefined : `Exited with code ${exitCode}.`,
      );
    },
  );
}

async function settleMember(
  runId: string,
  memberId: string,
  status: 'succeeded' | 'failed' | 'timeout' | 'skipped',
  rawBuffer: Uint8Array,
  invocation: string,
  truncated: boolean,
  error?: string,
): Promise<void> {
  const didSettle = await withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run) return false;
    const index = run.members.findIndex((m) => m.memberId === memberId);
    if (index === -1) return false;
    const member = run.members[index]!;
    if (member.status !== 'running') return false; // already settled — e.g. skip raced the real exit

    const output = cleanCapturedOutput(new TextDecoder().decode(rawBuffer), invocation);
    const members = [...run.members];
    members[index] = {
      ...member,
      status,
      output,
      truncated,
      endedAt: Date.now(),
      ptyId: undefined,
      ...(error === undefined ? {} : { error }),
    };
    await saveRun({ ...run, members, updatedAt: Date.now() });
    return true;
  });
  // Outside the lock — see `maybeSynthesize`'s own doc comment on why nesting
  // a second `withRunLock` call here would deadlock.
  if (didSettle) await maybeSynthesize(runId);
}

async function finishSynthesis(
  runId: string,
  status: 'completed' | 'failed',
  rawBuffer: Uint8Array,
  invocation: string,
  truncated: boolean,
  error?: string,
): Promise<void> {
  await withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run) return;
    if (run.status !== 'synthesizing') return;

    const output = cleanCapturedOutput(new TextDecoder().decode(rawBuffer), invocation);
    await saveRun({
      ...run,
      status,
      synthesisOutput: output,
      synthesisTruncated: truncated,
      synthesisPtyId: undefined,
      updatedAt: Date.now(),
      ...(error === undefined ? {} : { synthesisError: error }),
    });
  });
}

async function patchMemberPtyId(runId: string, memberId: string, ptyId: string): Promise<void> {
  await withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run) return;
    const index = run.members.findIndex((m) => m.memberId === memberId);
    if (index === -1) return;
    const members = [...run.members];
    members[index] = { ...members[index]!, ptyId };
    await saveRun({ ...run, members, updatedAt: Date.now() });
  });
}

async function patchSynthesisPtyId(runId: string, ptyId: string): Promise<void> {
  await withRunLock(runId, async () => {
    const run = await getRun(runId);
    if (!run) return;
    await saveRun({ ...run, synthesisPtyId: ptyId, updatedAt: Date.now() });
  });
}
