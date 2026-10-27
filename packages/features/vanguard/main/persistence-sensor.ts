import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { EvidenceItem, NewSecurityFinding, RemediationAction } from '@midnite/studio-shared';

import { inspectExecutable, type SignatureState } from './code-signing';
import {
  classifyPersistence,
  cronEntry,
  describePersistenceKind,
  diffPersistence,
  itemName,
  launchTarget,
  parseLaunchPlistJson,
  persistenceLocations,
  sha256,
  toBaseline,
  type PersistenceEntry,
} from './persistence-parse';
import { sha256NoFollow } from './response/target';
import type { SensorContext, SensorDefinition } from './sensor-host';

/**
 * Persistence sensor (Phase 120 Theme D): LaunchAgents/Daemons, login items, cron, shell rc files,
 * `~/.ssh` and `/etc/periodic`, baselined and watched. The first scan records a baseline silently (a
 * finding for everything already on the machine would be noise); after that a new or changed item is a
 * `persistence` finding, `high` by default and `critical` when what it launches is unsigned, quarantined
 * or hidden.
 */

/** The one entry login items are folded into (see `snapshotPersistence`). */
const BTM_KEY = 'login-item:btm';

/** The filesystem seam, so the sensor runs under bare vitest against fixtures. */
export interface PersistenceFs {
  readdir(dir: string): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array | null>;
  readJson(path: string): Promise<Record<string, string> | null>;
  writeJson(path: string, value: Record<string, string>): Promise<void>;
  watch(path: string, onChange: (filename: string | null) => void): () => void;
}

export const nodePersistenceFs: PersistenceFs = {
  readdir: (dir) => readdir(dir).catch(() => []),
  readFile: (path) => readFile(path).catch(() => null),
  async readJson(path) {
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
      return typeof raw === 'object' && raw !== null ? (raw as Record<string, string>) : null;
    } catch {
      return null;
    }
  },
  async writeJson(path, value) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await rename(tmp, path);
  },
  watch(path, onChange) {
    let watcher: FSWatcher | undefined;
    try {
      watcher = fsWatch(path, { persistent: false }, (_event, filename) =>
        onChange(filename === null ? null : String(filename)),
      );
      watcher.on('error', () => undefined);
    } catch {
      // A location that does not exist is simply not watched; the cadence scan still covers it.
    }
    return () => watcher?.close();
  },
};

export interface PersistenceSensorOptions {
  fs?: PersistenceFs;
  /** The uid launchd domains are addressed with (`gui/<uid>`). */
  uid?: number;
  /** Debounce for watcher-triggered scans. */
  debounceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const PERSISTENCE_SENSOR_ID = 'persistence';
const BASELINE_FILE = 'baselines/persistence.json';

/** Snapshots every watched item: a hash per file, and one for the crontab. */
export async function snapshotPersistence(
  ctx: Pick<SensorContext, 'runProcess' | 'signal'>,
  home: string,
  fs: PersistenceFs,
): Promise<PersistenceEntry[]> {
  const entries: PersistenceEntry[] = [];
  for (const loc of persistenceLocations(home)) {
    if (loc.type === 'file') {
      const data = await fs.readFile(loc.path);
      if (data !== null)
        entries.push({
          key: `${loc.kind}:${loc.path}`,
          kind: loc.kind,
          path: loc.path,
          hash: sha256(data),
        });
      continue;
    }
    for (const name of await fs.readdir(loc.path)) {
      if (loc.suffix !== undefined && !name.endsWith(loc.suffix)) continue;
      const path = join(loc.path, name);
      const data = await fs.readFile(path);
      if (data !== null)
        entries.push({ key: `${loc.kind}:${path}`, kind: loc.kind, path, hash: sha256(data) });
    }
  }
  const cron = await ctx.runProcess('crontab', ['-l'], { timeoutMs: 5_000, signal: ctx.signal });
  entries.push(cronEntry(cron.ok && cron.exitCode === 0 ? cron.stdout : ''));
  // Login items: `sfltool dumpbtm` needs root on current macOS and asks for an administrator password on
  // every call, and the AppleScript route raises a "control System Events" consent prompt — so it runs only
  // when the user has opted in (Settings ▸ Vanguard ▸ Scanning).
  if (!ctx.settings().scanLoginItems) return entries;
  const btm = await ctx.runProcess('sfltool', ['dumpbtm'], {
    timeoutMs: 8_000,
    signal: ctx.signal,
  });
  if (btm.ok && btm.exitCode === 0 && btm.stdout.trim().length > 0)
    entries.push({
      key: BTM_KEY,
      kind: 'login-item',
      path: 'sfltool dumpbtm',
      // Only the lines that name an item: the dump also carries timestamps, UUIDs and counters that
      // change on every read and would raise a finding each pass.
      hash: sha256(
        btm.stdout
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => /^(?:name|url|executable path|developer name):/i.test(l))
          .sort()
          .join('\n'),
      ),
    });
  return entries;
}

async function findingFor(
  ctx: SensorContext,
  entry: PersistenceEntry,
  change: 'new' | 'changed',
  home: string,
  uid: number,
): Promise<Omit<NewSecurityFinding, 'source'>> {
  const evidence: EvidenceItem[] = [{ kind: 'path', path: entry.path, hash: entry.hash }];
  const remediation: RemediationAction[] = [];
  let target: string | undefined;
  let signature: SignatureState | undefined;
  let detail = `${describePersistenceKind(entry.kind)} ${itemName(entry)} is ${change === 'new' ? 'new' : 'changed'} since Vanguard last looked.`;

  if (entry.kind === 'launch-agent' || entry.kind === 'launch-daemon') {
    const converted = await ctx.runProcess('plutil', ['-convert', 'json', '-o', '-', entry.path], {
      timeoutMs: 5_000,
      signal: ctx.signal,
    });
    const item = converted.ok ? parseLaunchPlistJson(converted.stdout) : null;
    if (item !== null) {
      target = launchTarget(item);
      const [command, ...rest] = item.programArguments.length
        ? item.programArguments
        : target !== undefined
          ? [target]
          : [];
      if (command !== undefined) evidence.push({ kind: 'command', command, args: rest });
      if (target !== undefined && target.startsWith('/')) {
        signature = await inspectExecutable(ctx.runProcess, target, ctx.signal);
        const hash = await sha256NoFollow(target);
        evidence.push({ kind: 'path', path: target, ...(hash ? { hash } : {}) });
        remediation.push({ id: 'quarantine-file', path: target });
      }
      if (item.label !== undefined) detail += ` Label ${item.label}.`;
    } else detail += ' Its property list could not be read.';
    remediation.unshift({
      id: 'bootout-launch-item',
      domain:
        entry.kind === 'launch-daemon' || entry.path.startsWith('/Library/')
          ? 'system'
          : `gui/${uid}`,
      path: entry.path,
    });
  }

  const { severity, reasons } = classifyPersistence({
    kind: entry.kind,
    ...(target !== undefined ? { target } : {}),
    ...(signature !== undefined ? { signature } : {}),
    home,
  });
  if (reasons.length > 0)
    detail += ` ${reasons.map((r) => r[0]!.toUpperCase() + r.slice(1)).join('; ')}.`;
  remediation.push({ id: 'mute' });
  return {
    fingerprint: `persistence:${entry.key}:${entry.hash}`,
    severity,
    category: 'persistence',
    title: `${change === 'new' ? 'New' : 'Changed'} ${describePersistenceKind(entry.kind)}: ${itemName(entry)}`,
    detail,
    evidence,
    remediation,
  };
}

export function createPersistenceSensor(options: PersistenceSensorOptions = {}): SensorDefinition {
  const fs = options.fs ?? nodePersistenceFs;
  const debounceMs = options.debounceMs ?? 2_000;
  const setT = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const uid = options.uid ?? process.getuid?.() ?? 501;
  // One scan at a time: a watcher event during a cadence scan queues behind it.
  let chain: Promise<unknown> = Promise.resolve();

  async function scan(ctx: SensorContext): Promise<number> {
    const home = ctx.homeDir;
    if (home === undefined) return 0;
    const file = join(ctx.userData, 'vanguard', BASELINE_FILE);
    const current = await snapshotPersistence(ctx, home, fs);
    const baseline = await fs.readJson(file);
    if (baseline === null) {
      await fs.writeJson(file, toBaseline(current));
      return 0;
    }
    const diff = diffPersistence(baseline, current);
    // Login items are one aggregate entry that exists only while opted in, so its first appearance is the
    // switch being turned on, not a new item; only a change to it is news.
    const added = diff.added.filter((e) => e.key !== BTM_KEY);
    let n = 0;
    for (const [change, list] of [
      ['new', added],
      ['changed', diff.changed],
    ] as const)
      for (const entry of list) {
        await ctx.record(await findingFor(ctx, entry, change, home, uid));
        n += 1;
      }
    // Accept the current state as the baseline: a finding is raised once, and the ledger holds it.
    if (diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0)
      await fs.writeJson(file, toBaseline(current));
    return n;
  }

  const queued = (ctx: SensorContext): Promise<number> => {
    const next = chain.then(() => scan(ctx));
    chain = next.catch(() => undefined);
    return next;
  };

  return {
    id: PERSISTENCE_SENSOR_ID,
    label: 'Persistence',
    description:
      'LaunchAgents and Daemons, login items, crontab, shell startup files, ~/.ssh and /etc/periodic, watched for new or changed items.',
    schedule: { kind: 'cadence' },
    start(ctx) {
      const home = ctx.homeDir;
      if (home === undefined) return;
      let timer: unknown = null;
      const trigger = (): void => {
        if (timer !== null) clearT(timer);
        timer = setT(() => {
          timer = null;
          queued(ctx).catch((e: unknown) =>
            ctx.log('warn', `watch scan failed: ${e instanceof Error ? e.message : String(e)}`),
          );
        }, debounceMs);
      };
      // Watch each directory once. A file is watched through its parent (which survives an editor's
      // rename-and-replace) and only its own name triggers a scan, so ~ itself is not a firehose.
      const dirs = new Map<string, Set<string> | null>();
      for (const loc of persistenceLocations(home)) {
        if (loc.type === 'dir') dirs.set(loc.path, null);
        else {
          const dir = dirname(loc.path);
          const names = dirs.get(dir);
          if (names === null) continue;
          dirs.set(dir, (names ?? new Set<string>()).add(basename(loc.path)));
        }
      }
      const stops = [...dirs].map(([dir, names]) =>
        fs.watch(dir, (filename) => {
          if (names === null || filename === null || names.has(filename)) trigger();
        }),
      );
      return () => {
        if (timer !== null) clearT(timer);
        for (const stop of stops) stop();
      };
    },
    async run(ctx) {
      return { findings: await queued(ctx) };
    },
  };
}
