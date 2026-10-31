import { execFile } from 'node:child_process';

/**
 * How the launcher opens an installed host bundle (the retired-link follow-up).
 *
 * With nothing to land on the bundle goes to the OS as before (`shell.openPath`, i.e. `open <app>`). With a
 * landing — a `--midnite-link=<url>` switch — it is `open -n <app> --args <switch>`: `--args` is how macOS
 * hands a launched app its command line, and `-n` makes that true even when the app is already running,
 * because a running app is otherwise only activated and its arguments dropped. The extra instance meets the
 * host's single-instance lock, quits at once, and the running host receives the switch as `second-instance`
 * argv. Every host takes that lock, so `-n` never produces a second window.
 *
 * Pure of Electron and of the shell: `execFile` takes an argument vector, so a link's value is never parsed
 * by a shell, and the switch is the launcher's own rebuild of the link, not the string it was sent.
 */
export type OpenCommand = { command: 'open'; args: string[] };

/** `null` when there is nothing to hand the bundle (open it plainly) or `path` is not an absolute path. */
export function bundleOpenCommand(path: string, linkArg: string | undefined): OpenCommand | null {
  if (linkArg === undefined || !path.startsWith('/')) return null;
  return { command: 'open', args: ['-n', path, '--args', linkArg] };
}

/** Runs an {@link OpenCommand}; rejects when `open` fails, so the router can fall back to the sheet. */
export function runOpenCommand(cmd: OpenCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd.command, cmd.args, (error) => (error === null ? resolve() : reject(error)));
  });
}
