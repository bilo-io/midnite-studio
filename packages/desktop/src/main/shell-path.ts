import { spawn } from 'node:child_process';

/**
 * A Finder/Dock-launched app inherits launchd's bare PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), not the user's shell PATH. For a git client
 * that breaks two things at once: the integrated terminal starts with a PATH
 * that has no Homebrew, no `~/.local/bin` and often no `git` the user would
 * recognise; and any git subprocess that shells out to a credential helper or a
 * signing binary can't find it.
 *
 * The symptom is maddening because it only happens when launched from Finder —
 * run the same build from a terminal and everything works, because the terminal
 * already exported the right PATH.
 *
 * The fix: ask the user's login shell for its PATH once at boot and fold it
 * into `process.env.PATH` before anything is spawned.
 *
 * Cribbed near-verbatim from ~/Dev/midnite/packages/desktop/src/main/shell-path.ts.
 */

/** Wrapped around `$PATH` so profile noise (motd, nvm banners) can't corrupt the parse. */
const MARKER_START = '__MSTUDIO_PATH_START__';
const MARKER_END = '__MSTUDIO_PATH_END__';

/**
 * How long to wait for the login shell before shipping without the fix. It no
 * longer bounds boot — nothing awaits the probe before the window opens — but it
 * still bounds the wait its consumers pay, so it stays tight. A *parameter* of
 * {@link resolveLoginShellPathAsync} rather than a hard constant, because the
 * integration spec runs the real shell on a machine that may be under heavy
 * parallel load (the whole moon graph at once), where a 5s ceiling is a coin
 * flip and a failure says nothing about the code.
 */
export const RESOLVE_TIMEOUT_MS = 5000;

/** Extract the PATH between the markers (last occurrence wins, in case a
 *  profile echoes the command line). Pure/exported for testing. */
export function parseShellPathOutput(output: string): string | null {
  const start = output.lastIndexOf(MARKER_START);
  if (start === -1) return null;
  const from = start + MARKER_START.length;
  const end = output.indexOf(MARKER_END, from);
  if (end === -1) return null;
  const path = output.slice(from, end).trim();
  return path.length > 0 ? path : null;
}

/** The login-shell PATH first (the user's real ordering), then any current
 *  entries it lacks — never drops a dir the process already had. Pure/exported
 *  for testing. */
export function mergePath(current: string | undefined, resolved: string): string {
  const seen = new Set(resolved.split(':'));
  const extras = (current ?? '').split(':').filter((dir) => dir.length > 0 && !seen.has(dir));
  return [resolved, ...extras].join(':');
}

/** The shell to ask, and the one-liner to ask it. Shared by nothing else —
 *  factored out only so the async resolver and its test read the same thing. */
function probeCommand(): { shell: string; args: string[] } {
  const shell =
    process.env['SHELL'] ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  // Braces around ${PATH} — a bare $PATH would swallow the end marker as part
  // of the variable name (`$PATH__MIDNITE...` is a valid, unset identifier).
  const probe = `printf '%s' "${MARKER_START}\${PATH}${MARKER_END}"`;
  // `-lic` — login AND interactive — because PATH additions commonly live in
  // interactive-only rc files (`~/.zshrc`: nvm, `~/.local/bin`, pyenv), which a
  // plain `-lc` login shell never sources; the markers keep interactive profile
  // noise (banners, prompts) out of the parse.
  return { shell, args: ['-lic', probe] };
}

/**
 * PATH as the user's shell sees it, or null when it can't be resolved (Windows
 * GUI apps already inherit the full user PATH; any shell error/timeout fails
 * soft).
 *
 * Async because this used to be the single most expensive thing in boot: a
 * `spawnSync` on the main thread, ahead of `app.whenReady()`, costing a median
 * 284 ms on this machine (Theme A's baseline) during which Electron could not
 * run a line of our JS. Spawned rather than awaited-in-place, the same probe
 * overlaps Chromium's own startup and costs the boot path only whatever is left
 * when its first consumer actually needs PATH.
 *
 * The timeout is enforced here rather than passed to `spawn` (which has no
 * `timeout` on all supported Node versions for the streaming case in the way
 * `spawnSync` does): a timer kills the child and resolves null, so a shell
 * profile that hangs bounds boot exactly as before.
 *
 * `timeoutMs` defaults to the boot-safe {@link RESOLVE_TIMEOUT_MS}; only the
 * integration spec overrides it, to buy headroom on a loaded machine.
 */
export function resolveLoginShellPathAsync(
  timeoutMs: number = RESOLVE_TIMEOUT_MS,
): Promise<string | null> {
  if (process.platform === 'win32') return Promise.resolve(null);
  const { shell, args } = probeCommand();

  return new Promise((resolveResult) => {
    let child;
    try {
      child = spawn(shell, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolveResult(null);
      return;
    }

    let out = '';
    // Settled once: the timeout, an error and a clean exit can all arrive, and
    // a Promise ignoring the later ones silently would hide which won.
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null);
    }, timeoutMs);
    // A pending timer must not be what keeps the app alive on quit.
    timer.unref?.();

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      out += chunk;
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 ? parseShellPathOutput(out) : null));
  });
}

/**
 * Fold the login-shell PATH into this process's env (inherited by every git
 * subprocess and every PTY the terminal spawns). No-op when resolution fails —
 * boot must never hang or die on a broken shell profile.
 *
 * Call this once, without awaiting, and await the returned promise at each
 * point that genuinely needs the merged PATH (`initPtyService`, the first git
 * exec). Awaiting it at the call site would reinstate exactly the serialisation
 * this replaced.
 */
export async function ensureLoginShellPathAsync(): Promise<void> {
  const resolved = await resolveLoginShellPathAsync();
  if (!resolved) return;
  process.env['PATH'] = mergePath(process.env['PATH'], resolved);
}
