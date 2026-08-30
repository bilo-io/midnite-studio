import { spawn } from 'node:child_process';

/**
 * Running one command line the way the *user's* shell would run it.
 *
 * Extracted from `claude-cli.ts`, which had this to itself while the Claude
 * CLI was the only binary the app went looking for. Phase 21's roster made that
 * four, and `agent-probe.ts` needs exactly the same trick for exactly the same
 * reason — so it lives here rather than in either caller.
 *
 * The reason is `-lic`: login AND interactive. A `Midnite Studio.app` opened from
 * Finder inherits launchd's bare PATH, and the two agents this phase was
 * written against (`claude`, `agy`) both live in `~/.local/bin`, which reaches
 * the environment only through an interactive rc file. `shell-path.ts` folds
 * that PATH into `process.env` at boot and a probe could read it from there —
 * but going through the shell also catches the installs that are a shell
 * function or an alias rather than a file on the PATH, and it is the same
 * resolution the pty itself will do when the command is finally typed.
 *
 * Everything here fails soft. A machine with a broken profile gets a null exit
 * code, never a rejection.
 */

/** The user's login shell, with the platform's usual default as the fallback. */
export const loginShell = (): string =>
  process.env['SHELL'] ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

export type ShellRun = { output: string; exitCode: number | null };

/**
 * Run one command line in a login+interactive shell, capturing combined
 * output. `exitCode` is `null` when the shell could not be started at all or
 * had to be killed on the timeout — a caller cannot tell those apart, and
 * neither wants to: both mean "no answer".
 */
export function runInShell(
  command: string,
  timeoutMs: number,
  onChunk?: (chunk: string) => void,
): Promise<ShellRun> {
  return new Promise((resolvePromise) => {
    const child = spawn(loginShell(), ['-lic', command], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const collect = (data: Buffer): void => {
      const text = data.toString('utf8');
      output += text;
      onChunk?.(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolvePromise({ output, exitCode: null });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ output, exitCode: code });
    });
  });
}

/**
 * The last non-empty line that looks like an absolute path.
 *
 * Last, not first: the probe runs through an interactive login shell, so
 * banners (motd, version-update notices, nvm chatter) print BEFORE the real
 * answer. The same reason `parseClaudeVersion` takes the last semver.
 */
export function parseWhichOutput(output: string): string | null {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/'));
  return lines[lines.length - 1] ?? null;
}
