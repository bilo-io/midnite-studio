import {
  createRunServers,
  mergePath,
  OUTPUT_TAIL_CAP,
  resolveLoginShellPathAsync,
  runProcess,
  type IterativeHost,
  type ProcessSink,
  type SpawnFn,
} from '@midnite/studio-runtime';
import { agentHeadlessArgs, BUILTIN_AGENTS } from '@midnite/studio-shared';

/**
 * Gamer's agent host (Phase 113 Theme S slice 3) — what a game agent run needs from the app, the same
 * `IterativeHost` Studio implements in `desktop/src/main/media/iterative-host.ts`, with nothing of Studio's:
 *
 * - **A private server per run** (the runtime's `createRunServers`): a fresh `0o700` directory under
 *   `<userData>/mcp-runs/` holding one `0o600` socket that answers only the run's dispatcher — this game's
 *   `game_*` tools — and is gone, directory and all, when the run ends. Gamer runs no other MCP server.
 * - **Its own shim** (`game-mcp-shim.js`, beside `main.cjs`), launched with Gamer's own Electron binary as
 *   plain node: it lists only the run's tools and dials only the `--socket` it is handed, so it needs no
 *   Studio installed and can reach no other server.
 * - **The built-in roster entries**, by id. Confinement is not decided here: `runGameAgent` builds the argv
 *   (Claude Code strict MCP config + file tools only; Codex `workspace-write`, network off) and refuses every
 *   other CLI before anything is spawned.
 * - **The login shell's PATH** for the CLI (a Finder-launched app sees launchd's bare PATH), passed to that
 *   child only — Gamer's own environment is not changed. No API key is injected: Claude Code and Codex use
 *   their own sign-in, exactly as in Studio, so Gamer's vault allow-list (`keys.ts`) is unchanged.
 *
 * `dispose()` is for quit: it kills every live CLI's process group and closes every run's server at once.
 */
export type GamerAgentHostDeps = {
  /** `<userData>/mcp-runs`. */
  runsDir: string;
  /** The shim script Gamer ships. */
  shimScript: string;
  /** Gamer's Electron binary (`process.execPath`), which runs the shim with `ELECTRON_RUN_AS_NODE=1`. */
  execPath: string;
  /** The login shell's PATH, or null. Default: ask the user's shell once, on the first run. */
  loginPath?: () => Promise<string | null>;
  spawn?: SpawnFn;
  log?: (line: string) => void;
};

export type GamerAgentHost = IterativeHost & { dispose(): void; liveServers(): number; liveChildren(): number };

export function createGamerAgentHost(deps: GamerAgentHostDeps): GamerAgentHost {
  const servers = createRunServers({ baseDir: deps.runsDir, ...(deps.log ? { log: deps.log } : {}) });
  const children = new Set<{ kill: () => void }>();
  let pathOnce: Promise<string | null> | null = null;
  const loginPath = (): Promise<string | null> => (pathOnce ??= (deps.loginPath ?? (() => resolveLoginShellPathAsync()))().catch(() => null));

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
    startServer: servers.startServer,

    shimLaunch: (socketPath) => ({
      command: deps.execPath,
      args: [deps.shimScript, '--socket', socketPath],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }),

    async resolveAgent(agentId) {
      const agent = BUILTIN_AGENTS.find((entry) => entry.id === agentId);
      const headless = agent ? agentHeadlessArgs(agent.id) : null;
      if (!agent || !headless) return null;
      return { id: agent.id, label: agent.label, command: agent.command, baseArgs: agent.args ?? [], headlessArgs: headless };
    },

    async runCli(req) {
      const path = await loginPath();
      let handle: { kill: () => void } | null = null;
      const outcome = await runProcess<string>(req.command, req.args, req.cwd, {
        sink: textSink(),
        timeoutMs: req.timeoutMs,
        ...(path ? { env: { PATH: mergePath(process.env['PATH'], path) } } : {}),
        ...(deps.spawn ? { spawn: deps.spawn } : {}),
        onSpawned: (spawned) => {
          handle = spawned;
          children.add(spawned);
          req.onSpawned(spawned);
        },
      });
      if (handle) children.delete(handle);
      return outcome.ok
        ? { ok: true, exitCode: outcome.exitCode, output: outcome.data, stderr: outcome.stderr }
        : { ok: false, reason: outcome.reason, hint: outcome.hint };
    },

    dispose() {
      for (const child of children) child.kill();
      children.clear();
      servers.closeAll();
    },
    liveServers: () => servers.live(),
    liveChildren: () => children.size,
  };
}
