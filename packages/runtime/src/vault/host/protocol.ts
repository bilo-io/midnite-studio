import { z } from 'zod';

import { VAULT_NAMESPACE_IDS, type VaultNamespace } from '../vault-service';

/**
 * The vault host's wire (`docs/APPS.md`, "The shared data plane"): newline-delimited JSON over a
 * Unix socket between two **main** processes — the host that holds the keychain identity, and a
 * guest app's main. A renderer never sees this socket, and nothing on it is an IPC channel.
 *
 * The host opens every connection with a nonce; the guest's first request is a `hello` signing it
 * with the app's pairing key (`pairing.ts`). Only then is anything served, and only for that app,
 * and only what the host's grants allow it — a guest can ask but never decide. A value travels only
 * in a `get` reply or a `set` request.
 */

const AppIdSchema = z.string().min(1).max(64);
const NamespaceSchema = z.enum(VAULT_NAMESPACE_IDS as [VaultNamespace, ...VaultNamespace[]]);
const KeySchema = z.string().min(1).max(512);
const ScopeSchema = z.union([z.literal('*'), z.array(KeySchema)]);

const base = { id: z.number().int().nonnegative(), appId: AppIdSchema };
const entry = { ...base, namespace: NamespaceSchema, key: KeySchema };

const B64URL = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);

export const VaultHostRequestSchema = z.discriminatedUnion('op', [
  /** The first request on a connection: the app's public key and its signature over the host's nonce. */
  z.object({ ...base, op: z.literal('hello'), publicKey: B64URL, proof: B64URL }),
  z.object({ ...base, op: z.literal('pairing.list') }),
  z.object({ ...base, op: z.literal('pairing.unpair'), target: AppIdSchema }),
  z.object({ ...entry, op: z.literal('has') }),
  z.object({ ...entry, op: z.literal('get') }),
  z.object({ ...entry, op: z.literal('fingerprint') }),
  z.object({ ...entry, op: z.literal('delete') }),
  z.object({
    ...entry,
    op: z.literal('set'),
    value: z.string().max(64 * 1024),
    fingerprint: z.string().max(512).optional(),
  }),
  z.object({ ...base, op: z.literal('keys'), namespace: NamespaceSchema }),
  z.object({ ...base, op: z.literal('grants.list') }),
  z.object({ ...base, op: z.literal('grants.set'), grantee: AppIdSchema, namespace: NamespaceSchema, scope: ScopeSchema }),
  z.object({ ...base, op: z.literal('grants.revoke'), grantee: AppIdSchema, namespace: NamespaceSchema.optional() }),
]);

export type VaultHostRequest = z.infer<typeof VaultHostRequestSchema>;
export type VaultHostOp = VaultHostRequest['op'];

/**
 * Why the host refused: not allowed, a connection that has not paired (or whose key conflicts with
 * the app's binding), a request it could not parse, or the store itself failed.
 */
export type VaultHostErrorKind = 'denied' | 'unpaired' | 'invalid' | 'failed';

/** The host's first line on every connection: a fresh nonce the guest's hello must sign. */
export type VaultHostChallenge = { t: 'challenge'; nonce: string };

/** Every reply carries the host's `isAvailable()`, which is how a guest's synchronous answer stays current. */
export type VaultHostReply =
  | { id: number; ok: true; available: boolean; result: unknown }
  | { id: number; ok: false; available: boolean; error: VaultHostErrorKind; message: string };

/** Bytes buffered for one line before a peer is cut off — a request is small, a flood is not a request. */
export const VAULT_HOST_MAX_LINE_BYTES = 128 * 1024;

/** Split a stream into lines; `push` returns the complete ones and keeps the tail. */
export function createLineSplitter(): { push(chunk: Buffer | string): string[]; pending(): number } {
  let tail = '';
  return {
    push(chunk) {
      tail += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const parts = tail.split('\n');
      tail = parts.pop() ?? '';
      return parts.filter((line) => line.length > 0);
    },
    pending: () => Buffer.byteLength(tail),
  };
}
