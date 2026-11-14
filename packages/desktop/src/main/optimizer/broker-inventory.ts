import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { ProcessLostReason } from '@midnite/studio-shared';
import { isPidAlive } from '@midnite/studio-runtime/broker/stale-files';

import type { ProcessRow } from '../agent-process';

/**
 * The lost-process inventory (Phase 148 Theme B): which terminal brokers on this machine are this
 * app's, which one is current, and which are *lost*.
 *
 * A broker is spawned detached, so once its app quits or rebuilds it runs with ppid 1 and nothing in
 * the old ownership rule (main pid, live pty roots, their descendants) reaches it. On 2026-11-14 two
 * such brokers from an old build held ~12 GB across six agent sessions, listed nowhere and unkillable
 * from the Optimizer. This file names them so the kill guard can accept them and the Memory tab can
 * show them — and names the current primary so neither ever touches it.
 *
 * **Identity is the broker dir, not the bundle path.** A broker is this app's when its argv runs a
 * `broker.js` with `--socket <brokerDir>/…`, and `brokerDir` is `<userData>/broker`, which no other app
 * shares. The bundle path is not part of the rule on purpose: a reinstall, a dev build from a different
 * worktree and a packaged build all move it, and every one of those leaves brokers behind in the same
 * dir. A pid named by a `*.sock.pid` file whose argv does not carry that dir is someone else's process
 * on a recycled pid, and is ignored.
 *
 * **Reasons.** `unreachable` wins over `previous-build`: a broker nothing reaches cannot have its
 * sessions re-adopted, so the action it needs is different, and that is what the badge has to say.
 * A retired broker of the *current* build that the client still reaches is not lost — it is serving
 * out its sessions — but it is still not the primary, so it is listed (and killable) with `lost: null`.
 */

export type BrokerLostReason = Exclude<ProcessLostReason, 'no-row'>;

/** One `<socket>.pid` file in the broker dir: the socket it names and the pid inside it. */
export type BrokerPidFile = { socketName: string; pid: number };

/** A pty a connected broker reports (`liveBrokerSessions()`), as much as the inventory reads. */
export type BrokerSessionRef = { pid: number; sessionId: string; owner: string | null; cwd: string };

export type InventoryBroker = {
  pid: number;
  /** The socket this broker is listed under: its pid file's, else its argv's `--socket` basename. */
  socketName: string;
  argv: string;
  /** The current build's broker — the one new ptys go to. Never lost, never killable. */
  primary: boolean;
  lost: BrokerLostReason | null;
};

export type BrokerInventory = {
  brokers: InventoryBroker[];
  /** The primary broker's pid, when one is running; refused by every kill. */
  primaryPid: number | null;
  /** Pty roots under a reachable broker whose session no `terminals.json` row names. */
  noRowPtys: { pid: number; brokerPid: number }[];
  /** Pty roots of sessions another app owns (`owner` set and not `studio`) — never killed from here. */
  foreignSessionPids: number[];
};

export const EMPTY_INVENTORY: BrokerInventory = {
  brokers: [],
  primaryPid: null,
  noRowPtys: [],
  foreignSessionPids: [],
};

export type ClassifyBrokersInput = {
  /** `<userData>/broker`, absolute. */
  brokerDir: string;
  /** The current primary's socket path (`<brokerDir>/<version>-<build>[-dev].sock`). */
  primarySocket: string;
  pidFiles: readonly BrokerPidFile[];
  /** Names of the `.sock` files present in the broker dir. */
  socketNames: ReadonlySet<string>;
  /** A fresh `ps` snapshot. A pid absent from it is dead, whatever its pid file says. */
  rows: readonly ProcessRow[];
  /** Socket paths the broker client is connected to right now. */
  connectedPeers: readonly string[];
  /** Ids of every `terminals.json` row; `null` when they could not be read, which skips `no-row`. */
  sessionRows: ReadonlySet<string> | null;
  brokerSessions: readonly BrokerSessionRef[];
};

const BROKER_ARGV = /[/\\]broker\.js --socket (.+?\.sock)(?: |$)/;
const RETIRED_SUFFIX = /-retired-(\d+)\.sock$/;

/** The `--socket` path a broker's argv names, or `null` when the argv is not a broker's. */
export function brokerArgvSocket(args: string): string | null {
  return BROKER_ARGV.exec(args)?.[1] ?? null;
}

/** `1.2.3-abcd1234-dev-retired-42.sock` → `1.2.3-abcd1234-dev.sock`: the build a socket belongs to. */
function buildSocketName(socketName: string): string {
  return socketName.replace(RETIRED_SUFFIX, '.sock');
}

const isStudioOwned = (owner: string | null): boolean => !owner || owner === 'studio';

export function classifyBrokers(input: ClassifyBrokersInput): BrokerInventory {
  const { brokerDir, primarySocket, rows } = input;
  const primarySocketName = basename(primarySocket);
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const connected = new Set(input.connectedPeers);

  /** Our broker dir in the argv, or nothing: a pid file can name a recycled pid. */
  const ourArgvSocket = (row: ProcessRow): string | null => {
    const socket = brokerArgvSocket(row.args);
    return socket !== null && dirname(socket) === brokerDir ? socket : null;
  };

  const candidates = new Map<number, { socketName: string; argvSocket: string; row: ProcessRow }>();
  for (const file of input.pidFiles) {
    const row = byPid.get(file.pid);
    if (!row) continue;
    const argvSocket = ourArgvSocket(row);
    if (argvSocket === null) continue;
    // Two pid files naming one pid (a retire that left the old one behind): the retired name is current.
    const existing = candidates.get(file.pid);
    if (existing && !RETIRED_SUFFIX.test(file.socketName)) continue;
    candidates.set(file.pid, { socketName: file.socketName, argvSocket, row });
  }
  // A broker whose pid file is gone is still a broker: its argv says so.
  for (const row of rows) {
    if (candidates.has(row.pid)) continue;
    const argvSocket = ourArgvSocket(row);
    if (argvSocket !== null) candidates.set(row.pid, { socketName: basename(argvSocket), argvSocket, row });
  }

  const brokers: InventoryBroker[] = [];
  for (const [pid, { socketName, argvSocket, row }] of candidates) {
    // Protection-biased: the primary's pid file names it, and a broker started on the primary's path
    // counts as primary unless it has visibly retired off it (its own `-retired-<pid>` name).
    const retiredSelf = RETIRED_SUFFIX.exec(socketName)?.[1] === String(pid);
    const primary = socketName === primarySocketName || (argvSocket === primarySocket && !retiredSelf);
    let lost: BrokerLostReason | null = null;
    if (!primary) {
      const reachable = input.socketNames.has(socketName) && connected.has(join(brokerDir, socketName));
      if (!reachable) lost = 'unreachable';
      else if (buildSocketName(socketName) !== primarySocketName) lost = 'previous-build';
    }
    brokers.push({ pid, socketName, argv: row.args, primary, lost });
  }
  brokers.sort((a, b) => a.pid - b.pid);

  const brokerByPid = new Map(brokers.map((b) => [b.pid, b]));
  const noRowPtys: BrokerInventory['noRowPtys'] = [];
  const foreignSessionPids: number[] = [];
  for (const session of input.brokerSessions) {
    if (!isStudioOwned(session.owner)) {
      foreignSessionPids.push(session.pid);
      continue;
    }
    if (input.sessionRows === null || input.sessionRows.has(session.sessionId)) continue;
    const parent = byPid.get(session.pid)?.ppid;
    const broker = parent === undefined ? undefined : brokerByPid.get(parent);
    if (!broker || broker.lost === 'unreachable') continue;
    noRowPtys.push({ pid: session.pid, brokerPid: broker.pid });
  }

  return {
    brokers,
    primaryPid: brokers.find((b) => b.primary)?.pid ?? null,
    noRowPtys,
    foreignSessionPids,
  };
}

/** The broker dir's `*.sock.pid` files and `.sock` names; empty when the dir cannot be read. */
export function readBrokerDir(brokerDir: string): { pidFiles: BrokerPidFile[]; socketNames: Set<string> } {
  const pidFiles: BrokerPidFile[] = [];
  const socketNames = new Set<string>();
  let names: string[];
  try {
    names = readdirSync(brokerDir);
  } catch {
    return { pidFiles, socketNames };
  }
  for (const name of names) {
    if (name.endsWith('.sock')) {
      socketNames.add(name);
      continue;
    }
    if (!name.endsWith('.sock.pid')) continue;
    try {
      const pid = Number.parseInt(readFileSync(join(brokerDir, name), 'utf8').trim(), 10);
      if (isPidAlive(pid)) pidFiles.push({ socketName: name.slice(0, -'.pid'.length), pid });
    } catch {
      // A pid file removed between the listing and the read belongs to a broker that just exited.
    }
  }
  return { pidFiles, socketNames };
}
