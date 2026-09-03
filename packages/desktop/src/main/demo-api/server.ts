import { createServer, type Server } from 'node:http';

import type { DemoApiStatus } from '@midnite/studio-shared';

import { handleDemoRequest } from './routes';
import { resetDemoStore } from './store';

/**
 * The workflow demo API (Phase 43 Theme D): a real `node:http` CRUD server, so
 * an `http` node has something honest to call on a machine with no network.
 *
 * Two properties are load-bearing and neither is negotiable.
 *
 * **It binds `127.0.0.1`, never `0.0.0.0`.** This is a developer convenience
 * with no auth and no validation; it must be impossible to reach from another
 * machine, and the bind address is what guarantees that rather than a firewall
 * the user may not have.
 *
 * **It binds port 0.** A fixed port collides with whatever else the developer
 * is running, and this server's whole promise is that it takes no setup. The
 * real port is read from `server.address()` once `listening` fires and reported
 * back through `demoApiStatus()`; nothing hard-codes one.
 *
 * It is off by default and started explicitly — a server that starts itself
 * because you opened a view is a surprise, and on macOS it can raise a firewall
 * prompt nobody asked for.
 */

const BIND_HOST = '127.0.0.1';

let server: Server | null = null;
let port: number | null = null;
/*
  The in-flight start, so overlapping calls share one server.

  The `server !== null` early-out below is checked BEFORE the first await, so
  two overlapping `demo-api:start` invokes — a double-clicked button, or a
  double-invoked effect in dev — both passed it and both bound a socket. Module
  state then named whichever resolved last, and the other server stayed
  listening for the life of the process with no handle left to close it.
*/
let starting: Promise<DemoApiStatus> | null = null;

export function demoApiStatus(): DemoApiStatus {
  return server !== null && port !== null ? { running: true, port } : { running: false };
}

/** Idempotent: starting an already-running (or already-starting) server answers its port. */
export function startDemoApi(): Promise<DemoApiStatus> {
  if (server !== null && port !== null) return Promise.resolve({ running: true, port });
  if (starting !== null) return starting;

  starting = listenOnce().finally(() => {
    starting = null;
  });
  return starting;
}

function listenOnce(): Promise<DemoApiStatus> {
  return new Promise((resolve, reject) => {
    const next = createServer((req, res) => {
      void handleDemoRequest(req, res).catch(() => {
        // A throw here would be an unhandled rejection taking main down for a
        // malformed request. The server has no business crashing the app.
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error.' }));
      });
    });

    const onListenError = (error: Error) => {
      next.close();
      reject(error);
    };
    next.once('error', onListenError);

    next.listen(0, BIND_HOST, () => {
      /*
        Detached the moment we are listening. Left attached it can still fire
        later, and its body closes the socket while module `server`/`port` stay
        set — so `demoApiStatus()` would keep reporting a running server that
        answers nothing, and `startDemoApi()` would short-circuit on that same
        state with no way back short of an explicit stop.
      */
      next.off('error', onListenError);
      const address = next.address();
      if (address === null || typeof address === 'string') {
        next.close();
        reject(new Error('Demo API bound a socket with no port.'));
        return;
      }
      server = next;
      port = address.port;
      resolve({ running: true, port: address.port });
    });
  });
}

/**
 * Stop and forget everything it held.
 *
 * `closeAllConnections()` before `close()`: a keep-alive socket — which a
 * workflow's own `fetch` leaves behind — otherwise holds `close` open until it
 * times out, and on `before-quit` that is a visibly slow exit.
 */
export async function stopDemoApi(): Promise<void> {
  /*
    A stop landing mid-start has to wait for that start, or it clears module
    state and the pending `listen` callback then re-assigns it — leaving a
    "stopped" server listening and `demoApiStatus()` reporting it.
  */
  if (starting !== null) await starting.catch(() => undefined);
  return closeCurrent();
}

function closeCurrent(): Promise<void> {
  const current = server;
  server = null;
  port = null;
  resetDemoStore();
  if (!current) return Promise.resolve();

  return new Promise((resolve) => {
    current.closeAllConnections();
    current.close(() => resolve());
  });
}
