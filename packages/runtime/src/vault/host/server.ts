import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import { dirname } from 'node:path';

import { PLACEMENT_APP_IDS } from '@midnite/studio-shared';

import type { RuntimeAppId } from '../../app-id';
import { isSocketPathTooLong } from '../../broker/socket-name';
import type { VaultGrants } from '../grants';
import { VaultAccessDeniedError, type VaultService } from '../vault-service';
import {
  createLineSplitter,
  VAULT_HOST_MAX_LINE_BYTES,
  VaultHostRequestSchema,
  type VaultHostChallenge,
  type VaultHostErrorKind,
  type VaultHostReply,
  type VaultHostRequest,
} from './protocol';
import { verifyPairingProof } from './pairing';
import type { PairingStore } from './pairing-store';

/**
 * The vault host: serves the host process's one {@link VaultService} to guest apps over a Unix
 * socket (`docs/APPS.md`, "The shared data plane" and "Pairing").
 *
 * A request is served only when its connection has **paired** — signed this connection's nonce with
 * the key the app first paired with — **and** the host's grants allow it. Two claims are refused
 * outright, because no honest guest makes them: **`studio`** (Studio is in-process with the host,
 * so a socket peer claiming it is a spoof that would otherwise read everything) and **`get` as
 * `vault`** (the Vault app never reads a value — its preload has no such channel — so the host
 * holds it to that). Grant edits are the Vault app's alone.
 */

const KNOWN_APPS: ReadonlySet<string> = new Set<string>(PLACEMENT_APP_IDS);

export type VaultHostOptions = {
  socketPath: string;
  service: VaultService;
  /** The host's grants — what `authorize` reads, and what the Vault app edits. Null: no grant edits. */
  grants: VaultGrants | null;
  /** Which key each app paired with (`<runtime>/host/pairings.json`). */
  pairings: PairingStore;
  log?: (message: string) => void;
};

export type VaultHost = { readonly socketPath: string; close(): Promise<void> };

type Outcome = { ok: true; result: unknown } | { ok: false; error: VaultHostErrorKind; message: string };
const fail = (error: VaultHostErrorKind, message: string): Outcome => ({ ok: false, error, message });
const done = (result: unknown): Outcome => ({ ok: true, result });

/** One connection's state: the nonce it was challenged with, and the app it proved to be. */
export type VaultHostConnection = { readonly nonce: string; paired: RuntimeAppId | null };

/** The hello: verify the proof over this connection's nonce, then bind (first sight) or match the app's key. */
function answerHello(options: Omit<VaultHostOptions, 'socketPath'>, conn: VaultHostConnection, req: VaultHostRequest & { op: 'hello' }): Outcome {
  if (conn.paired !== null) return fail('invalid', 'this connection has already paired');
  if (!verifyPairingProof(req.publicKey, req.appId, conn.nonce, req.proof)) {
    return fail('unpaired', `${req.appId}: the pairing proof does not verify`);
  }
  const check = options.pairings.check(req.appId, req.publicKey);
  if (check === 'conflict') {
    return fail('unpaired', `${req.appId}: pairing conflict — a different key than the one ${req.appId} paired with; unpair it in Vault to re-pair`);
  }
  conn.paired = req.appId as RuntimeAppId;
  return done({ appId: req.appId, bound: check === 'bound' });
}

/**
 * One request on one connection, answered. Exported for the unit tests; the socket goes through
 * {@link startVaultHost}. Nothing but a hello is served until the connection has paired, and then
 * only as the app it paired as — the grants come after, never instead.
 */
export async function answerVaultRequest(
  options: Omit<VaultHostOptions, 'socketPath'>,
  conn: VaultHostConnection,
  req: VaultHostRequest,
): Promise<Outcome> {
  if (req.appId === 'studio') return fail('denied', 'studio is not a remote caller');
  if (!KNOWN_APPS.has(req.appId)) return fail('denied', `unknown app "${req.appId}"`);
  if (req.op === 'hello') return answerHello(options, conn, req);
  if (conn.paired !== req.appId) return fail('unpaired', `this connection has not paired as ${req.appId}`);
  const appId = req.appId as RuntimeAppId;
  const vault = options.service.forApp(appId);
  try {
    switch (req.op) {
      case 'pairing.list':
        if (appId !== 'vault') return fail('denied', 'only the Vault app reads pairings');
        return done(options.pairings.list());
      case 'pairing.unpair':
        if (appId !== 'vault') return fail('denied', 'only the Vault app unpairs an app');
        return done(options.pairings.unpair(req.target));
      case 'has':
        return done(await vault.has(req.namespace, req.key));
      case 'get':
        if (appId === 'vault') return fail('denied', 'the Vault app never reads a value');
        return done(await vault.get(req.namespace, req.key));
      case 'fingerprint':
        return done(await vault.fingerprint(req.namespace, req.key));
      case 'keys':
        return done(await vault.keys(req.namespace));
      case 'set':
        await vault.set(req.namespace, req.key, req.value, req.fingerprint === undefined ? {} : { fingerprint: req.fingerprint });
        return done(null);
      case 'delete':
        await vault.delete(req.namespace, req.key);
        return done(null);
      default:
        return answerGrants(options.grants, appId, req);
    }
  } catch (error) {
    if (error instanceof VaultAccessDeniedError) return fail('denied', error.message);
    return fail('failed', error instanceof Error ? error.message : String(error));
  }
}

function answerGrants(grants: VaultGrants | null, appId: RuntimeAppId, req: VaultHostRequest): Outcome {
  if (appId !== 'vault') return fail('denied', 'only the Vault app edits grants');
  if (grants === null) return fail('failed', 'this host keeps no grants');
  if (req.op === 'grants.list') return done(grants.list());
  if (req.op !== 'grants.set' && req.op !== 'grants.revoke') return fail('invalid', 'unknown op');
  if (!KNOWN_APPS.has(req.grantee)) return done(false);
  const grantee = req.grantee as RuntimeAppId;
  return done(req.op === 'grants.set' ? grants.set(grantee, req.namespace, req.scope) : grants.revoke(grantee, req.namespace));
}

/** Whether something already answers on `path` — a live host we must not take the path from. */
function isListening(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.connect(path);
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });
}

/**
 * Listen on `socketPath`. Refuses (rejects) when another host already answers there, or when the
 * path is too long for a Unix socket; a dead socket file left by a crashed host is replaced.
 */
export async function startVaultHost(options: VaultHostOptions): Promise<VaultHost> {
  const { socketPath, log = () => undefined } = options;
  if (isSocketPathTooLong(socketPath)) throw new Error('vault host: path too long for a Unix socket');
  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(socketPath), 0o700);
  if (await isListening(socketPath)) throw new Error('vault host: another host is already serving');
  try {
    unlinkSync(socketPath);
  } catch {
    // No stale file.
  }

  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    // A fresh nonce per connection: a hello signed for another connection proves nothing here.
    const conn: VaultHostConnection = { nonce: randomBytes(32).toString('base64url'), paired: null };
    const challenge: VaultHostChallenge = { t: 'challenge', nonce: conn.nonce };
    socket.write(`${JSON.stringify(challenge)}\n`);
    const lines = createLineSplitter();
    socket.on('data', (chunk) => {
      for (const line of lines.push(chunk)) void serveLine(socket, conn, line);
      if (lines.pending() > VAULT_HOST_MAX_LINE_BYTES) socket.destroy();
    });
  });

  const serveLine = async (socket: net.Socket, conn: VaultHostConnection, line: string): Promise<void> => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      raw = null;
    }
    const parsed = VaultHostRequestSchema.safeParse(raw);
    const id = typeof (raw as { id?: unknown } | null)?.id === 'number' ? (raw as { id: number }).id : -1;
    const outcome = parsed.success
      ? await answerVaultRequest(options, conn, parsed.data)
      : fail('invalid', parsed.error.issues[0]?.message ?? 'invalid request');
    if (!outcome.ok && (outcome.error === 'denied' || outcome.error === 'unpaired')) log(`[vault-host] refused: ${outcome.message}`);
    const reply = { id, available: options.service.isAvailable(), ...outcome } as VaultHostReply;
    if (!socket.destroyed) socket.write(`${JSON.stringify(reply)}\n`);
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  chmodSync(socketPath, 0o600);
  log(`[vault-host] serving on ${socketPath}`);

  return {
    socketPath,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
