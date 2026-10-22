import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * When the browser first reached each host (Phase 117 Theme F) — the "first seen today, no history"
 * rule's only memory.
 *
 * **No readable history on disk.** Each host is keyed by an HMAC-SHA256 under a random key, and the
 * key itself is stored only encrypted by the OS keychain ({@link LedgerCipher}, `electron.safeStorage`
 * from the composer). So `<userData>/browser-hosts-seen.json` (0600, atomic temp+rename) is a set of
 * opaque digests and *day numbers* — the rule only needs the day, so no visit time is kept — and
 * hashing a list of popular domains against it recovers nothing without the keychain. With no cipher
 * (or one that cannot encrypt) the ledger stays in memory and nothing is written at all. "Clear
 * browsing data" deletes the file and the key with it.
 *
 * Bounded at {@link HOSTS_SEEN_CAP} entries (oldest first-seen evicted), and written at most once per
 * {@link HOSTS_SEEN_WRITE_DELAY_MS}, since a burst of new hosts should not be a burst of writes.
 */

export const HOSTS_SEEN_FILE = 'browser-hosts-seen.json';
export const HOSTS_SEEN_CAP = 20_000;
export const HOSTS_SEEN_WRITE_DELAY_MS = 2_000;

/** `electron.safeStorage`, structurally — injected, never imported (main does not import electron). */
export type LedgerCipher = {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
};

type Persisted = { version: 2; key: string; hosts: Record<string, number> };

export type HostFirstSeenStore = {
  /** Whether the ledger survives a restart. When it does not, every host is "new" after each launch. */
  readonly persistent: boolean;
  /** Records a committed host (first visit only) and returns the local day it was first seen. */
  note(host: string): number;
  /** The local day the host was first seen, or `undefined` if never. */
  firstSeen(host: string): number | undefined;
  /** "Clear browsing data": forget every host, on disk too. */
  clear(): void;
  /** Writes any pending change now (quit, tests). */
  flush(): void;
};

/** Days since the epoch in local time — two instants on the same calendar day share one. */
export function localDay(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function hostDigest(key: Buffer, host: string): string {
  const normalised = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return createHmac('sha256', key).update(normalised).digest('hex').slice(0, 32);
}

export function createHostFirstSeenStore(
  options: { directory?: string; now?: () => number; cipher?: LedgerCipher } = {},
): HostFirstSeenStore {
  const cipher = options.cipher;
  const persistent = Boolean(options.directory && cipher?.isEncryptionAvailable());
  const filePath = persistent && options.directory ? join(options.directory, HOSTS_SEEN_FILE) : null;
  const now = options.now ?? Date.now;
  let key: Buffer = randomBytes(32);
  let hosts: Map<string, number> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const load = (): Map<string, number> => {
    if (hosts) return hosts;
    hosts = new Map();
    if (!filePath || !cipher) return hosts;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Persisted>;
      if (parsed?.version !== 2 || typeof parsed.key !== 'string' || typeof parsed.hosts !== 'object' || parsed.hosts === null) {
        return hosts;
      }
      const stored = Buffer.from(cipher.decryptString(Buffer.from(parsed.key, 'base64')), 'hex');
      if (stored.length !== 32) return hosts;
      key = stored;
      const rows = Object.entries(parsed.hosts).filter(([, day]) => typeof day === 'number' && Number.isInteger(day));
      rows.sort((a, b) => a[1] - b[1]);
      for (const [digest, day] of rows) hosts.set(digest, day);
    } catch {
      // Missing, corrupt, or a key the keychain no longer opens: start empty under a fresh key — the
      // worst case is every host reading as new once more.
    }
    return hosts;
  };

  const write = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!filePath || !cipher || !hosts) return;
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      const data: Persisted = {
        version: 2,
        key: cipher.encryptString(key.toString('hex')).toString('base64'),
        hosts: Object.fromEntries(hosts),
      };
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
    persistent: filePath !== null,
    note(host) {
      const map = load();
      const digest = hostDigest(key, host);
      const seen = map.get(digest);
      if (seen !== undefined) return seen;
      const day = localDay(now());
      map.set(digest, day);
      // Map keeps insertion order and new entries are the newest, so the first key is the oldest.
      while (map.size > HOSTS_SEEN_CAP) map.delete(map.keys().next().value as string);
      schedule();
      return day;
    },
    firstSeen: (host) => {
      const map = load();
      return map.get(hostDigest(key, host));
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      hosts = new Map();
      key = randomBytes(32);
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
