import type { TestRunResult, TestSuite } from '@midnite/git-shared';

import { runProcess, type ProcessSink, type RunProcessDeps } from '../process-runner';
import { parseStructuredResult } from './reporters';

/**
 * Running a repository's own test suite — the second arbitrary-code-execution
 * surface in the app, riding the same `process-runner.ts` engine as
 * `diagnostics/runner.ts`. The two differ only in what happens to stdout: a
 * linter's output is parsed incrementally as it streams, a test runner's JSON
 * reporter is one blob at the end, so this sink simply buffers and the
 * *chunks* are pushed straight to the caller's `onChunk` for the live output
 * pane — see `process-runner.ts`'s `RunProcessDeps.onChunk`.
 */

export const TEST_RUN_TIMEOUT_MS = 10 * 60 * 1000;

/** Capped for display; the JSON parse below always sees the untruncated buffer. */
export const OUTPUT_DISPLAY_CAP = 200_000;

function bufferSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer += chunk;
    },
    // Never fails: there is no "could not parse" outcome at this layer — an
    // unrecognised reporter format is `structured: false`, decided above.
    finish: () => ({ ok: true, data: buffer }),
  };
}

export type RunSuiteDeps = Pick<
  RunProcessDeps<string>,
  'spawn' | 'now' | 'timeoutMs' | 'onChunk' | 'onSpawned'
>;

export async function runTestSuite(suite: TestSuite, deps: RunSuiteDeps = {}): Promise<TestRunResult> {
  const runDeps: RunProcessDeps<string> = { sink: bufferSink() };
  if (deps.spawn !== undefined) runDeps.spawn = deps.spawn;
  if (deps.now !== undefined) runDeps.now = deps.now;
  if (deps.onChunk !== undefined) runDeps.onChunk = deps.onChunk;
  if (deps.onSpawned !== undefined) runDeps.onSpawned = deps.onSpawned;
  runDeps.timeoutMs = deps.timeoutMs ?? TEST_RUN_TIMEOUT_MS;

  const outcome = await runProcess(suite.run.command, suite.run.args, suite.run.cwd, runDeps);

  if (!outcome.ok) {
    // `bufferSink` never reports `parse-failed`, so only `not-installed` and
    // `timed-out` reach here in practice.
    return { ok: false, reason: outcome.reason, hint: outcome.hint };
  }

  const combined = outcome.stderr.length > 0 ? `${outcome.data}\n${outcome.stderr}` : outcome.data;
  const truncated = combined.length > OUTPUT_DISPLAY_CAP;
  const output = truncated ? combined.slice(0, OUTPUT_DISPLAY_CAP) : combined;

  // Structured reporters write their JSON to stdout — `outcome.data`, not the
  // combined buffer, so a stray stderr line cannot break the parse.
  const parsed = parseStructuredResult(outcome.data);

  return {
    ok: true,
    structured: parsed !== null,
    exitCode: outcome.exitCode,
    passed: parsed?.passed ?? 0,
    failed: parsed?.failed ?? 0,
    skipped: parsed?.skipped ?? 0,
    failures: parsed?.failures ?? [],
    output,
    truncated,
    ranAt: outcome.ranAt,
    durationMs: outcome.durationMs,
  };
}
