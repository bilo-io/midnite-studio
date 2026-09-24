import { homedir } from 'node:os';

import { appendCapped, cleanCapturedOutput } from '../../council-output';
import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { defaultNodePtyDeps, NODE_PTY_POLL_MS, type NodePtyDeps } from './node-pty-deps';

/**
 * The `script` node (Phase 95 Theme J) — runs `config.command` in a real pty
 * (the same broker path every other terminal session uses, via
 * `startNodeSession` → `createPty`), grouped into the workflow run's own
 * terminal accordion by `TerminalSession.workflowRunRef`.
 *
 * **Settles on the shell's own exit status**, exactly like a council
 * member (`council-runner.ts`'s own doc comment): the command is typed in
 * with `; exit $?` appended, so the login shell's exit *is* the command's
 * exit, and the pty's `pty:exit` is the one completion signal this executor
 * needs. Unlike a council member, the session this runs in is a real,
 * durable `TerminalSession` the user can watch, resume input into, or kill
 * from the accordion group's own kill switch — closing it early is exactly
 * what makes the pty exit early, which this executor reads as a failure
 * rather than special-casing "killed".
 */

const SCRIPT_OUTPUT_CAP_BYTES = 200_000;

export type ScriptNodeOutput = {
  exitCode: number;
  output: string;
  truncated: boolean;
};

/**
 * `KEY=value` assignments prefixed onto the command line — `createPty` has
 * no `env` parameter of its own (only `agentFingerprintEnv`'s narrow
 * agent-only fingerprint), so a script node's own `env` config rides the
 * shell's own assignment syntax instead of a process-spawn option.
 */
function envPrefix(env: Readonly<Record<string, string>>): string {
  const entries = Object.entries(env);
  if (entries.length === 0) return '';
  return `${entries.map(([key, value]) => `${key}=${shellQuoteEnvValue(value)}`).join(' ')} `;
}

/** Single-quoted, the same escaping `shellQuote` (shared) uses — kept local since this quotes an env VALUE, not a whole prompt. */
function shellQuoteEnvValue(value: string): string {
  return `'${value.replace(/'/g, String.raw`'\''`)}'`;
}

export function createScriptExecutor(deps: NodePtyDeps = defaultNodePtyDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'script') return { ok: false, error: 'Not a script node.' };
    const config = node.config;
    if (config.command.trim() === '') return { ok: false, error: 'This node has no command.' };

    const cwd = config.cwd?.trim() || homedir();
    const typed = `${envPrefix(config.env)}${config.command}; exit $?`;

    const started = await deps.startSession({
      workflowId: context.workflowId,
      runId: context.runId,
      nodeId: node.id,
      kind: 'shell',
      nodeLabel: node.label,
      cwd,
      initialInput: `${typed}\r`,
    });
    if (!started.ok) return { ok: false, error: started.message };
    await context.reportSessionId(started.session.id);

    return new Promise((resolve) => {
      let buffer = new Uint8Array(0);
      let truncated = false;
      let settled = false;

      const settle = (outcome: NodeOutcome) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        deps.offPty(started.ptyId);
        resolve(outcome);
      };

      const poll = setInterval(() => {
        if (context.signal.cancelled()) {
          deps.killPty(started.ptyId);
          settle({ ok: false, error: 'Cancelled.' });
        }
      }, NODE_PTY_POLL_MS);
      poll.unref?.();

      deps.onPty(
        started.ptyId,
        (bytes) => {
          const capped = appendCapped(buffer, bytes, SCRIPT_OUTPUT_CAP_BYTES);
          buffer = capped.buffer;
          truncated = truncated || capped.truncated;
        },
        (exitCode) => {
          const output: ScriptNodeOutput = {
            exitCode,
            output: cleanCapturedOutput(new TextDecoder().decode(buffer), typed),
            truncated,
          };
          settle(
            exitCode === 0
              ? { ok: true, output, truncated }
              : { ok: false, error: `Exited with code ${exitCode}.` },
          );
        },
      );
    });
  };
}

export const scriptExecutor = createScriptExecutor();
