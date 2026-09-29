import { OUTPUT_TAIL_CAP, type SpawnFn } from '../../process-runner';
import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate, interpolateRecord } from '../interpolate';
import { runHeadlessScript } from './verify';

/**
 * The `command` node — `verify`'s headless `/bin/sh -c` run
 * (`runHeadlessScript`), with its output handed downstream instead of
 * graded: `{exitCode, stdout, stderr}`, clean of the escape codes and echoed
 * input a `script` node's pty transcript carries. Unlike `verify`'s embedded
 * check, `command` and `env` are `{{...}}`-interpolated first, the same as a
 * `script` node's.
 *
 * A non-zero exit is a failure unless `allowNonZeroExit` is set — the shell's
 * own verdict, as a `script` node's `; exit $?` is.
 */

export type CommandExecutorDeps = { spawn?: SpawnFn; now?: () => number };

function capTail(text: string): { text: string; truncated: boolean } {
  return text.length <= OUTPUT_TAIL_CAP
    ? { text, truncated: false }
    : { text: text.slice(-OUTPUT_TAIL_CAP), truncated: true };
}

export function createCommandExecutor(deps: CommandExecutorDeps = {}): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'command') return { ok: false, error: 'Not a command node.' };

    const command = interpolate(node.config.command, context.upstream);
    if (!command.ok) return command;
    const env = interpolateRecord(node.config.env, context.upstream);
    if (!env.ok) return env;

    const result = await runHeadlessScript(
      { command: command.value, env: env.value, ...(node.config.cwd ? { cwd: node.config.cwd } : {}) },
      context,
      deps,
    );
    if (!result.ok) return result;

    const stdout = capTail(result.stdout);
    const stderr = capTail(result.stderr);
    const output = { exitCode: result.exitCode, stdout: stdout.text, stderr: stderr.text };
    if (result.exitCode !== 0 && !node.config.allowNonZeroExit) {
      const detail = result.stderr.trim().split('\n').at(-1) ?? '';
      return { ok: false, error: `Exited with code ${result.exitCode ?? 'unknown'}${detail ? `: ${detail}` : '.'}` };
    }
    return { ok: true, output, truncated: stdout.truncated || stderr.truncated };
  };
}

export const commandExecutor = createCommandExecutor();
