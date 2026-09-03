import { connect } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { demoApiStatus, startDemoApi, stopDemoApi } from './server';
import { collectionCount, resetDemoStore } from './store';

/**
 * The server's own lifecycle — start, stop, and the races between them.
 *
 * Its own file rather than a `describe` inside `demo-api.test.ts`, because
 * these tests stop and restart the module-level server that file's shared
 * fixture depends on. Sharing a file would make every other test in it
 * order-dependent on this one, which is the kind of coupling that only shows
 * up months later as a flake.
 */

afterEach(async () => {
  await stopDemoApi();
  resetDemoStore();
});

/** True when something is listening on 127.0.0.1:port. */
async function portAnswers(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_000, () => done(false));
    socket.once('error', () => done(false));
    socket.once('connect', () => done(true));
  });
}

describe('overlapping starts', () => {
  it('shares one server, leaking none', async () => {
    /*
      Both calls pass the `server !== null` early-out before the first await.
      Without an in-flight guard both bind a socket, module state names
      whichever resolved last, and the other stays listening for the life of
      the process with no handle left to close it.
    */
    const [first, second] = await Promise.all([startDemoApi(), startDemoApi()]);
    expect(first).toEqual(second);
    expect(first.running && second.running && first.port === second.port).toBe(true);

    await stopDemoApi();
    expect(demoApiStatus()).toEqual({ running: false });
    expect(first.running && (await portAnswers(first.port))).toBe(false);
  });

  it('answers the existing port once running', async () => {
    const first = await startDemoApi();
    const second = await startDemoApi();
    expect(second).toEqual(first);
  });
});

describe('a stop landing mid-start', () => {
  it('does not leave a "stopped" server listening', async () => {
    /*
      Without the wait, `stopDemoApi` clears module state and the pending
      `listen` callback then re-assigns it — leaving a server that `status`
      reports as running and nothing can close.
    */
    const pending = startDemoApi();
    const stopped = stopDemoApi();
    const started = await pending;
    await stopped;

    expect(demoApiStatus()).toEqual({ running: false });
    expect(started.running && (await portAnswers(started.port))).toBe(false);
  });
});

describe('restart', () => {
  it('comes back on a fresh port after a stop', async () => {
    const first = await startDemoApi();
    await stopDemoApi();
    const second = await startDemoApi();
    expect(second.running).toBe(true);
    // Ephemeral, so the port is whatever the OS hands out — the point is that
    // a stopped server does not block a later start.
    expect(first.running && second.running).toBe(true);
  });

  it('forgets its data on stop — nothing here is persisted', async () => {
    const started = await startDemoApi();
    const base = started.running ? `http://127.0.0.1:${started.port}` : '';
    await fetch(`${base}/items`, { method: 'POST', body: '{"n":1}' });
    expect(collectionCount()).toBe(1);
    await stopDemoApi();
    expect(collectionCount()).toBe(0);
  });
});

describe('reads do not create collections', () => {
  it('a GET of an unknown collection leaves nothing behind', async () => {
    const started = await startDemoApi();
    const base = started.running ? `http://127.0.0.1:${started.port}` : '';

    const read = await fetch(`${base}/never-written`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { total: number }).total).toBe(0);
    /*
      `DEMO_COLLECTION_CAP` bounds records *within* a collection, but nothing
      bounds how many collections exist — so a create-on-read would let a
      workflow looping `GET /{{n.id}}` grow main's heap one permanent empty
      array at a time until the server is stopped.
    */
    expect(collectionCount()).toBe(0);

    await fetch(`${base}/written`, { method: 'POST', body: '{}' });
    expect(collectionCount()).toBe(1);
  });
});

describe('an over-size body', () => {
  it('answers the honest 400 rather than resetting the connection', async () => {
    const started = await startDemoApi();
    const base = started.running ? `http://127.0.0.1:${started.port}` : '';

    /*
      Returning out of the `for await` called the iterator's `return()`, which
      destroys the request stream — and writing a response on a destroyed
      request reaches the client as a connection reset, so a workflow POSTing
      past the cap recorded a transport failure instead of the 400 the routing
      table advertises.
    */
    const res = await fetch(`${base}/items`, {
      method: 'POST',
      body: JSON.stringify({ big: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Request body too large.');
  });
});
