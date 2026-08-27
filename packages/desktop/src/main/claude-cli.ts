import type { BrowserWindow } from 'electron';

import {
  CLAUDE_COMMANDS,
  EVENT_CHANNELS,
  type ClaudeInfo,
  type ClaudeInstallMethod,
} from '@midnite/git-shared';

import { parseWhichOutput, runInShell } from './login-shell';

/**
 * The Claude CLI, from the app's point of view: what version is installed,
 * how it got there, and running the matched update with streamed output.
 *
 * Probes run through `login-shell.ts` — the `-lic` trick this file used to own
 * outright, and the reason Phase 15's agents type `claude` into a shell instead
 * of spawning the binary: nvm/asdf-managed installs only exist on the PATH a
 * real shell builds. Phase 21's roster gave that trick a second caller
 * (`agent-probe.ts`), which is why it moved. Everything still fails soft — a
 * machine without `claude` gets `installed: false`, never a rejection.
 */

const PROBE_TIMEOUT_MS = 8_000;
const UPDATE_TIMEOUT_MS = 5 * 60_000;

/**
 * The version from `claude --version` output. The CLI prints
 * `x.y.z (Claude Code)`, so that form wins outright; failing it, the LAST
 * semver in the output — the probe runs through an interactive login shell,
 * and banners (motd, tool-update notices) print bare versions BEFORE the real
 * answer, the same reason parseWhichOutput takes the last path line.
 */
export function parseClaudeVersion(output: string): string | null {
  const branded = output.match(/\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\s*\(Claude Code\)/i);
  if (branded?.[1]) return branded[1];
  const all = output.match(/\b\d+\.\d+\.\d+(?:[-+][\w.]+)?\b/g);
  return all?.[all.length - 1] ?? null;
}

/**
 * Best-effort install-method detection from the resolved binary path. The
 * heuristics mirror where each installer actually puts the shim: npm globals
 * under `node_modules`/nvm/npm prefixes, Homebrew under its cellar, the
 * native installer under `~/.local`.
 */
export function detectInstallMethod(binPath: string | null): ClaudeInstallMethod {
  if (!binPath) return 'unknown';
  if (/\/(?:\.nvm|node_modules|npm-global|\.npm-global|npm)\//.test(binPath)) return 'npm';
  if (/\/(?:homebrew|Homebrew|Cellar|linuxbrew)\//.test(binPath)) return 'brew';
  if (/\/\.local\//.test(binPath)) return 'native';
  return 'unknown';
}

export async function getClaudeInfo(timeoutMs = PROBE_TIMEOUT_MS): Promise<ClaudeInfo> {
  const which = await runInShell('command -v claude', timeoutMs);
  const binPath = which.exitCode === 0 ? parseWhichOutput(which.output) : null;
  if (!binPath) {
    return { installed: false, version: null, method: 'unknown', binPath: null };
  }

  const versionRun = await runInShell('claude --version', timeoutMs);
  return {
    installed: true,
    version: parseClaudeVersion(versionRun.output),
    method: detectInstallMethod(binPath),
    binPath,
  };
}

let updateInFlight = false;

/**
 * Run the method-matched update to completion, streaming combined output to
 * the renderer. One at a time — a second click while npm is mid-install would
 * race the first for the same global prefix.
 */
export async function runClaudeUpdate(
  getWindow: () => BrowserWindow | null,
): Promise<{ ok: true; exitCode: number } | { ok: false; message: string }> {
  if (updateInFlight) return { ok: false, message: 'an update is already running' };
  updateInFlight = true;
  try {
    const info = await getClaudeInfo();
    if (!info.installed) return { ok: false, message: 'claude is not installed' };

    const command = CLAUDE_COMMANDS[info.method].update;
    const send = (chunk: string): void => {
      getWindow()?.webContents.send(EVENT_CHANNELS.agentClaudeUpdateData, { chunk });
    };
    send(`$ ${command}\n`);
    const result = await runInShell(command, UPDATE_TIMEOUT_MS, send);
    if (result.exitCode === null) return { ok: false, message: 'update timed out or failed to run' };
    return { ok: true, exitCode: result.exitCode };
  } finally {
    updateInFlight = false;
  }
}
