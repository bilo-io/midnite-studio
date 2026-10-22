import * as net from 'node:net';

import type { RuntimeAppId } from '../../app-id';
import type { VaultGrantScope, VaultGrantsMap } from '../grants';
import {
  VaultAccessDeniedError,
  type VaultClient,
  type VaultNamespace,
  type VaultRead,
} from '../vault-service';
import type { PairingIdentity } from './pairing';
import type { PairingsListing } from './pairing-store';
import { createLineSplitter, type VaultHostChallenge, type VaultHostReply } from './protocol';

/**
 * A guest app's vault: a {@link VaultClient} whose every call is answered by the runtime host over
 * its socket (`docs/APPS.md`, "The shared data plane"). The guest holds no vault cipher; each
 * connection first pairs, signing the host's nonce with the app's pairing key ("Pairing").
 *
 * Connects lazily and reconnects on the next call after a drop, so a guest started before the host
 * (Coder opened before Studio) finds it once it is up. **With no host, reads answer as absent and a
 * write throws {@link VaultHostUnavailableError}** — the same "denied read is absent, refused write
 * throws" contract the in-process vault keeps. `isAvailable()` is synchronous, so it answers the
 * host's last-known keychain state, `false` until the host has answered once.
 */

export class VaultHostUnavailableError extends Error {
  constructor(message = 'The vault is held by Midnite Studio. Open Studio, then try again.') {
    super(message);
    this.name = 'VaultHostUnavailableError';
  }
}

/** The host answered but would not pair this app — a conflict the user resolves in Vault ▸ App access. */
export class VaultPairingRefusedError extends VaultHostUnavailableError {
  constructor(readonly reason: string) {
    super(`Midnite Studio would not pair this app with the vault (${reason}). Unpair it in Vault ▸ App access, then try again.`);
    this.name = 'VaultPairingRefusedError';
  }
}

export type RemoteVaultGrants = {
  list(): Promise<{ grants: VaultGrantsMap; corrupt: boolean }>;
  set(appId: RuntimeAppId, namespace: VaultNamespace, scope: VaultGrantScope): Promise<boolean>;
  revoke(appId: RuntimeAppId, namespace?: VaultNamespace): Promise<boolean>;
};

export type RemoteVaultPairing = {
  list(): Promise<PairingsListing>;
  unpair(appId: string): Promise<boolean>;
};

export interface RemoteVault extends VaultClient {
  /** The host's grant store, for the Vault app (the host refuses anyone else). */
  readonly grants: RemoteVaultGrants;
  /** The host's pairings — list and Unpair — for the Vault app (the host refuses anyone else). */
  readonly pairing: RemoteVaultPairing;
  /** Resolves true once this app has paired with the host; false when there is none or it refused. */
  ping(): Promise<boolean>;
  /** Why the host last refused to pair this app, or null. */
  refusal(): string | null;
  close(): void;
}

export type ConnectRuntimeVaultOptions = {
  /** `vaultHostSocketPath(runtimeDirectory)`. */
  socketPath: string;
  appId: RuntimeAppId;
  /** This app's pairing key (`loadOrCreatePairingIdentity`, read lazily); null pairs nothing. */
  identity: () => PairingIdentity | null;
  /** Per-request deadline. */
  timeoutMs?: number;
  connect?: (path: string) => net.Socket;
};

type Pending = { resolve: (reply: VaultHostReply | null) => void; timer: NodeJS.Timeout };

export function connectRuntimeVault(options: ConnectRuntimeVaultOptions): RemoteVault {
  const { socketPath, appId, timeoutMs = 3000, connect = (p) => net.connect(p) } = options;
  let socket: net.Socket | null = null;
  let connecting: Promise<net.Socket | null> | null = null;
  let available = false;
  /** Why the last connection was refused pairing; null when it paired or no host answered. */
  let refusal: string | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const settleAll = (): void => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.resolve(null);
      pending.delete(id);
    }
  };

  /**
   * Connect and pair: the host's first line is a nonce, which this app signs with its pairing key
   * (`hello`, id 0). The socket is used only once the host accepts that; a refusal (no key, a proof
   * that does not verify, a pairing conflict) is remembered so a write can say why.
   */
  const open = (): Promise<net.Socket | null> => {
    if (socket !== null && !socket.destroyed) return Promise.resolve(socket);
    connecting ??= new Promise<net.Socket | null>((resolve) => {
      refusal = null;
      const s = connect(socketPath);
      const lines = createLineSplitter();
      let paired = false;
      const refuse = (why: string): void => {
        refusal = why;
        s.destroy();
        resolve(null);
      };
      const handshake = setTimeout(() => refuse('the vault host did not answer'), timeoutMs);
      s.once('connect', () => s.unref());
      s.on('data', (chunk) => {
        for (const line of lines.push(chunk)) {
          let message: (VaultHostReply & { t?: undefined }) | VaultHostChallenge;
          try {
            message = JSON.parse(line) as typeof message;
          } catch {
            continue;
          }
          if (!paired) {
            if (message.t === 'challenge') {
              const me = options.identity();
              if (me === null) return refuse('this app has no pairing key (its keychain is unavailable)');
              s.write(`${JSON.stringify({ id: 0, op: 'hello', appId, publicKey: me.publicKey, proof: me.prove(appId, message.nonce) })}\n`);
            } else if (message.t === undefined && message.id === 0) {
              clearTimeout(handshake);
              available = message.available;
              if (!message.ok) return refuse(message.message);
              paired = true;
              refusal = null;
              socket = s;
              resolve(s);
            }
            continue;
          }
          if (message.t !== undefined) continue;
          const reply = message;
          const p = pending.get(reply.id);
          if (!p) continue;
          pending.delete(reply.id);
          clearTimeout(p.timer);
          available = reply.available;
          p.resolve(reply);
        }
      });
      // No host listening is not a refusal (`refusal` stays null) — a write then says "open Studio".
      s.once('error', () => resolve(null));
      s.once('close', () => {
        clearTimeout(handshake);
        if (socket === s) socket = null;
        available = false;
        settleAll();
        resolve(null);
      });
    }).finally(() => {
      connecting = null;
    });
    return connecting;
  };

  /** One round trip; null when there is no host or it did not answer in time. */
  const request = async (body: Record<string, unknown>): Promise<VaultHostReply | null> => {
    const s = await open();
    if (s === null) return null;
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      s.write(`${JSON.stringify({ ...body, id, appId })}\n`);
    });
  };

  /** A read: the result, or `absent` when the host is missing or refused. */
  const read = async <T>(body: Record<string, unknown>, absent: T): Promise<T> => {
    const reply = await request(body);
    return reply?.ok ? (reply.result as T) : absent;
  };

  /** A write: throws when there is no host, or when the host refused (denied → the vault's own error). */
  const write = async (body: Record<string, unknown> & { namespace: VaultNamespace; key: string }, op: 'write' | 'delete') => {
    const reply = await request(body);
    if (reply === null) throw refusal === null ? new VaultHostUnavailableError() : new VaultPairingRefusedError(refusal);
    if (reply.ok) return;
    if (reply.error === 'denied') throw new VaultAccessDeniedError({ appId, namespace: body.namespace, key: body.key, op });
    throw new Error(reply.message);
  };

  // Pair up front, so the first synchronous `isAvailable()` is not a guess.
  void open();

  return {
    appId,
    isAvailable: () => available,
    has: (namespace, key) => read({ op: 'has', namespace, key }, false),
    read: async (namespace, key): Promise<VaultRead> => {
      const reply = await request({ op: 'get', namespace, key });
      if (reply === null) return { ok: false, kind: 'unavailable' };
      if (!reply.ok) {
        if (reply.error === 'locked') return { ok: false, kind: 'locked' };
        if (reply.error === 'denied') return { ok: false, kind: 'denied' };
        return { ok: false, kind: 'unavailable' };
      }
      return reply.result === null ? { ok: false, kind: 'absent' } : { ok: true, value: reply.result as string };
    },
    get: async (namespace, key) => {
      const reply = await request({ op: 'get', namespace, key });
      return reply?.ok && typeof reply.result === 'string' ? reply.result : null;
    },
    fingerprint: (namespace, key) => read<string | null>({ op: 'fingerprint', namespace, key }, null),
    keys: (namespace) => read<string[]>({ op: 'keys', namespace }, []),
    set: (namespace, key, value, setOptions) =>
      write({ op: 'set', namespace, key, value, ...(setOptions?.fingerprint === undefined ? {} : { fingerprint: setOptions.fingerprint }) }, 'write'),
    delete: (namespace, key) => write({ op: 'delete', namespace, key }, 'delete'),
    grants: {
      list: () => read({ op: 'grants.list' }, { grants: {}, corrupt: false }),
      set: (grantee, namespace, scope) => read({ op: 'grants.set', grantee, namespace, scope }, false),
      revoke: (grantee, namespace) =>
        read({ op: 'grants.revoke', grantee, ...(namespace === undefined ? {} : { namespace }) }, false),
    },
    pairing: {
      list: () => read<PairingsListing>({ op: 'pairing.list' }, { apps: [] }),
      unpair: (target) => read({ op: 'pairing.unpair', target }, false),
    },
    ping: async () => (await open()) !== null,
    refusal: () => refusal,
    close: () => {
      settleAll();
      socket?.destroy();
      socket = null;
    },
  };
}
