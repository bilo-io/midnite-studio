import type { DiagnosticsCommand, DiagnosticsRun } from '@midnite/git-shared';

import { runProcess, type ProcessSink, type RunProcessDeps, type SpawnFn } from '../process-runner';
import { createEslintStream, type DiagnosticsSink } from './parse-eslint';

/**
 * Spawning a repository's own linter, parsed as it streams.
 *
 * The spawn/deadline/kill machinery lives in `../process-runner.ts` — shared
 * with `../testing/runner.ts` once suite execution needed the same three
 * properties (an argument vector with no shell, a deadline enforced by our own
 * `SIGKILL`, nothing inherited that changes behaviour). What stays here is
 * eslint-specific: picking the right streaming parser and shaping its result
 * into a `DiagnosticsRun`.
 */

export const DIAGNOSTICS_TIMEOUT_MS = 120_000;

/** The slice of a child process this module uses. Injected in tests. */
export type { SpawnedProcess, SpawnFn } from '../process-runner';

export type RunnerDeps = {
  spawn?: SpawnFn;
  now?: () => number;
  timeoutMs?: number;
  rowCap?: number;
  /** Chosen by `parser`; injectable so the runner tests need no real format. */
  sink?: (workdir: string, rowCap?: number) => DiagnosticsSink;
};

/** Pick the streaming parser for a command's declared format. */
function sinkFor(command: DiagnosticsCommand, workdir: string, rowCap?: number): DiagnosticsSink {
  switch (command.parser) {
    case 'eslint':
      return createEslintStream({ workdir, ...(rowCap === undefined ? {} : { rowCap }) });
  }
}

type EslintStreamOk = Extract<ReturnType<DiagnosticsSink['finish']>, { ok: true }>;
type OkData = Omit<EslintStreamOk, 'ok'>;

/** Adapts a `DiagnosticsSink` (a flat `{ok,...}` result) to `ProcessSink<T>` (a `{ok,data}` one). */
function toProcessSink(sink: DiagnosticsSink): ProcessSink<OkData> {
  return {
    push: sink.push,
    finish: () => {
      const result = sink.finish();
      if (!result.ok) return { ok: false, hint: result.hint };
      const { ok: _ok, ...data } = result;
      return { ok: true, data: data as OkData };
    },
  };
}

/**
 * Run one trusted command in one checkout.
 *
 * Never rejects. Every outcome — a missing binary, a wedged process, output
 * that is not what it claimed to be — is a `DiagnosticsRun` the footer renders.
 *
 * Trust is *not* checked here: this function does what it is told, and the
 * handler above it is what refuses to call it without a live grant. Keeping the
 * policy in one place beats a second, subtly different check in the mechanism.
 */
export async function runDiagnostics(
  command: DiagnosticsCommand,
  workdir: string,
  deps: RunnerDeps = {},
): Promise<DiagnosticsRun> {
  const timeoutMs = deps.timeoutMs ?? DIAGNOSTICS_TIMEOUT_MS;
  const makeSink = deps.sink ?? ((wd, cap) => sinkFor(command, wd, cap));
  const sink = toProcessSink(makeSink(workdir, deps.rowCap));

  const runDeps: RunProcessDeps<OkData> = { sink };
  if (deps.spawn !== undefined) runDeps.spawn = deps.spawn;
  if (deps.now !== undefined) runDeps.now = deps.now;
  runDeps.timeoutMs = timeoutMs;

  const outcome = await runProcess(command.command, command.args, workdir, runDeps);

  if (!outcome.ok) {
    if (outcome.reason === 'parse-failed') {
      // The linter's own complaint, if it said anything on stderr — the
      // original runner's rule: exit code plays no part, but stderr is the
      // best one-line explanation of a stream that failed to parse.
      return { ok: false, reason: 'parse-failed', hint: outcome.hint };
    }
    return { ok: false, reason: outcome.reason, hint: outcome.hint };
  }

  return {
    ok: true,
    errorCount: outcome.data.errorCount,
    warningCount: outcome.data.warningCount,
    rows: outcome.data.rows,
    withheld: outcome.data.withheld,
    ranAt: outcome.ranAt,
    durationMs: outcome.durationMs,
  };
}
