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

export function demoApiStatus(): DemoApiStatus {
  return server !== null && port !== null ? { running: true, port } : { running: false };
}

/** Idempotent: starting an already-running server answers its existing port. */
export function startDemoApi(): Promise<DemoApiStatus> {
  if (server !== null && port !== null) return Promise.resolve({ running: true, port });

  return new Promise((resolve, reject) => {
    const next = createServer((req, res) => {
      void handleDemoRequest(req, res).catch(() => {
        // A throw here would be an unhandled rejection taking main down for a
        // malformed request. The server has no business crashing the app.
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error.' }));
      });
    });

    next.once('error', (error) => {
      next.close();
      reject(error);
    });

    next.listen(0, BIND_HOST, () => {
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
export function stopDemoApi(): Promise<void> {
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
