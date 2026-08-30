import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, unlinkSync } from 'node:fs';
import * as net from 'node:net';
import { join } from 'node:path';

import {
  createFrameDecoder,
  encodeControl,
  encodeData,
  PROTOCOL,
  type ControlMessage,
  type ControlReply,
} from '../broker/protocol';

export type BrokerStatus = {
  mode: 'broker' | 'inproc';
  reason?: string;
};

export type BrokerClientDeps = {
  userDataDir: string;
  appVersion: string;
  isPackaged: boolean;
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
  listLegacySessions: () => Promise<BrokerSessionInfo[]>;
  snapshot: (sessionId: string) => Promise<Uint8Array>;
  flush: () => Promise<void>;
  disconnect: () => Promise<void>;
  onData: (listener: (ptyId: string, bytes: Uint8Array) => void) => () => void;
  onExit: (listener: (ptyId: string, exitCode: number, signal?: number | undefined) => void) => () => void;
  isAlive: () => boolean;
};

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
  const socketName = `${appVersion}${isPackaged ? '' : '-dev'}.sock`;
  const socketPath = join(brokerDir, socketName);
  const logPath = join(brokerDir, `${appVersion}${isPackaged ? '' : '-dev'}.log`);

  let status: BrokerStatus = { mode: 'broker' };
  let socket: net.Socket | null = null;
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

  const legacyBrokers = new Map<string, net.Socket>();

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

  function getBrokerScript(): string {
    return join(__dirname, 'broker.js').replace('app.asar', 'app.asar.unpacked');
  }

  async function sendRequest<T extends ControlReply = ControlReply>(
    msg: ControlMessage & { id?: number },
    timeoutMs = 5000,
  ): Promise<T> {
    if (!socket || socket.destroyed) {
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
        socket!.write(encodeControl(msg));
      } catch (err) {
        clearTimeout(timeout);
        pendingRequests.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function handleIncomingFrame(
    frame: { type: 0x00; message: ControlMessage } | { type: 0x01; ptyId: string; data: Uint8Array },
  ): void {
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
        for (const l of exitListeners) {
          l(msg.ptyId, msg.exitCode, msg.signal);
        }
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

  async function attemptHandshake(s: net.Socket, timeoutMs = 1000): Promise<boolean> {
    const decoder = createFrameDecoder();
    return new Promise((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);

      const onData = (chunk: Buffer) => {
        try {
          const frames = decoder.push(chunk);
          for (const f of frames) {
            if (f.type === 0x00 && f.message.t === 'reply' && f.message.id === 1) {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                s.removeListener('data', onData);
                resolve(f.message.ok === true);
              }
            }
          }
        } catch {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(false);
          }
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
          }),
        );
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      }
    });
  }

  async function probeLegacyBrokers(): Promise<void> {
    try {
      if (!existsSync(brokerDir)) return;
      const entries = readdirSync(brokerDir);
      for (const entry of entries) {
        if (entry.endsWith('.sock') && entry !== socketName) {
          const legacyPath = join(brokerDir, entry);
          try {
            const legacySocket = await tryConnect(legacyPath, 500);
            const decoder = createFrameDecoder();
            legacySocket.on('data', (chunk) => {
              try {
                const frames = decoder.push(chunk);
                for (const f of frames) handleIncomingFrame(f);
              } catch {
                // Ignore
              }
            });
            legacyBrokers.set(legacyPath, legacySocket);
            log(`[broker] connected to legacy broker at ${legacyPath}`);
          } catch {
            // Dead legacy socket, unlink
            try {
              unlinkSync(legacyPath);
            } catch {
              // Ignore
            }
          }
        }
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
    try {
      const existingSocket = await tryConnect(socketPath, 500);
      const ok = await attemptHandshake(existingSocket, 1000);
      if (ok) {
        socket = existingSocket;
        setupSocket(socket);
        log(`[broker] connected to existing broker on ${socketPath}`);
        return true;
      } else {
        existingSocket.destroy();
        log(`[broker] handshake failed with existing broker on ${socketPath}, respawning`);
      }
    } catch {
      // Socket not listening or stale
    }

    // Step 2: Spawn broker process, with up to 3 retries (decision #1)
    const spawner = spawnBrokerProcess ?? defaultSpawnBroker;
    const script = getBrokerScript();
    const args = ['--socket', socketPath, '--user-data', userDataDir, '--version', appVersion];

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
          try {
            const newSocket = await tryConnect(socketPath, 300);
            const ok = await attemptHandshake(newSocket, 1000);
            if (ok) {
              socket = newSocket;
              setupSocket(socket);
              log(`[broker] spawned and connected successfully on ${socketPath}`);
              return true;
            } else {
              newSocket.destroy();
            }
          } catch {
            // Retry
          }
        }
      } catch (err) {
        log(`[broker] spawn attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    status = { mode: 'inproc', reason: 'failed to spawn or connect to broker' };
    log(`[broker] failed to start broker after 3 attempts, falling back to in-process`);
    return false;
  }

  function setupSocket(s: net.Socket): void {
    const decoder = createFrameDecoder();

    s.on('data', (chunk) => {
      try {
        const frames = decoder.push(chunk);
        for (const frame of frames) {
          handleIncomingFrame(frame);
        }
      } catch (err) {
        log(`[broker] decoder error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    s.on('close', () => {
      log('[broker] broker socket closed');
      socket = null;
    });

    s.on('error', (err) => {
      log(`[broker] socket error: ${err.message}`);
    });
  }

  return {
    async init(): Promise<void> {
      await connectOrSpawn();
      await probeLegacyBrokers();
    },

    getStatus(): BrokerStatus {
      return status;
    },

    isAlive(): boolean {
      return socket !== null && !socket.destroyed;
    },

    async createPty(options): Promise<{ ok: true; ptyId: string; pid: number } | { ok: false; message: string }> {
      try {
        const reply = await sendRequest({
          t: 'create',
          sessionId: options.sessionId,
          cwd: options.cwd,
          cols: options.cols,
          rows: options.rows,
          env: options.env,
          initialInput: options.initialInput,
        });

        if (reply.ok) {
          return { ok: true, ptyId: reply['ptyId'] as string, pid: reply['pid'] as number };
        } else {
          return { ok: false, message: reply.message };
        }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },

    writePty(ptyId: string, data: string): void {
      if (socket && !socket.destroyed) {
        try {
          socket.write(encodeData(ptyId, new TextEncoder().encode(data)));
        } catch {
          // Ignore
        }
      }
    },

    async resizePty(ptyId: string, cols: number, rows: number): Promise<boolean> {
      try {
        const reply = await sendRequest({
          t: 'resize',
          ptyId,
          cols,
          rows,
        });
        return reply.ok === true;
      } catch {
        return false;
      }
    },

    async killPty(ptyId: string): Promise<boolean> {
      try {
        const reply = await sendRequest({ t: 'kill', ptyId });
        return reply.ok === true;
      } catch {
        return false;
      }
    },

    async listSessions(): Promise<BrokerSessionInfo[]> {
      if (!socket || socket.destroyed) return [];
      try {
        const reply = await sendRequest({ t: 'list' });
        return (reply.ok ? (reply['sessions'] as BrokerSessionInfo[]) : []) ?? [];
      } catch {
        return [];
      }
    },

    async listLegacySessions(): Promise<BrokerSessionInfo[]> {
      const all: BrokerSessionInfo[] = [];
      for (const [_, legacySocket] of legacyBrokers.entries()) {
        try {
          const req = encodeControl({ t: 'list', id: 999 });
          // Send request and await reply
          legacySocket.write(req);
        } catch {
          // Ignore
        }
      }
      return all;
    },

    async snapshot(sessionId: string): Promise<Uint8Array> {
      if (!socket || socket.destroyed) return new Uint8Array(0);
      try {
        const reply = await sendRequest({
          t: 'snapshot',
          sessionId,
        });
        if (reply.ok && reply['bytesBase64']) {
          return new Uint8Array(Buffer.from(reply['bytesBase64'] as string, 'base64'));
        }
      } catch {
        // Fall back to empty
      }
      return new Uint8Array(0);
    },

    async flush(): Promise<void> {
      if (socket && !socket.destroyed) {
        try {
          await sendRequest({ t: 'flush' });
        } catch {
          // Ignore
        }
      }
    },

    async disconnect(): Promise<void> {
      if (socket && !socket.destroyed) {
        try {
          await sendRequest({ t: 'detach' });
        } catch {
          // Ignore
        }
        socket.destroy();
        socket = null;
      }
      for (const [_, s] of legacyBrokers) {
        s.destroy();
      }
      legacyBrokers.clear();
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
