import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/**
 * The host's pairings (`docs/APPS.md`, "Pairing"): app id → the public key it first paired with
 * (TOFU), plus the conflicts seen since — a hello for a bound app with a different key.
 *
 * `<runtime>/host/pairings.json`, `0600` in the `0700` host directory. Public keys only: reading this
 * file lets nobody prove they are an app. Re-read on every check (it is a handful of lines), so the
 * in-process Vault view and the socket see one state. Unreadable or malformed reads as "nothing
 * paired" — which can only make an app re-bind, and a re-bind by anyone but the real app shows up
 * as that app's conflict.
 */
export const PAIRINGS_FILE = 'pairings.json';

const FileSchema = z.object({
  version: z.literal(1),
  apps: z.record(z.object({ publicKey: z.string().min(1), pairedAt: z.number().int().nonnegative() })),
  conflicts: z.record(z.object({ at: z.number().int().nonnegative(), count: z.number().int().positive() })),
});
type PairingsFile = z.infer<typeof FileSchema>;

export type PairingCheck = 'bound' | 'paired' | 'conflict';

/** What the Vault app is told: names and times, never a key. */
export type PairingsListing = {
  /** Every bound app; `conflict` is the latest refused hello with a different key, if any. */
  apps: { appId: string; pairedAt: number; conflict: { at: number; count: number } | null }[];
};

export interface PairingStore {
  /** Bind on first sight, accept the bound key, or record a conflict. */
  check(appId: string, publicKey: string): PairingCheck;
  list(): PairingsListing;
  /** User-initiated only (the Vault app's Unpair): clears the binding and its conflict. */
  unpair(appId: string): boolean;
}

export function createPairingStore(options: { hostDirectory: string; now?: () => number }): PairingStore {
  const path = join(options.hostDirectory, PAIRINGS_FILE);
  const now = options.now ?? Date.now;
  const empty = (): PairingsFile => ({ version: 1, apps: {}, conflicts: {} });

  const load = (): PairingsFile => {
    try {
      const parsed = FileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
      return parsed.success ? parsed.data : empty();
    } catch {
      return empty();
    }
  };
  const save = (state: PairingsFile): boolean => {
    try {
      mkdirSync(options.hostDirectory, { recursive: true, mode: 0o700 });
      chmodSync(options.hostDirectory, 0o700);
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, path);
      chmodSync(path, 0o600);
      return true;
    } catch {
      return false;
    }
  };

  return {
    check(appId, publicKey) {
      const state = load();
      const bound = state.apps[appId];
      if (bound === undefined) {
        state.apps[appId] = { publicKey, pairedAt: now() };
        // A binding the host could not record is not a binding: refuse rather than pair for one connection.
        return save(state) ? 'bound' : 'conflict';
      }
      if (bound.publicKey === publicKey) return 'paired';
      const seen = state.conflicts[appId];
      state.conflicts[appId] = { at: now(), count: (seen?.count ?? 0) + 1 };
      save(state);
      return 'conflict';
    },
    list() {
      const state = load();
      return {
        apps: Object.entries(state.apps)
          .map(([appId, { pairedAt }]) => ({ appId, pairedAt, conflict: state.conflicts[appId] ?? null }))
          .sort((a, b) => a.appId.localeCompare(b.appId)),
      };
    },
    unpair(appId) {
      const state = load();
      if (state.apps[appId] === undefined && state.conflicts[appId] === undefined) return false;
      delete state.apps[appId];
      delete state.conflicts[appId];
      return save(state);
    },
  };
}
