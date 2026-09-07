import type { ScriptContext, ScriptRun } from '@midnite/studio-shared';

import { runScript } from '../main/api-client/script-runner';

/**
 * Phase 70 Theme B — the `utilityProcess` entry point `script-runner-broker.ts`
 * forks. Its own memory space, no Electron APIs, no main-process privileges:
 * a sandbox escape past `script-runner.ts`'s allow-list lands here, not in
 * the process holding the window, the repo's write queue, or a keychain
 * credential.
 *
 * Deliberately thin — every actual security property (the allow-list, the
 * `vm` context flags, the `pm.expect` subset) lives in `runScript` itself,
 * imported and called unchanged; this file is only the message plumbing
 * `process.parentPort` needs to receive one `{runId, source, context,
 * timeoutMs}` and post back one `{runId, run}`.
 */

interface RunRequest {
  runId: string;
  source: string;
  context: ScriptContext;
  timeoutMs: number;
}

interface RunReply {
  runId: string;
  run: ScriptRun;
}

process.parentPort.on('message', (event) => {
  const { runId, source, context, timeoutMs } = event.data as RunRequest;

  let run: ScriptRun;
  try {
    run = runScript(source, context, timeoutMs);
  } catch (error) {
    // `runScript` itself never throws (every failure folds into its own
    // `error` field) — this is a defensive backstop only, so a bug in that
    // contract still reaches the parent as a result rather than an
    // unhandled rejection with no reply at all, which would otherwise hang
    // the broker's own parent-side timeout for no reason.
    run = {
      results: [],
      logs: [],
      mutations: { environment: {}, collectionVariables: {} },
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const reply: RunReply = { runId, run };
  process.parentPort.postMessage(reply);
});
