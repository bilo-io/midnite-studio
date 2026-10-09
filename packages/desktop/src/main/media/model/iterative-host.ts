import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { app } from 'electron';

import { resolveHeadlessAgent } from '../../companion/ask';
import { mcpShimScriptPath } from '../../mcp';
import { startMcpServer } from '../../mcp/server';
import { OUTPUT_TAIL_CAP, runProcess, type ProcessSink } from '../../process-runner';
import { isSocketPathTooLong } from '../../socket-name';
import { listAgents } from '../../terminal-service';
import type { IterativeHost } from './iterative';

/**
 * The real `IterativeHost` (everything `iterative.ts` leaves injected): a private
 * MCP server on a fresh socket, the stdio shim as the thing an agent CLI launches,
 * the roster for the CLI itself, and `runProcess` to run it.
 *
 * The socket lives in `<userData>/mcp-runs/`, **not** `<userData>/mcp/`: the shim
 * finds the app's global socket by taking the freshest `*.sock` in `mcp/`
 * (`mcp-shim/socket-resolve.ts`), so a per-run socket in that folder would be picked up by
 * a user's own Claude session and answer its `repo.list` with a one-model server.
 */
export function createIterativeHost(): IterativeHost {
  /** stdout kept (the agent's closing sentence); stderr is what `runProcess` hands back. */
  const textSink = (): ProcessSink<string> => {
    let buffer = '';
    return {
      push: (chunk) => {
        buffer = (buffer + chunk).slice(-OUTPUT_TAIL_CAP);
      },
      finish: () => ({ ok: true, data: buffer }),
    };
  };

  return {
    async startServer({ dispatch }) {
      const userDataDir = app.getPath('userData');
      const socketPath = join(userDataDir, 'mcp-runs', `r-${randomBytes(4).toString('hex')}.sock`);
      if (isSocketPathTooLong(socketPath)) return { ok: false, message: 'path too long for a Unix socket' };
      const started = await startMcpServer({
        userDataDir,
        appVersion: app.getVersion(),
        buildId: 'model-run',
        isPackaged: app.isPackaged,
        socketPath,
        dispatch,
      });
      if (!started.ok) return { ok: false, message: started.message };
      return { ok: true, socketPath: started.handle.socketPath, close: started.handle.close };
    },

    // The shim bundle runs under the app's own binary as plain node (the broker does the same).
    shimLaunch: (socketPath) => ({
      command: process.execPath,
      args: [mcpShimScriptPath(), '--socket', socketPath],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }),

    async resolveAgent(agentId) {
      const resolved = resolveHeadlessAgent(await listAgents(), agentId);
      // Never quietly run a different CLI than the one the user picked.
      if (!resolved || resolved.agent.id !== agentId) return null;
      return {
        id: resolved.agent.id,
        label: resolved.agent.label,
        command: resolved.agent.command,
        baseArgs: resolved.agent.args ?? [],
        headlessArgs: resolved.args,
      };
    },

    async runCli(req) {
      const outcome = await runProcess<string>(req.command, req.args, req.cwd, {
        sink: textSink(),
        timeoutMs: req.timeoutMs,
        onSpawned: req.onSpawned,
      });
      return outcome.ok
        ? { ok: true, exitCode: outcome.exitCode, output: outcome.data, stderr: outcome.stderr }
        : { ok: false, reason: outcome.reason, hint: outcome.hint };
    },
  };
}
