import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  isPidAlive as defaultIsPidAlive,
  staleBrokerFiles,
  staleBrokerLogs,
  type BrokerDirEntry,
} from './stale-files';

/**
 * The broker directory's on-demand sweep (Phase 148 Theme E): the same rules the host runs at boot
 * (`staleBrokerFiles`), plus the logs of versions with no live broker, offered as a plan the user
 * confirms and then carried out. Plain Node, no Electron, so it runs under bare vitest on a temp dir.
 *
 * The sweep never trusts the plan it was handed: it recomputes the rules fresh and unlinks only the
 * names that are in BOTH, so a broker that came up between the confirm and the click keeps its files.
 * It only ever touches a bare file name inside `brokerDir` — never a path from the caller.
 */

export type BrokerSweepEntry = { name: string; kind: 'pid' | 'token' | 'log'; bytes: number };

export type BrokerSweepPlan = { entries: BrokerSweepEntry[]; totalBytes: number };

export type BrokerSweepOutcome = {
  removed: number;
  freedBytes: number;
  skipped: { name: string; reason: string }[];
};

export type BrokerSweepOptions = {
  brokerDir: string;
  /** This build's socket file name, e.g. `0.3.1-ab12cd34.sock`; its files are the spawn path's. */
  ownSocketName: string;
  /** This build's version, whose log is open. */
  ownVersion: string;
  isPidAlive?: (pid: number) => boolean;
  now?: () => number;
};

const kindOf = (name: string): BrokerSweepEntry['kind'] =>
  name.endsWith('.sock.pid') ? 'pid' : name.endsWith('.sock.token') ? 'token' : 'log';

const RELEVANT = /\.sock$|\.sock\.pid$|\.sock\.token$|\.log(\.\d+)?$/;

function listEntries(brokerDir: string): BrokerDirEntry[] {
  let names: string[];
  try {
    names = readdirSync(brokerDir);
  } catch {
    return [];
  }
  const entries: BrokerDirEntry[] = [];
  for (const name of names) {
    if (!RELEVANT.test(name)) continue;
    try {
      const path = join(brokerDir, name);
      const stat = statSync(path);
      if (!stat.isFile() && !name.endsWith('.sock')) continue;
      const pid = name.endsWith('.sock.pid') ? Number.parseInt(readFileSync(path, 'utf8').trim(), 10) : NaN;
      entries.push({ name, mtimeMs: stat.mtimeMs, pid: Number.isInteger(pid) ? pid : null });
    } catch {
      // Gone between the listing and the stat.
    }
  }
  return entries;
}

function stale(options: BrokerSweepOptions, entries: BrokerDirEntry[]): string[] {
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
  const now = (options.now ?? Date.now)();
  return [
    ...staleBrokerFiles(entries, { ownSocketName: options.ownSocketName, isPidAlive, now }),
    ...staleBrokerLogs(entries, { ownVersion: options.ownVersion, isPidAlive, now }),
  ];
}

/** What a sweep would delete right now, with sizes. Deletes nothing. */
export function planBrokerSweep(options: BrokerSweepOptions): BrokerSweepPlan {
  const names = stale(options, listEntries(options.brokerDir));
  const entries: BrokerSweepEntry[] = [];
  for (const name of names) {
    try {
      entries.push({ name, kind: kindOf(name), bytes: statSync(join(options.brokerDir, name)).size });
    } catch {
      // Gone already.
    }
  }
  return { entries, totalBytes: entries.reduce((sum, e) => sum + e.bytes, 0) };
}

/** Unlink the confirmed names that are still stale. Reports the bytes actually freed. */
export function sweepBrokerDir(options: BrokerSweepOptions, confirmed: readonly string[]): BrokerSweepOutcome {
  const fresh = new Set(stale(options, listEntries(options.brokerDir)));
  const outcome: BrokerSweepOutcome = { removed: 0, freedBytes: 0, skipped: [] };
  for (const name of new Set(confirmed)) {
    if (!fresh.has(name)) {
      outcome.skipped.push({ name, reason: 'no longer stale' });
      continue;
    }
    const path = join(options.brokerDir, name);
    try {
      const bytes = statSync(path).size;
      unlinkSync(path);
      outcome.removed++;
      outcome.freedBytes += bytes;
    } catch {
      outcome.skipped.push({ name, reason: 'already gone' });
    }
  }
  return outcome;
}
