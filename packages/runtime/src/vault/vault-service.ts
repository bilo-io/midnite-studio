import type { RuntimeAppId } from '../app-id';
import {
  createSecureJsonStore,
  decryptSecret,
  encryptSecret,
  type SecureJsonStore,
  type VaultCipher,
} from './secure-store';

/**
 * The runtime's one vault — Phase 113 Theme D, item 1.
 *
 * Studio had three `safeStorage` vaults, each a thin binding over the same
 * secure-store primitive: app secrets (`secrets-vault.ts`), forge account
 * tokens (`forge/forge-account-vault.ts`) and database passwords
 * (`db/credential-vault.ts`). They are now three **namespaces** of this one
 * service, and the desktop modules that used to own them are bindings over a
 * {@link VaultClient}.
 *
 * ## Why one service, owned by the runtime
 *
 * On macOS, `safeStorage` encrypts with a key held in the login keychain
 * under the *process's* app name ("<name> Safe Storage"). Two app processes
 * each composing their own vault over the same files would each hold a
 * different key, and neither could read what the other wrote. So exactly one
 * process — the runtime — composes this service with its `safeStorage`, and
 * every app reads through it. Today the runtime process *is* Studio's main
 * process, so the key, the files and the answers are exactly what they were.
 *
 * **Compose it once per process, and only in the runtime.** Each namespace's
 * store caches its file in memory; a second service over the same directory
 * would not see the first one's writes. Apps in other processes will reach
 * this one through the runtime daemon's transport (Theme E/G), not by
 * composing their own.
 *
 * ## The wire still says only `hasToken`
 *
 * Nothing here is an IPC channel. A plaintext value leaves the service only
 * through `get`, to main-process code that needs it (a `git push` header, a
 * DB driver); what reaches a renderer is {@link VaultClient.has}'s boolean,
 * exactly as `ForgeAccountSchema.hasToken` always was.
 *
 * ## Existing data keeps decrypting
 *
 * Each namespace maps to the file its old vault wrote — same name, same
 * directory (`userData`), same `{ version: 1, entries }` shape, same entry
 * fields — so there is no migration step to get wrong: the service opens
 * those files as they are.
 */

/** The one place each namespace's on-disk file and degraded-mode behaviour is written down. */
export const VAULT_NAMESPACES = {
  /** App-wide secrets keyed by `SecretKey` (Phase 76 Theme D — the Twelve Data key). */
  secrets: { fileName: 'secrets.vault.json', fingerprinted: false, whenUnavailable: 'drop' },
  /**
   * Forge personal access tokens keyed `${provider}:${host}:${login}` (Phase 90
   * Theme B). The one namespace that keeps a token for the session when the
   * keychain is unavailable rather than dropping it — see
   * `desktop/src/main/forge/forge-account-vault.ts` for why.
   */
  'forge-accounts': {
    fileName: 'forge-accounts.vault.json',
    fingerprinted: false,
    whenUnavailable: 'session',
  },
  /**
   * Saved database passwords keyed by connection id, each stored with a
   * fingerprint of the connection's non-secret fields so an edited connection
   * drops a stale password (Phase 76 Theme D).
   */
  'db-credentials': {
    fileName: 'db-connections.vault.json',
    fingerprinted: true,
    // Phase 91 Theme G: degrade like the STT vault and the forge vault — hold the
    // password for the session — instead of silently dropping what the user typed.
    whenUnavailable: 'session',
  },
} as const satisfies Record<string, VaultNamespaceSpec>;

type VaultNamespaceSpec = {
  /** The file under the vault directory — unchanged from the vault this namespace replaced. */
  fileName: string;
  /** Whether every entry carries a `fingerprint` (and an entry without one is unreadable). */
  fingerprinted: boolean;
  /** What `set` does when encryption is unavailable: silently drop, or hold for the session. */
  whenUnavailable: 'drop' | 'session';
};

export type VaultNamespace = keyof typeof VAULT_NAMESPACES;

export const VAULT_NAMESPACE_IDS = Object.keys(VAULT_NAMESPACES) as VaultNamespace[];

/**
 * One access, as {@link VaultAuthorize} sees it. `key` is the entry id, never
 * a value — an authorizer has no business seeing a secret.
 */
export type VaultAccess = {
  appId: RuntimeAppId;
  namespace: VaultNamespace;
  key: string;
  op: 'read' | 'write' | 'delete';
};

/**
 * The seam Theme J's per-app grants slot into. Today the runtime composes
 * the service with {@link allowAllVaultAccess}, so every app sees every entry
 * — which, with Studio the only caller, is exactly today's behaviour.
 *
 * A denied read answers as if the entry were absent (`null` / `false`); a
 * denied write or delete throws {@link VaultAccessDeniedError}, because a
 * write that silently did nothing is the failure a user pastes a token twice
 * over.
 */
export type VaultAuthorize = (access: VaultAccess) => boolean;

export const allowAllVaultAccess: VaultAuthorize = () => true;

export class VaultAccessDeniedError extends Error {
  constructor(readonly access: VaultAccess) {
    super(`${access.appId} may not ${access.op} ${access.namespace}:${access.key}`);
    this.name = 'VaultAccessDeniedError';
  }
}

/** One app's handle on the vault: every call is made as {@link appId}. */
export interface VaultClient {
  readonly appId: RuntimeAppId;
  /** Whether OS-backed encryption works in the runtime's process. */
  isAvailable(): boolean;
  /** Whether an entry exists and decrypts — the `hasToken` answer, never the value. */
  has(namespace: VaultNamespace, key: string): Promise<boolean>;
  /** The decrypted value, or `null` when absent, unreadable or not granted. */
  get(namespace: VaultNamespace, key: string): Promise<string | null>;
  /**
   * Encrypt and store `value`. A fingerprinted namespace requires
   * `fingerprint`. When encryption is unavailable the namespace's
   * `whenUnavailable` decides: drop silently, or hold it for the session.
   */
  set(namespace: VaultNamespace, key: string, value: string, options?: { fingerprint?: string }): Promise<void>;
  delete(namespace: VaultNamespace, key: string): Promise<void>;
  /**
   * The entry ids of a namespace that the app may read — names only, never a
   * value. What a metadata-only list (the Vault app's) is built from.
   */
  keys(namespace: VaultNamespace): Promise<string[]>;
  /** The stored fingerprint for a fingerprinted namespace's entry, or `null`. */
  fingerprint(namespace: VaultNamespace, key: string): Promise<string | null>;
}

export interface VaultService {
  /** Whether OS-backed encryption works in the runtime's process. */
  isAvailable(): boolean;
  /** A handle that makes every access as `appId`. Cheap; handles share one store per namespace. */
  forApp(appId: RuntimeAppId): VaultClient;
}

export type VaultServiceOptions = {
  /** Where the namespace files live — Studio's `userData`, which is where they always were. */
  directory: string;
  /**
   * `electron.safeStorage` of the runtime's own process (see the module
   * docblock for why it must be that process's), or a fake in tests.
   */
  cipher: VaultCipher;
  /** Defaults to {@link allowAllVaultAccess}; Theme J replaces it with real grants. */
  authorize?: VaultAuthorize;
};

/** The on-disk entry: `{ encrypted }`, plus `fingerprint` in a fingerprinted namespace. */
type StoredEntry = { fingerprint?: string; encrypted: string };

function entryParser(fingerprinted: boolean): (value: unknown) => Record<string, StoredEntry> {
  return (value) => {
    if (typeof value !== 'object' || value === null) return {};
    const entries = (value as { entries?: unknown }).entries;
    if (typeof entries !== 'object' || entries === null) return {};

    const out: Record<string, StoredEntry> = {};
    for (const [id, raw] of Object.entries(entries as Record<string, unknown>)) {
      if (!id || typeof raw !== 'object' || raw === null) continue;
      const row = raw as Record<string, unknown>;
      const encrypted = row['encrypted'];
      if (typeof encrypted !== 'string') continue;
      if (!fingerprinted) {
        out[id] = { encrypted };
        continue;
      }
      const fingerprint = row['fingerprint'];
      if (typeof fingerprint === 'string') out[id] = { fingerprint, encrypted };
    }
    return out;
  };
}

export function createVaultService(options: VaultServiceOptions): VaultService {
  const { directory, cipher, authorize = allowAllVaultAccess } = options;

  const stores = new Map<VaultNamespace, SecureJsonStore<StoredEntry>>();
  const storeFor = (namespace: VaultNamespace): SecureJsonStore<StoredEntry> => {
    let store = stores.get(namespace);
    if (!store) {
      const spec = VAULT_NAMESPACES[namespace];
      store = createSecureJsonStore<StoredEntry>(directory, spec.fileName, entryParser(spec.fingerprinted));
      stores.set(namespace, store);
    }
    return store;
  };

  /**
   * Tokens held for this process's lifetime only, for a `whenUnavailable:
   * 'session'` namespace on a machine with no working keychain. Owned by the
   * service, not a client, so every app sees the same session-only token.
   */
  const sessionOnly = new Map<VaultNamespace, Map<string, string>>();
  const sessionMap = (namespace: VaultNamespace): Map<string, string> => {
    let map = sessionOnly.get(namespace);
    if (!map) {
      map = new Map();
      sessionOnly.set(namespace, map);
    }
    return map;
  };

  const isAvailable = (): boolean => cipher.isEncryptionAvailable();

  const read = async (namespace: VaultNamespace, key: string): Promise<string | null> => {
    const held = sessionOnly.get(namespace)?.get(key);
    if (held !== undefined) return held;
    const entry = await storeFor(namespace).get(key);
    if (!entry) return null;
    return decryptSecret(cipher, entry.encrypted);
  };

  return {
    isAvailable,

    forApp(appId) {
      const allowed = (namespace: VaultNamespace, key: string, op: VaultAccess['op']): boolean =>
        authorize({ appId, namespace, key, op });
      const demand = (namespace: VaultNamespace, key: string, op: VaultAccess['op']): void => {
        if (!allowed(namespace, key, op)) throw new VaultAccessDeniedError({ appId, namespace, key, op });
      };

      return {
        appId,
        isAvailable,

        has: async (namespace, key) => {
          if (!allowed(namespace, key, 'read')) return false;
          return (await read(namespace, key)) !== null;
        },

        get: async (namespace, key) => {
          if (!allowed(namespace, key, 'read')) return null;
          return read(namespace, key);
        },

        set: async (namespace, key, value, setOptions) => {
          demand(namespace, key, 'write');
          const spec = VAULT_NAMESPACES[namespace];
          const fingerprint = setOptions?.fingerprint;
          if (spec.fingerprinted && fingerprint === undefined) {
            throw new Error(`vault namespace ${namespace} requires a fingerprint`);
          }
          if (!isAvailable()) {
            if (spec.whenUnavailable === 'session') sessionMap(namespace).set(key, value);
            return;
          }
          sessionOnly.get(namespace)?.delete(key);
          const encrypted = encryptSecret(cipher, value);
          // Field order matches what the old vaults wrote, so a file's diff
          // across the move is the changed entry and nothing else.
          await storeFor(namespace).set(key, spec.fingerprinted ? { fingerprint, encrypted } : { encrypted });
        },

        delete: async (namespace, key) => {
          demand(namespace, key, 'delete');
          sessionOnly.get(namespace)?.delete(key);
          await storeFor(namespace).delete(key);
        },

        keys: async (namespace) => {
          const ids = new Set(await storeFor(namespace).keys());
          for (const id of sessionOnly.get(namespace)?.keys() ?? []) ids.add(id);
          return [...ids].filter((id) => allowed(namespace, id, 'read'));
        },

        fingerprint: async (namespace, key) => {
          if (!allowed(namespace, key, 'read')) return null;
          return (await storeFor(namespace).get(key))?.fingerprint ?? null;
        },
      };
    },
  };
}
