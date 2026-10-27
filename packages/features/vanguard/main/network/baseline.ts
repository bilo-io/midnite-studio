import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The per-repo record of where agent sessions have connected (Phase 120 Theme E): `host:port` to the
 * first and last time one was seen. A destination not seen in the last 30 days is new again. Pure
 * functions over a plain object, plus a file store at `<userData>/vanguard/network-baseline.json` (the
 * directory 0700, the file 0600, written through a rename like the integrity baselines).
 */

export const BASELINE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Per repo; the oldest go first. A repo that talks to thousands of hosts is not a baseline. */
export const BASELINE_MAX_PER_REPO = 2000;

export interface NetworkBaseline {
  version: 1;
  repos: Record<string, Record<string, { firstSeen: number; lastSeen: number }>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A parsed file as a baseline: anything malformed is dropped entry by entry, never trusted. */
export function coerceBaseline(raw: unknown): NetworkBaseline {
  const out = emptyBaseline();
  if (!isRecord(raw) || raw['version'] !== 1 || !isRecord(raw['repos'])) return out;
  for (const [repoId, repo] of Object.entries(raw['repos'])) {
    if (!isRecord(repo)) continue;
    const entries: NetworkBaseline['repos'][string] = {};
    for (const [key, entry] of Object.entries(repo)) {
      if (isRecord(entry) && typeof entry['firstSeen'] === 'number' && typeof entry['lastSeen'] === 'number') {
        entries[key] = { firstSeen: entry['firstSeen'], lastSeen: entry['lastSeen'] };
      }
    }
    out.repos[repoId] = entries;
  }
  return out;
}

export const emptyBaseline = (): NetworkBaseline => ({ version: 1, repos: {} });

/**
 * Note a connection to `key` from `repoId` at `now`. Returns `'new'` when the repo had not seen it in the
 * window (the entry is (re)started), `'known'` otherwise (its `lastSeen` moves forward).
 */
export function observeDestination(
  baseline: NetworkBaseline,
  repoId: string,
  key: string,
  now: number,
): 'new' | 'known' {
  const repo = (baseline.repos[repoId] ??= {});
  const entry = repo[key];
  if (entry !== undefined && now - entry.lastSeen <= BASELINE_WINDOW_MS) {
    entry.lastSeen = now;
    return 'known';
  }
  repo[key] = { firstSeen: now, lastSeen: now };
  const keys = Object.keys(repo);
  if (keys.length > BASELINE_MAX_PER_REPO) {
    keys.sort((a, b) => repo[a]!.lastSeen - repo[b]!.lastSeen);
    for (const stale of keys.slice(0, keys.length - BASELINE_MAX_PER_REPO)) delete repo[stale];
  }
  return 'new';
}

/** Drop every entry past the window, and every repo left empty. */
export function pruneBaseline(baseline: NetworkBaseline, now: number): void {
  for (const [repoId, repo] of Object.entries(baseline.repos)) {
    for (const [key, entry] of Object.entries(repo)) {
      if (now - entry.lastSeen > BASELINE_WINDOW_MS) delete repo[key];
    }
    if (Object.keys(repo).length === 0) delete baseline.repos[repoId];
  }
}

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export const networkBaselinePath = (userData: string): string => join(userData, 'vanguard', 'network-baseline.json');

/** The stored baseline, or an empty one when there is none or it does not parse. */
export async function loadNetworkBaseline(userData: string): Promise<NetworkBaseline> {
  try {
    return coerceBaseline(JSON.parse(await readFile(networkBaselinePath(userData), 'utf8')));
  } catch {
    return emptyBaseline();
  }
}

export async function saveNetworkBaseline(userData: string, baseline: NetworkBaseline): Promise<void> {
  const target = networkBaselinePath(userData);
  const dir = join(userData, 'vanguard');
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(baseline)}\n`, { mode: FILE_MODE });
  await chmod(temp, FILE_MODE);
  await rename(temp, target);
}
