/**
 * Broker-dir housekeeping: which `*.sock.pid` / `*.sock.token` files belong to no broker any more.
 *
 * Every broker leaves a `<socket>.pid` and (since Phase 115 Theme E) a `<socket>.token` beside its
 * socket. A clean exit removes all three, but a crashed, killed or force-quit broker leaves them, and
 * the legacy probe only ever unlinked the dead `.sock` and its token — never the pid file. A machine
 * that had been rebuilding for two months held ~130 of them, every one naming a dead pid.
 *
 * Pure, so the rules are testable without a directory: the caller lists the files, says which pids are
 * alive and how old each file is, and deletes what comes back.
 */

export type BrokerDirEntry = {
  name: string;
  /** Last-modified time, ms since epoch. */
  mtimeMs: number;
  /** The pid inside a `.pid` file, when it parses; `null` for every other entry. */
  pid: number | null;
};

/** A file younger than this may belong to a broker that is still starting (token written, not yet bound). */
export const STALE_FILE_MIN_AGE_MS = 60_000;

const RETIRED_PID = /-retired-(\d+)\.sock$/;

/**
 * The entries to delete. Run AFTER the legacy probe, which has already unlinked every `.sock` that did
 * not answer — so a `.sock` still on disk is a live broker's (or one a guest left alone), and its
 * companions stay. A `.pid`/`.token` without its `.sock` goes, unless the pid it names (from the pid
 * file or a `-retired-<pid>` name) is still alive, or the file is too young to judge.
 */
export function staleBrokerFiles(
  entries: readonly BrokerDirEntry[],
  options: { ownSocketName: string; isPidAlive: (pid: number) => boolean; now: number },
): string[] {
  const names = new Set(entries.map((e) => e.name));
  const pidFiles = new Map(entries.filter((e) => e.name.endsWith('.sock.pid')).map((e) => [e.name, e.pid]));
  const stale: string[] = [];

  for (const entry of entries) {
    const suffix = entry.name.endsWith('.sock.pid') ? '.pid' : entry.name.endsWith('.sock.token') ? '.token' : null;
    if (suffix === null) continue;
    const socketName = entry.name.slice(0, -suffix.length);
    // Our own socket's files are the spawn path's to manage — it writes the token just before spawning.
    if (socketName === options.ownSocketName) continue;
    if (names.has(socketName)) continue;
    if (options.now - entry.mtimeMs < STALE_FILE_MIN_AGE_MS) continue;

    const retired = RETIRED_PID.exec(socketName);
    const pid = pidFiles.get(`${socketName}.pid`) ?? (retired ? Number(retired[1]) : null);
    if (pid !== null && options.isPidAlive(pid)) continue;
    stale.push(entry.name);
  }
  return stale;
}

/** `kill(pid, 0)`: alive unless the kernel says no such process. EPERM is a live process we may not signal. */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** `<version>[-dev].log` and its rotated generations `.log.1`, `.log.2`. */
const BROKER_LOG = /^(\d[^/]*?)(-dev)?\.log(?:\.\d+)?$/;

/**
 * The broker logs to delete: those of a version that has no live broker (and is not this build's own
 * version, whose log the spawn path is about to open or has open). A version is live while any `.sock`
 * named `<version>-…` is on disk, or any `<version>-….sock.pid` names a live pid. Young files stay, as
 * for the pid and token files.
 */
export function staleBrokerLogs(
  entries: readonly BrokerDirEntry[],
  options: { ownVersion: string; isPidAlive: (pid: number) => boolean; now: number },
): string[] {
  const liveSockets = entries.filter(
    (e) =>
      e.name.endsWith('.sock') || (e.name.endsWith('.sock.pid') && e.pid !== null && options.isPidAlive(e.pid)),
  );
  const isLive = (version: string): boolean => liveSockets.some((e) => e.name.startsWith(`${version}-`));

  const stale: string[] = [];
  for (const entry of entries) {
    const match = BROKER_LOG.exec(entry.name);
    if (!match) continue;
    const version = match[1] as string;
    if (version === options.ownVersion) continue;
    if (options.now - entry.mtimeMs < STALE_FILE_MIN_AGE_MS) continue;
    if (isLive(version)) continue;
    stale.push(entry.name);
  }
  return stale;
}
