import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { preferredTargets } from './cli-path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { OllamaDaemonStatus, SystemHealth, ToolchainBinary } from '@midnite/studio-shared';
import { ollamaVersion, resolveOllamaBaseUrl } from './ollama/client';

export type { SystemHealth, ToolchainBinary };

const execAsync = promisify(exec);

// Every probe below shells out. A stuck `ssh-add -l` (agent socket present but
// unresponsive) or a slow binary probe under load would otherwise hang
// the caller for as long as the child lives; bound each so `readSystemHealth`
// always settles. The try/catch around each probe already treats a rejection as
// "unavailable", so a timed-out probe degrades to null/false.
const PROBE_TIMEOUT_MS = 4000;

/**
 * Probe a binary on the machine, checking candidate locations first and
 * falling back to `which <binName>` on PATH, then querying `--version`.
 */
export async function probeBinary(
  binName: string,
  candidatePaths: string[] = [],
): Promise<ToolchainBinary> {
  let binPath: string | null = null;

  // 1. Check candidate paths first if they exist on disk
  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      binPath = candidate;
      break;
    }
  }

  // 2. If not found in candidates, resolve via `which <binName>`
  if (!binPath) {
    try {
      const { stdout } = await execAsync(`which ${binName}`, { timeout: PROBE_TIMEOUT_MS });
      const found = stdout
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('/'))[0];
      if (found && existsSync(found)) {
        binPath = found;
      }
    } catch {
      // not on PATH
    }
  }

  if (!binPath) {
    return { path: null, version: null };
  }

  // 3. Obtain version string
  try {
    const { stdout } = await execAsync(`"${binPath}" --version`, { timeout: PROBE_TIMEOUT_MS });
    const version = stdout.trim() || null;
    return { path: binPath, version };
  } catch {
    return { path: binPath, version: null };
  }
}

export async function readSystemHealth(): Promise<SystemHealth> {
  const home = homedir();

  const [git, homebrew, node, pnpm, moon, ollama, ollamaDaemon, sshResult] = await Promise.all([
    probeBinary('git', ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git']),
    probeBinary('brew', ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']),
    probeBinary('node', [
      join(home, '.proto/bin/node'),
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
    ]),
    probeBinary('pnpm', [
      join(home, '.proto/shims/pnpm'),
      '/opt/homebrew/bin/pnpm',
      '/usr/local/bin/pnpm',
    ]),
    probeBinary('moon', [
      join(home, '.proto/bin/moon'),
      '/opt/homebrew/bin/moon',
      '/usr/local/bin/moon',
    ]),
    probeBinary('ollama', [
      '/usr/local/bin/ollama',
      '/opt/homebrew/bin/ollama',
      '/Applications/Ollama.app/Contents/Resources/ollama',
    ]),
    probeOllamaDaemon(),
    (async () => {
      let running = false;
      let keys = 0;
      try {
        const { stdout } = await execAsync('ssh-add -l', { timeout: PROBE_TIMEOUT_MS });
        running = true;
        if (!stdout.includes('The agent has no identities')) {
          keys = stdout.trim().split('\n').length;
        }
      } catch (err: unknown) {
        const errorMsg = String(err);
        if (errorMsg.includes('The agent has no identities')) {
          running = true;
          keys = 0;
        } else {
          running = false;
          keys = 0;
        }
      }
      return { running, keys };
    })(),
  ]);

  const shell = process.env.SHELL || '/bin/zsh';

  const targets = preferredTargets(home);
  let installed = false;
  let foundPath: string | null = null;
  let foundTarget: string | null = null;
  for (const t of targets) {
    if (existsSync(t)) {
      installed = true;
      foundPath = t;
      foundTarget = t;
      break;
    }
  }

  return {
    git,
    shell,
    sshAgent: sshResult,
    cli: { installed, path: foundPath, target: foundTarget, managed: installed },
    homebrew,
    node,
    pnpm,
    moon,
    ollama,
    ollamaDaemon,
  };
}

/**
 * `GET /api/version` through Theme B's client — a short, bounded probe so an
 * absent daemon never slows `readSystemHealth`'s `Promise.all` down to
 * `PROBE_TIMEOUT_MS`. Never throws: an unreachable daemon is `reachable:
 * false`, the same "degrade rather than fail" shape every other probe here
 * already follows.
 */
async function probeOllamaDaemon(): Promise<OllamaDaemonStatus> {
  const host = resolveOllamaBaseUrl();
  try {
    const version = await ollamaVersion({ baseUrl: host, timeoutMs: PROBE_TIMEOUT_MS });
    return { reachable: true, version, host };
  } catch {
    return { reachable: false, version: null, host };
  }
}
