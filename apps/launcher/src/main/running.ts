import { execFile } from 'node:child_process';

/** Runs `lsappinfo` with these arguments and resolves its stdout, or `null` when it could not run. */
export type LsappinfoRunner = (args: readonly string[]) => Promise<string | null>;

const runLsappinfo: LsappinfoRunner = (args) =>
  new Promise((resolve) => {
    execFile('/usr/bin/lsappinfo', [...args], (error, stdout) => resolve(error === null ? stdout : null));
  });

/**
 * Whether the app with this bundle id is running, asked of LaunchServices rather than matched by process name.
 *
 * A name is not enough. Studio's pty broker is `broker.js` run by Studio's own binary under
 * `ELECTRON_RUN_AS_NODE`, so its process is also called `Midnite Studio` — and it is detached on purpose,
 * so terminals outlive a quit. `pgrep` therefore called a quit Studio running and refused to install it.
 * The broker never registers with LaunchServices; only the app a user can see in the Dock does, and
 * `lsappinfo find` prints its ASN (`ASN:0x0-0xd00d-"Midnite_Studio":`) — or nothing, exit 0, when none is.
 *
 * Replacing a bundle under a live broker is already safe: its socket is keyed by build and it retires
 * itself once its own script changes on disk (`runtime/src/broker/`).
 */
export async function isAppRunning(bundleId: string, run: LsappinfoRunner = runLsappinfo): Promise<boolean> {
  const stdout = await run(['find', `bundleid=${bundleId}`]);
  return stdout !== null && /\bASN:/.test(stdout);
}
