import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import { join } from 'node:path';

import {
  createFrameDecoder,
  encodeControl,
  encodeData,
  PROTOCOL,
  type ControlMessage,
  type ControlReply,
  type Frame,
} from '../broker/protocol';
import { createQueuedSocketWriter, type QueuedSocketWriter } from '../broker/socket-write-queue';

export type BrokerStatus = {
  mode: 'broker' | 'inproc';
  reason?: string;
};

export type BrokerClientDeps = {
  userDataDir: string;
  appVersion: string;
  isPackaged: boolean;
  /**
   * Fingerprint of the build this client belongs to; defaults to a hash of the
   * broker script's size and mtime. Part of the socket name — see
   * {@link brokerSocketName} for why.
   */
  buildId?: string;
  log?: (message: string) => void;
  spawnBrokerProcess?: (scriptPath: string, args: string[], logFd: number) => ChildProcess;
  connectSocket?: (path: string) => net.Socket;
  spawnMaxAttempts?: number;
  spawnConnectTimeoutMs?: number;
};

export type BrokerSessionInfo = {
  ptyId: string;
  sessionId: string;
  pid: number;
  cols: number;
  rows: number;
  cwd: string;
  /**
   * Whether the peer that answered `list` for this session is a legacy
   * broker (an older build's, kept reachable only until its sessions end —
   * see {@link brokerSocketName}) rather than the current primary.
   *
   * Stamped here, not read off the wire: the broker server has no concept of
   * "legacy," that is purely this client's view of which peer answered. A
   * session with `legacy: true` is real and still running — it is what lets
   * `listTerminals()` (`terminal-service.ts`) tell main's `livePtyFor` to mark
   * it so, which the renderer's `sessionPhase` reads as `asleep` rather than
   * offering a live pane over a process the current build no longer owns.
   */
  legacy: boolean;
};

export type BrokerClient = {
  init: () => Promise<void>;
  getStatus: () => BrokerStatus;
  createPty: (options: {
    sessionId: string;
    cwd: string;
    cols: number;
    rows: number;
    env: Record<string, string>;
    initialInput?: string | undefined;
  }) => Promise<{ ok: true; ptyId: string; pid: number } | { ok: false; message: string }>;
  writePty: (ptyId: string, data: string) => void;
  resizePty: (ptyId: string, cols: number, rows: number) => Promise<boolean>;
  killPty: (ptyId: string) => Promise<boolean>;
  listSessions: () => Promise<BrokerSessionInfo[]>;
  snapshot: (sessionId: string) => Promise<Uint8Array>;
  /** Tell the broker to drop its own `scrollbackBySession` entries — Phase 45 Theme C. */
  forgetScrollback: (sessionIds: string[]) => void;
  flush: () => Promise<void>;
  disconnect: () => Promise<void>;
  onData: (listener: (ptyId: string, bytes: Uint8Array) => void) => () => void;
  onExit: (listener: (ptyId: string, exitCode: number, signal?: number | undefined) => void) => () => void;
  isAlive: () => boolean;
};

/**
 * The socket a build looks for its broker on.
 *
 * Keyed by version AND build fingerprint, not version alone. The broker is
 * detached on purpose — it outlives the app so terminals survive a relaunch —
 * and so it also outlives the bundle it was started from. Two builds carrying
 * the same version (every dev build is `0.1.0`) used to share one socket, so a
 * freshly installed app reconnected to a broker whose node-pty spawn-helper had
 * moved out from under it and got "posix_spawnp failed." for every new
 * terminal, restart after restart. A fingerprint in the name means a new build
 * starts its own broker; the old one is found by {@link probeLegacyBrokers}
 * and its sessions stay reachable until they end.
 */
export function brokerSocketName(appVersion: string, buildId: string, isPackaged: boolean): string {
  return `${appVersion}-${buildId}${isPackaged ? '' : '-dev'}.sock`;
}

/** Eight hex chars of the file's size and mtime; `unknown` when it cannot be read. */
export function fingerprintFile(path: string): string {
  try {
    const st = statSync(path);
    return createHash('sha1').update(`${st.size}:${Math.floor(st.mtimeMs)}`).digest('hex').slice(0, 8);
  } catch {
    return 'unknown';
  }
}

/** One connected broker process: the primary that takes new ptys, or a legacy one serving out its old ones. */
type Peer = {
  path: string;
  socket: net.Socket;
  legacy: boolean;
  /** ptyIds this broker owns, from `list` and `create`, minus `exit`. */
  ptys: Set<string>;
  /**
   * Queues `writePty` input frames while this peer's socket is backpressured
   * (Phase 51 Theme F) — set in `attach()`, disposed on `'close'`. `control`
   * frames (`sendRequest`, `broadcastControl`'s own equivalent here) stay
   * direct `socket.write()` calls: they are low-volume and, for `create`,
   * already round-trip-awaited, so there is nothing for a queue to protect.
   */
  inputQueue: QueuedSocketWriter;
};

/** Bytes of queued-but-unsent pty input a backpressured peer may hold before the oldest is dropped. */
const INPUT_QUEUE_CAP_BYTES = 8 * 1024 * 1024;

export function createBrokerClient(deps: BrokerClientDeps): BrokerClient {
  const {
    userDataDir,
    appVersion,
    isPackaged,
    log = () => {},
    spawnBrokerProcess,
    connectSocket = (p) => net.connect(p),
  } = deps;

  const brokerDir = join(userDataDir, 'broker');

  function getBrokerScript(): string {
    return join(__dirname, 'broker.js').replace('app.asar', 'app.asar.unpacked');
  }

  const buildId = deps.buildId ?? fingerprintFile(getBrokerScript());
  const socketName = brokerSocketName(appVersion, buildId, isPackaged);
  const socketPath = join(brokerDir, socketName);
  const logPath = join(brokerDir, `${appVersion}${isPackaged ? '' : '-dev'}.log`);

  let status: BrokerStatus = { mode: 'broker' };
  let primary: Peer | null = null;
  const legacy = new Map<string, Peer>();
  let legacyKeySeq = 0;

  /** Which broker owns each pty and each session — the routing table for everything below. */
  const ptyOwner = new Map<string, Peer>();
  const sessionOwner = new Map<string, Peer>();
  const ptySession = new Map<string, string>();

  let nextRequestId = 1;
  const pendingRequests = new Map<
    number,
    {
      resolve: (value: ControlReply) => void;
      reject: (err: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  const dataListeners = new Set<(ptyId: string, bytes: Uint8Array) => void>();
  const exitListeners = new Set<(ptyId: string, exitCode: number, signal?: number) => void>();

  function defaultSpawnBroker(scriptPath: string, args: string[], logFd: number): ChildProcess {
    return spawn(process.execPath, [scriptPath, ...args], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      },
    });
  }

  function peers(): Peer[] {
    return [...(primary ? [primary] : []), ...legacy.values()];
  }

  async function sendRequest<T extends ControlReply = ControlReply>(
    msg: ControlMessage & { id?: number },
    timeoutMs = 5000,
    target: Peer | null = primary,
  ): Promise<T> {
    if (!target || target.socket.destroyed) {
      throw new Error('Broker socket not connected');
    }

    const id = nextRequestId++;
    msg.id = id;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Broker request ${msg.t} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      pendingRequests.set(id, {
        resolve: resolve as (value: ControlReply) => void,
        reject,
        timeout,
      });

      try {
        target.socket.write(encodeControl(msg));
      } catch (err) {
        clearTimeout(timeout);
        pendingRequests.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function forgetPty(ptyId: string): void {
    const owner = ptyOwner.get(ptyId);
    owner?.ptys.delete(ptyId);
    ptyOwner.delete(ptyId);
    const sessionId = ptySession.get(ptyId);
    ptySession.delete(ptyId);
    if (sessionId !== undefined && sessionOwner.get(sessionId) === owner) sessionOwner.delete(sessionId);
  }

  function recordPty(peer: Peer, ptyId: string, sessionId: string): void {
    peer.ptys.add(ptyId);
    ptyOwner.set(ptyId, peer);
    ptySession.set(ptyId, sessionId);
    sessionOwner.set(sessionId, peer);
  }

  /**
   * Ask a legacy broker to go away once it has nothing left to serve. Without
   * this it would live forever: our own connection counts as a client, so its
   * idle exit never fires.
   */
  function retireLegacy(peer: Peer): void {
    if (!legacy.has(peer.path)) return;
    legacy.delete(peer.path);
    log(`[broker] legacy broker at ${peer.path} has no sessions left, shutting it down`);
    try {
      peer.socket.write(encodeControl({ t: 'shutdown', id: nextRequestId++ }), () => peer.socket.destroy());
    } catch {
      peer.socket.destroy();
    }
  }

  function handleIncomingFrame(peer: Peer, frame: Frame): void {
    if (frame.type === 0x00) {
      const msg = frame.message;
      if (msg.t === 'reply' && msg.id !== undefined) {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(msg.id);
          pending.resolve(msg);
        }
      } else if (msg.t === 'exit') {
        forgetPty(msg.ptyId);
        for (const l of exitListeners) {
          l(msg.ptyId, msg.exitCode, msg.signal);
        }
        if (peer.legacy && peer.ptys.size === 0) retireLegacy(peer);
      }
    } else if (frame.type === 0x01) {
      for (const l of dataListeners) {
        l(frame.ptyId, frame.data);
      }
    }
  }

  async function tryConnect(targetPath: string, timeoutMs: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const s = connectSocket(targetPath);

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          s.destroy();
          reject(new Error(`Connection to ${targetPath} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      s.once('connect', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(s);
        }
      });

      s.once('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          s.destroy();
          reject(err);
        }
      });
    });
  }

  type Handshake = { stale: boolean; buildId: string | undefined };

  /**
   * `hello` on a fresh socket; `null` on a protocol mismatch, a garbled reply,
   * or silence. A broker running code from before `stale`/`buildId` existed
   * answers without them, which reads as a healthy broker of unknown build —
   * exactly right for a legacy one.
   */
  async function attemptHandshake(s: net.Socket, timeoutMs = 1000): Promise<Handshake | null> {
    const decoder = createFrameDecoder();
    return new Promise((resolve) => {
      let settled = false;

      const finish = (result: Handshake | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        s.removeListener('data', onData);
        resolve(result);
      };

      const timer = setTimeout(() => finish(null), timeoutMs);

      const onData = (chunk: Buffer): void => {
        try {
          const frames = decoder.push(chunk);
          for (const f of frames) {
            if (f.type === 0x00 && f.message.t === 'reply' && f.message.id === 1) {
              if (f.message.ok !== true) {
                finish(null);
                return;
              }
              const reply = f.message as { stale?: unknown; buildId?: unknown };
              finish({
                stale: reply.stale === true,
                buildId: typeof reply.buildId === 'string' ? reply.buildId : undefined,
              });
              return;
            }
          }
        } catch {
          finish(null);
        }
      };

      s.on('data', onData);

      try {
        s.write(
          encodeControl({
            t: 'hello',
            id: 1,
            protocol: PROTOCOL,
            appVersion,
            pid: process.pid,
            buildId,
          }),
        );
      } catch {
        finish(null);
      }
    });
  }

  /** Connect and shake hands, or `null` (with the socket destroyed) if either fails. */
  async function connectExisting(
    path: string,
    connectTimeoutMs: number,
  ): Promise<{ socket: net.Socket; handshake: Handshake } | null> {
    let s: net.Socket;
    try {
      s = await tryConnect(path, connectTimeoutMs);
    } catch {
      return null;
    }
    const handshake = await attemptHandshake(s, 1000);
    if (!handshake) {
      s.destroy();
      return null;
    }
    return { socket: s, handshake };
  }

  function attach(peer: Peer): void {
    const decoder = createFrameDecoder();

    peer.socket.on('data', (chunk) => {
      try {
        const frames = decoder.push(chunk);
        for (const frame of frames) {
          handleIncomingFrame(peer, frame);
        }
      } catch (err) {
        log(`[broker] decoder error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    peer.socket.on('close', () => {
      log(`[broker] ${peer.legacy ? 'legacy ' : ''}broker socket closed (${peer.path})`);
      if (primary === peer) primary = null;
      legacy.delete(peer.path);
      peer.inputQueue.dispose();
      for (const ptyId of [...peer.ptys]) forgetPty(ptyId);
    });

    peer.socket.on('error', (err) => {
      log(`[broker] socket error: ${err.message}`);
    });
  }

  function inputQueueFor(socket: net.Socket): QueuedSocketWriter {
    return createQueuedSocketWriter(socket, {
      capBytes: INPUT_QUEUE_CAP_BYTES,
      onOverflow: (droppedBytes) =>
        log(`[broker] input queue overflow: dropped ${droppedBytes} bytes of unsent pty input`),
    });
  }

  function adoptPrimary(socket: net.Socket): Peer {
    const peer: Peer = {
      path: socketPath,
      socket,
      legacy: false,
      ptys: new Set(),
      inputQueue: inputQueueFor(socket),
    };
    primary = peer;
    attach(peer);
    return peer;
  }

  function adoptLegacy(path: string, socket: net.Socket): Peer {
    const peer: Peer = {
      path,
      socket,
      legacy: true,
      ptys: new Set(),
      inputQueue: inputQueueFor(socket),
    };
    legacy.set(path, peer);
    attach(peer);
    return peer;
  }

  /**
   * The stale primary stops taking new ptys but keeps serving the ones it has.
   *
   * It is asked to `retire` FIRST — to close its listener and move to a
   * `-retired-<pid>` path — and only then is a fresh broker spawned on the
   * original path. The order is load-bearing: Node unlinks a Unix socket's file
   * when the server that bound it closes, so a stale broker that closed *after*
   * the successor bound the same path would delete the successor's socket.
   * Retiring also leaves the old broker reachable by the next app start, which
   * finds `-retired-` sockets like any other legacy `.sock`.
   */
  async function retireStalePrimary(): Promise<void> {
    if (!primary) return;
    const peer = primary;
    primary = null;
    peer.legacy = true;
    try {
      const reply = await sendRequest({ t: 'retire' }, 5000, peer);
      const retiredPath = reply.ok ? reply['socketPath'] : undefined;
      if (typeof retiredPath === 'string') {
        peer.path = retiredPath;
      } else {
        log(`[broker] stale broker declined to retire; its socket path will be taken over`);
        peer.path = `${peer.path}#${++legacyKeySeq}`;
      }
    } catch (err) {
      log(`[broker] retire failed: ${err instanceof Error ? err.message : String(err)}`);
      peer.path = `${peer.path}#${++legacyKeySeq}`;
    }
    legacy.set(peer.path, peer);
    if (peer.ptys.size === 0) retireLegacy(peer);
  }

  /** Spawn a broker on `socketPath` and adopt it as primary; `false` after every attempt fails. */
  async function spawnFresh(): Promise<boolean> {
    const spawner = spawnBrokerProcess ?? defaultSpawnBroker;
    const script = getBrokerScript();
    const args = [
      '--socket',
      socketPath,
      '--user-data',
      userDataDir,
      '--version',
      appVersion,
      '--build-id',
      buildId,
    ];

    let logFd = 1;
    try {
      logFd = openSync(logPath, 'a');
    } catch {
      // Use stdout
    }

    const maxAttempts = deps.spawnMaxAttempts ?? 3;
    const connectTimeout = deps.spawnConnectTimeoutMs ?? 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log(`[broker] spawning broker attempt ${attempt}/${maxAttempts}`);
        const child = spawner(script, args, logFd);
        child.unref?.();

        // Retry connect every 50ms up to connectTimeout
        const deadline = Date.now() + connectTimeout;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
          const found = await connectExisting(socketPath, 300);
          if (found) {
            adoptPrimary(found.socket);
            log(`[broker] spawned and connected successfully on ${socketPath}`);
            return true;
          }
        }
      } catch (err) {
        log(`[broker] spawn attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log(`[broker] failed to start broker after ${maxAttempts} attempts`);
    return false;
  }

  /** `list` one broker and record what it owns. */
  async function syncPeerSessions(peer: Peer): Promise<BrokerSessionInfo[]> {
    try {
      const reply = await sendRequest({ t: 'list' }, 5000, peer);
      const raw =
        (reply.ok ? (reply['sessions'] as Omit<BrokerSessionInfo, 'legacy'>[] | undefined) : undefined) ??
        [];
      // The wire reply carries no `legacy` bit — the server doesn't know it
      // is a legacy peer, only this client does, from which `Peer` answered.
      const list = raw.map((s) => ({ ...s, legacy: peer.legacy }));
      for (const s of list) recordPty(peer, s.ptyId, s.sessionId);
      return list;
    } catch {
      return [];
    }
  }

  /**
   * Every other `.sock` in the broker dir is a broker from another build — a
   * previous install, or a retired one from this build. Adopt the live ones so
   * their terminals reattach; unlink the dead ones; shut down the empty ones.
   */
  async function probeLegacyBrokers(): Promise<void> {
    try {
      if (!existsSync(brokerDir)) return;
      const entries = readdirSync(brokerDir);
      for (const entry of entries) {
        if (!entry.endsWith('.sock') || entry === socketName) continue;
        const legacyPath = join(brokerDir, entry);
        const found = await connectExisting(legacyPath, 500);
        if (!found) {
          // Dead legacy socket, unlink
          try {
            unlinkSync(legacyPath);
          } catch {
            // Ignore
          }
          continue;
        }
        const peer = adoptLegacy(legacyPath, found.socket);
        const list = await syncPeerSessions(peer);
        log(`[broker] connected to legacy broker at ${legacyPath} (${list.length} session(s))`);
        if (list.length === 0) retireLegacy(peer);
      }
    } catch {
      // Ignore
    }
  }

  async function connectOrSpawn(): Promise<boolean> {
    if (process.env['MSTUDIO_PTY_INPROC'] === '1') {
      status = { mode: 'inproc', reason: 'MSTUDIO_PTY_INPROC=1' };
      return false;
    }

    if (Buffer.byteLength(socketPath) >= 104) {
      status = { mode: 'inproc', reason: 'socket path too long' };
      log(`[broker] socket path too long (${socketPath}), falling back to in-process`);
      return false;
    }

    mkdirSync(brokerDir, { mode: 0o700, recursive: true });

    // Step 1: Try connecting to existing socket (1s handshake timeout per decision #3)
    const existing = await connectExisting(socketPath, 500);
    if (existing) {
      if (!existing.handshake.stale) {
        adoptPrimary(existing.socket);
        log(`[broker] connected to existing broker on ${socketPath}`);
        return true;
      }
      /*
        Same build, but the broker says it can no longer spawn — its bundle was
        replaced in place under it. Keep its sessions reachable as a legacy
        peer, have it step off the path, and start a fresh broker there.
      */
      log(`[broker] existing broker on ${socketPath} is stale, keeping its sessions and respawning`);
      adoptPrimary(existing.socket);
      await syncPeerSessions(primary!);
      await retireStalePrimary();
    }

    // Step 2: Spawn broker process, with up to 3 retries (decision #1)
    if (await spawnFresh()) return true;

    status = { mode: 'inproc', reason: 'failed to spawn or connect to broker' };
    log(`[broker] falling back to in-process`);
    return false;
  }

  return {
    async init(): Promise<void> {
      await connectOrSpawn();
      await probeLegacyBrokers();
    },

    getStatus(): BrokerStatus {
      return status;
    },

    /** Something is reachable — the primary, or a legacy broker still serving old ptys. */
    isAlive(): boolean {
      return (primary !== null && !primary.socket.destroyed) || legacy.size > 0;
    },

    async createPty(options): Promise<{ ok: true; ptyId: string; pid: number } | { ok: false; message: string }> {
      if (!primary && !(await spawnFresh())) {
        return { ok: false, message: 'The terminal backend is not running and could not be restarted.' };
      }

      const request = (): Promise<ControlReply> =>
        sendRequest({
          t: 'create',
          sessionId: options.sessionId,
          cwd: options.cwd,
          cols: options.cols,
          rows: options.rows,
          env: options.env,
          initialInput: options.initialInput,
        });

      try {
        let reply = await request();

        if (!reply.ok && reply.code === 'stale-broker') {
          /*
            The broker outlived its build (see broker/staleness.ts). Its
            existing ptys keep working through the demoted connection; new ones
            need a broker started from the bundle now on disk. One retry: if the
            respawn fails too, the user gets the broker's own explanation plus
            the one thing that always works.
          */
          log(`[broker] primary is stale: ${reply.message} — respawning`);
          await retireStalePrimary();
          if (await spawnFresh()) {
            reply = await request();
          } else {
            return { ok: false, message: `${reply.message} Restart Midnite Studio to start a fresh one.` };
          }
        }

        if (reply.ok) {
          const ptyId = reply['ptyId'] as string;
          if (primary) recordPty(primary, ptyId, options.sessionId);
          return { ok: true, ptyId, pid: reply['pid'] as number };
        }
        return { ok: false, message: reply.message };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },

    writePty(ptyId: string, data: string): void {
      const target = ptyOwner.get(ptyId) ?? primary;
      if (target && !target.socket.destroyed) {
        target.inputQueue.write(encodeData(ptyId, new TextEncoder().encode(data)));
      }
    },

    async resizePty(ptyId: string, cols: number, rows: number): Promise<boolean> {
      try {
        const reply = await sendRequest(
          {
            t: 'resize',
            ptyId,
            cols,
            rows,
          },
          5000,
          ptyOwner.get(ptyId) ?? primary,
        );
        return reply.ok === true;
      } catch {
        return false;
      }
    },

    async killPty(ptyId: string): Promise<boolean> {
      try {
        const reply = await sendRequest({ t: 'kill', ptyId }, 5000, ptyOwner.get(ptyId) ?? primary);
        return reply.ok === true;
      } catch {
        return false;
      }
    },

    /** Every live pty across every connected broker, primary first. */
    async listSessions(): Promise<BrokerSessionInfo[]> {
      const all: BrokerSessionInfo[] = [];
      for (const peer of peers()) {
        if (peer.socket.destroyed) continue;
        all.push(...(await syncPeerSessions(peer)));
      }
      return all;
    },

    async snapshot(sessionId: string): Promise<Uint8Array> {
      // The broker holding the live pty has the freshest bytes; the primary can
      // still answer for a dead session from the scrollback it flushed to disk.
      const target = sessionOwner.get(sessionId) ?? primary;
      if (!target || target.socket.destroyed) return new Uint8Array(0);
      try {
        const reply = await sendRequest({ t: 'snapshot', sessionId }, 5000, target);
        if (reply.ok && reply['bytesBase64']) {
          return new Uint8Array(Buffer.from(reply['bytesBase64'] as string, 'base64'));
        }
      } catch {
        // Fall back to empty
      }
      return new Uint8Array(0);
    },

    /**
     * Fire-and-forget, no `id` — a reply with no id is dropped by
     * `handleIncomingFrame` above rather than mismatched, and this is cleanup
     * that already happened locally (`dropScrollback`'s caller has moved on);
     * nothing here should block on the broker's answer, only ask for it.
     * Grouped by owning peer, same as `snapshot`, since a legacy handover can
     * leave sessions split across brokers.
     */
    forgetScrollback(sessionIds: string[]): void {
      const byTarget = new Map<Peer, string[]>();
      for (const sessionId of sessionIds) {
        const target = sessionOwner.get(sessionId) ?? primary;
        if (!target || target.socket.destroyed) continue;
        const list = byTarget.get(target) ?? [];
        list.push(sessionId);
        byTarget.set(target, list);
      }
      for (const [target, ids] of byTarget) {
        try {
          target.socket.write(encodeControl({ t: 'forget', sessionIds: ids }));
        } catch {
          // Ignore — a dead socket has nothing left to forget for.
        }
      }
    },

    async flush(): Promise<void> {
      for (const peer of peers()) {
        if (peer.socket.destroyed) continue;
        try {
          await sendRequest({ t: 'flush' }, 5000, peer);
        } catch {
          // Ignore
        }
      }
    },

    async disconnect(): Promise<void> {
      for (const peer of peers()) {
        if (!peer.socket.destroyed) {
          try {
            await sendRequest({ t: 'detach' }, 5000, peer);
          } catch {
            // Ignore
          }
          peer.socket.destroy();
        }
      }
      primary = null;
      legacy.clear();
      ptyOwner.clear();
      sessionOwner.clear();
      ptySession.clear();
    },

    onData(listener: (ptyId: string, bytes: Uint8Array) => void): () => void {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    },

    onExit(listener: (ptyId: string, exitCode: number, signal?: number | undefined) => void): () => void {
      exitListeners.add(listener);
      return () => exitListeners.delete(listener);
    },
  };
}
