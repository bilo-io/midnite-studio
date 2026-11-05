/**
 * Which processes count as "the running app" for `install-local`.
 *
 * The app's main process is the bundle's executable with no script argument.
 * The detached pty broker runs the *same* executable (as node, with
 * `.../broker.js`) and deliberately outlives the app, so it never counts: it is
 * not what a bundle swap crashes, and quitting it would kill the user's terminals.
 */

/**
 * @param {string} psOutput  `ps -axo pid=,command=` output
 * @param {string} executable absolute path of the bundle's main executable
 * @returns {number[]} pids of the app's main process(es)
 */
export function findAppMainPids(psOutput, executable) {
  const pids = [];
  for (const line of psOutput.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const command = m[2].trimEnd();
    if (command === executable) pids.push(Number(m[1]));
  }
  return pids;
}
