import { homedir } from 'node:os';

import {
  WORKFLOW_VERIFY_MAX_FAILURES,
  agentNodeDonePrompt,
  parseWorkflowTestCounts,
  redactPaths,
  type WorkflowVerifyEvidence,
  type WorkflowVerifyExitCodeCheck,
  type WorkflowVerifyJsonPathCheck,
  type WorkflowVerifyTestCountsCheck,
} from '@midnite/studio-shared';

import { interpolate } from '../interpolate';
import { runProcess, type ProcessSink, type SpawnFn } from '../../process-runner';
import type { ExecutorContext, NodeExecutor, NodeOutcome } from '../executor-registry';
import { parseAgentDoneMarker, runAgentToDoneMarker } from './agent';
import { evaluateConditionOp } from './condition';
import { defaultNodePtyDeps, type NodePtyDeps } from './node-pty-deps';

/**
 * The `verify` node (Phase 97 Theme E) — "a checker that is not the maker",
 * settling on `pass`/`fail` (never a failure in itself, exactly like
 * `condition`'s `true`/`false` — see `workflow.ts`'s `portsForNodeKind`
 * `'verify'` case). `ok: false` is reserved for a genuine infra failure: the
 * check itself could not run (no command, a bad agent id, the process was
 * cancelled) — a workflow cannot tell "the target failed the check" from "we
 * never managed to check it" any other way.
 *
 * `exit-code`/`test-counts` run **headlessly** via `process-runner.ts`
 * (`/bin/sh -c`, no shell prompt, no node-pty) rather than `script.ts`'s
 * interactive pty — a check needs clean stdout to read an exit code or parse
 * a test reporter's json/xml/tap, which an interactive terminal transcript
 * (escape codes, echoed input) is not. macOS is this repo's only supported
 * platform (`CLAUDE.md`), so `/bin/sh` is hard-coded rather than resolved per
 * OS the way a cross-platform shell would need to be.
 */

const VERIFY_CANCEL_POLL_MS = 50;
const VERIFY_OUTPUT_CAP_BYTES = 200_000;

export type VerifyExecutorDeps = {
  /** `check: 'agent'` reuses `executors/agent.ts`'s roster/pty machinery. */
  agent: NodePtyDeps;
  /** Injectable for `exit-code`/`test-counts` tests — see `process-runner.ts`'s own `RunProcessDeps`. */
  spawn?: SpawnFn;
  now?: () => number;
};

export const defaultVerifyExecutorDeps: VerifyExecutorDeps = { agent: defaultNodePtyDeps };

function capFailures(failures: readonly string[]): string[] {
  return failures.slice(0, WORKFLOW_VERIFY_MAX_FAILURES);
}

/** Total by construction: every stdout chunk lands here, nothing is dropped before the parser sees it. */
function bufferSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer += chunk;
    },
    finish: () => ({ ok: true, data: buffer }),
  };
}

/** `KEY=value` assignments prefixed onto the shell line — the exact escaping `script.ts`'s own (unexported) `envPrefix` uses. */
function envPrefix(env: Readonly<Record<string, string>>): string {
  const entries = Object.entries(env);
  if (entries.length === 0) return '';
  return `${entries.map(([key, value]) => `${key}=${shellQuoteEnvValue(value)}`).join(' ')} `;
}

function shellQuoteEnvValue(value: string): string {
  return `'${value.replace(/'/g, String.raw`'\''`)}'`;
}

type HeadlessScriptResult =
  | { ok: true; exitCode: number | null; stdout: string; combinedTail: string }
  | { ok: false; error: string };

/**
 * Runs `config.command` in `/bin/sh -c`, actively killed on
 * `context.signal.cancelled()` (the same 50ms-poll idiom `script.ts`/
 * `agent.ts` use for their own pty sessions, adapted to `process-runner.ts`'s
 * `onSpawned` hook since there is no pty here to poll through).
 */
async function runHeadlessScript(
  config: Pick<WorkflowVerifyExitCodeCheck | WorkflowVerifyTestCountsCheck, 'command' | 'cwd' | 'env'>,
  context: ExecutorContext,
  deps: VerifyExecutorDeps,
): Promise<HeadlessScriptResult> {
  if (config.command.trim() === '') return { ok: false, error: 'This node has no command.' };

  const cwd = config.cwd?.trim() || homedir();
  const script = `${envPrefix(config.env)}${config.command}`;

  let cancelled = false;
  let poll: ReturnType<typeof setInterval> | undefined;

  const outcome = await runProcess('/bin/sh', ['-c', script], cwd, {
    sink: bufferSink(),
    timeoutMs: context.timeoutMs,
    ...(deps.spawn ? { spawn: deps.spawn } : {}),
    ...(deps.now ? { now: deps.now } : {}),
    onSpawned: (handle) => {
      poll = setInterval(() => {
        if (context.signal.cancelled()) {
          cancelled = true;
          handle.kill();
        }
      }, VERIFY_CANCEL_POLL_MS);
      poll.unref?.();
    },
  });
  if (poll !== undefined) clearInterval(poll);
  if (cancelled) return { ok: false, error: 'Cancelled.' };

  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.reason === 'timed-out' ? outcome.hint : `Could not run the command: ${outcome.hint}`,
    };
  }

  // Stdout alone for a parser (a stray stderr line must never break a json/
  // xml parse — `testing/runner.ts`'s own doc comment makes the identical
  // point); stdout+stderr, capped, for a human-readable failure excerpt.
  const combined = outcome.stderr.length > 0 ? `${outcome.data}\n${outcome.stderr}` : outcome.data;
  const combinedTail =
    combined.length > VERIFY_OUTPUT_CAP_BYTES ? combined.slice(-VERIFY_OUTPUT_CAP_BYTES) : combined;
  return { ok: true, exitCode: outcome.exitCode, stdout: outcome.data, combinedTail };
}

async function runExitCodeCheck(
  config: WorkflowVerifyExitCodeCheck,
  context: ExecutorContext,
  deps: VerifyExecutorDeps,
): Promise<NodeOutcome> {
  const result = await runHeadlessScript(config, context, deps);
  if (!result.ok) return result;

  const passed = result.exitCode === 0;
  const evidence: WorkflowVerifyEvidence = {
    check: 'exit-code',
    passed: passed ? 1 : 0,
    failed: passed ? 0 : 1,
    message: passed ? 'Exited with code 0.' : `Exited with code ${result.exitCode ?? 'unknown'}.`,
    failures: passed ? [] : capFailures([redactPaths(result.combinedTail.trim() || 'no output')]),
  };
  return { ok: true, output: evidence, port: passed ? 'pass' : 'fail' };
}

async function runTestCountsCheck(
  config: WorkflowVerifyTestCountsCheck,
  context: ExecutorContext,
  deps: VerifyExecutorDeps,
): Promise<NodeOutcome> {
  const result = await runHeadlessScript(config, context, deps);
  if (!result.ok) return result;

  const counts = parseWorkflowTestCounts(config.parser, result.stdout);
  if (!counts) {
    // Not a verdict either way — the check itself could not be read, the
    // same "never a guess" rule `parseWorkflowTestCounts` documents.
    return {
      ok: false,
      error: `Could not read ${config.parser} test output from this command's stdout.`,
    };
  }

  const passed = counts.failed === 0 && counts.passed >= config.minPassed;
  const evidence: WorkflowVerifyEvidence = {
    check: 'test-counts',
    passed: counts.passed,
    failed: counts.failed,
    message: `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped.`,
    failures: capFailures(
      counts.failures.map((f) => redactPaths(`${f.name}${f.file ? ` (${f.file})` : ''}: ${f.message}`)),
    ),
  };
  return { ok: true, output: evidence, port: passed ? 'pass' : 'fail' };
}

async function runJsonPathCheck(
  config: WorkflowVerifyJsonPathCheck,
  context: ExecutorContext,
): Promise<NodeOutcome> {
  const left = interpolate(config.source, context.upstream);
  if (!left.ok) return { ok: false, error: left.error };

  let right = '';
  if (config.op !== 'empty') {
    if (config.right === undefined) return { ok: false, error: `"${config.op}" needs a right-hand value.` };
    const resolved = interpolate(config.right, context.upstream);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    right = resolved.value;
  }

  const passed = evaluateConditionOp(left.value, config.op, right);
  const description =
    config.op === 'empty' ? `"${left.value}" is${passed ? '' : ' not'} empty` : `"${left.value}" ${config.op} "${right}"`;
  const evidence: WorkflowVerifyEvidence = {
    check: 'json-path',
    passed: passed ? 1 : 0,
    failed: passed ? 0 : 1,
    message: `${description}: ${passed}.`,
    failures: passed ? [] : [`${description} did not hold.`],
  };
  return { ok: true, output: evidence, port: passed ? 'pass' : 'fail' };
}

async function runAgentCheck(
  config: { check: 'agent'; agentId: string; prompt: string; model?: string },
  node: Parameters<NodeExecutor>[0],
  context: ExecutorContext,
  agentDeps: NodePtyDeps,
): Promise<NodeOutcome> {
  if (config.agentId.trim() === '') return { ok: false, error: 'This node has no agent selected for its check.' };
  if (config.prompt.trim() === '') return { ok: false, error: 'This node has no prompt for its check.' };

  return runAgentToDoneMarker(
    { agentId: config.agentId, prompt: config.prompt, model: config.model },
    node,
    context,
    agentDeps,
    {
      buildPrompt: agentNodeDonePrompt,
      parseMarker: parseAgentDoneMarker,
      // A `fail` marker is a verdict, not an executor failure: it settles
      // the `fail` port with evidence, unlike the plain agent node.
      toOutcome: (marker) => {
        const passed = marker === 'ok';
        const evidence: WorkflowVerifyEvidence = {
          check: 'agent',
          passed: passed ? 1 : 0,
          failed: passed ? 0 : 1,
          message: passed ? 'Agent reported ok.' : 'Agent reported it could not complete this task.',
          failures: passed ? [] : ['Agent reported it could not complete this task.'],
        };
        return { ok: true, output: evidence, port: passed ? 'pass' : 'fail' };
      },
    },
  );
}

export function createVerifyExecutor(deps: VerifyExecutorDeps = defaultVerifyExecutorDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'verify') return { ok: false, error: 'Not a verify node.' };
    const config = node.config;
    switch (config.check) {
      case 'agent':
        return runAgentCheck(config, node, context, deps.agent);
      case 'exit-code':
        return runExitCodeCheck(config, context, deps);
      case 'test-counts':
        return runTestCountsCheck(config, context, deps);
      case 'json-path':
        return runJsonPathCheck(config, context);
      default: {
        const exhaustive: never = config;
        return exhaustive;
      }
    }
  };
}

export const verifyExecutor = createVerifyExecutor();
