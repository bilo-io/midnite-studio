import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * When the browser first reached each host (Phase 117 Theme F) — the "first seen today, no history"
 * rule's only memory.
 *
 * **No readable history on disk.** The ledger keys each host by a truncated SHA-256 (64 bits), so
 * `<userData>/browser-hosts-seen.json` (0600, atomic temp+rename) is a set of opaque digests and
 * days, not a list of sites. That is obfuscation, not secrecy — someone holding the file can still
 * test a guessed host against it — which is why "Clear browsing data" deletes it outright.
 *
 * Bounded at {@link HOSTS_SEEN_CAP} entries (oldest first-seen evicted), and written at most once per
 * {@link HOSTS_SEEN_WRITE_DELAY_MS}, since a burst of new hosts should not be a burst of writes.
 */

export const HOSTS_SEEN_FILE = 'browser-hosts-seen.json';
export const HOSTS_SEEN_CAP = 20_000;
export const HOSTS_SEEN_WRITE_DELAY_MS = 2_000;

type Persisted = { version: 1; hosts: Record<string, number> };

export type HostFirstSeenStore = {
  /** Records a committed host (first visit only) and returns when it was first seen, in ms. */
  note(host: string): number;
  /** When the host was first seen, or `undefined` if never. */
  firstSeen(host: string): number | undefined;
  /** "Clear browsing data": forget every host, on disk too. */
  clear(): void;
  /** Writes any pending change now (quit, tests). */
  flush(): void;
};

export function hostDigest(host: string): string {
  const normalised = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

export function createHostFirstSeenStore(options: { directory?: string; now?: () => number } = {}): HostFirstSeenStore {
  const filePath = options.directory ? join(options.directory, HOSTS_SEEN_FILE) : null;
  const now = options.now ?? Date.now;
  let hosts: Map<string, number> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const load = (): Map<string, number> => {
    if (hosts) return hosts;
    hosts = new Map();
    if (!filePath) return hosts;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Persisted;
      if (parsed && typeof parsed.hosts === 'object' && parsed.hosts !== null) {
        const rows = Object.entries(parsed.hosts).filter(([, at]) => typeof at === 'number' && Number.isFinite(at));
        rows.sort((a, b) => a[1] - b[1]);
        for (const [digest, at] of rows) hosts.set(digest, at);
      }
    } catch {
      // Missing or corrupt: start empty — the worst case is a host reading as new once more.
    }
    return hosts;
  };

  const write = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!filePath || !hosts) return;
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      const data: Persisted = { version: 1, hosts: Object.fromEntries(hosts) };
      writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
      renameSync(tmp, filePath);
    } catch {
      // A failed write never breaks browsing; the next new host retries.
    }
  };

  const schedule = (): void => {
    if (!filePath || timer) return;
    timer = setTimeout(write, HOSTS_SEEN_WRITE_DELAY_MS);
    (timer as { unref?: () => void }).unref?.();
  };

  return {
    note(host) {
      const map = load();
      const digest = hostDigest(host);
      const seen = map.get(digest);
      if (seen !== undefined) return seen;
      const at = now();
      map.set(digest, at);
      // Map keeps insertion order and new entries are the newest, so the first key is the oldest.
      while (map.size > HOSTS_SEEN_CAP) map.delete(map.keys().next().value as string);
      schedule();
      return at;
    },
    firstSeen: (host) => load().get(hostDigest(host)),
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      hosts = new Map();
      if (!filePath) return;
      try {
        unlinkSync(filePath);
      } catch {
        // Already gone.
      }
    },
    flush: write,
  };
}

/** Whether two instants fall on the same local calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
