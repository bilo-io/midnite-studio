import { runProcess, type SpawnFn } from '@midnite/studio-runtime';

import type { SensorRunProcess } from './sensor-host';

/** The sensor host's `runProcess`, over the runtime's no-shell runner (group kill, deadline, never rejects). */
export function createSensorRunProcess(options: {
  spawn?: SpawnFn;
  defaultCwd: string;
  defaultTimeoutMs?: number;
}): SensorRunProcess {
  return async (command, args, opts) => {
    let stdout = '';
    const outcome = await runProcess(command, args, opts?.cwd ?? options.defaultCwd, {
      ...(options.spawn ? { spawn: options.spawn } : {}),
      timeoutMs: opts?.timeoutMs ?? options.defaultTimeoutMs ?? 30_000,
      onSpawned: ({ kill }) => {
        if (opts?.signal?.aborted) kill();
        else opts?.signal?.addEventListener('abort', kill, { once: true });
      },
      sink: {
        push: (chunk) => {
          stdout += chunk;
        },
        finish: () => ({ ok: true, data: stdout }),
      },
    });
    if (outcome.ok)
      return { ok: true, stdout: outcome.data, stderr: outcome.stderr, exitCode: outcome.exitCode };
    return {
      ok: false,
      reason: outcome.reason === 'parse-failed' ? 'failed' : outcome.reason,
      hint: outcome.hint,
    };
  };
}
