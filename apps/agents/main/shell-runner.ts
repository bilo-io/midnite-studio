import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import type { CouncilRunnerPorts } from '@midnite/studio-feature-councils/main';

/**
 * The council runner's pty port, without a pty.
 *
 * Studio spawns a council member as a one-shot **pty** through its terminal broker, because the member
 * shows up as live output in Studio's own terminal views. Agents has no terminal and does not ship the
 * node-pty broker (Sessions integration is slice 2), so a member runs as the user's login shell with
 * piped stdio: the command the runner builds (`<agent> -p "…"; exit $?`) is written to its stdin and the
 * shell exits with the CLI's own code. The headless flags the runner already adds are what make the CLIs
 * behave without a tty. Output that arrives before the runner has registered its listener is buffered and
 * flushed on `onPty`, so a fast member loses nothing.
 */
type Live = {
  child: ChildProcessWithoutNullStreams;
  onData: ((bytes: Uint8Array) => void) | null;
  onExit: ((exitCode: number) => void) | null;
  pending: Uint8Array[];
  exited: number | null;
};

export type ShellRunner = Pick<CouncilRunnerPorts, 'createPty' | 'killPty' | 'onPty' | 'offPty'> & {
  /** Kills every member still running — on quit, since a member's shell is its own process group. */
  killAll(): void;
};

export function createShellRunner(options: { shell?: string } = {}): ShellRunner {
  const live = new Map<string, Live>();
  let seq = 0;

  const kill = (child: ChildProcessWithoutNullStreams): void => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  };

  return {
    async createPty({ cwd, initialInput, env }) {
      const shell = options.shell ?? process.env['SHELL'] ?? '/bin/zsh';
      let child: ChildProcessWithoutNullStreams;
      try {
        // Its own process group, so a kill reaches the agent CLI the shell started, not just the shell.
        child = spawn(shell, ['-l'], {
          cwd,
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
        });
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'could not start a shell' };
      }
      const ptyId = `shell-${++seq}`;
      const entry: Live = { child, onData: null, onExit: null, pending: [], exited: null };
      live.set(ptyId, entry);
      const feed = (chunk: Buffer): void => {
        const bytes = new Uint8Array(chunk);
        if (entry.onData) entry.onData(bytes);
        else entry.pending.push(bytes);
      };
      child.stdout.on('data', feed);
      child.stderr.on('data', feed);
      child.on('error', () => settle(1));
      child.on('close', (code) => settle(code ?? 1));
      function settle(code: number): void {
        if (entry.exited !== null) return;
        entry.exited = code;
        entry.onExit?.(code);
      }
      // The runner types the command with a trailing carriage return; a piped shell wants a newline.
      child.stdin.on('error', () => undefined);
      child.stdin.write(initialInput.replace(/\r/g, '\n'));
      return { ok: true, ptyId };
    },
    killPty(ptyId) {
      const entry = live.get(ptyId);
      if (entry) kill(entry.child);
    },
    killAll() {
      for (const entry of live.values()) if (entry.exited === null) kill(entry.child);
    },
    onPty(ptyId, onData, onExit) {
      const entry = live.get(ptyId);
      if (!entry) return;
      entry.onData = onData;
      entry.onExit = onExit;
      for (const bytes of entry.pending.splice(0)) onData(bytes);
      if (entry.exited !== null) onExit(entry.exited);
    },
    offPty(ptyId) {
      const entry = live.get(ptyId);
      if (!entry) return;
      entry.onData = null;
      entry.onExit = null;
      if (entry.exited !== null) live.delete(ptyId);
    },
  };
}
