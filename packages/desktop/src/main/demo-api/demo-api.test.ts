import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startFixtureServer, type FixtureServer } from './fixture-server';
import { DEMO_COLLECTION_CAP, createRecord, listRecords, resetDemoStore } from './store';

let api: FixtureServer;

beforeAll(async () => {
  api = await startFixtureServer();
});

afterAll(async () => {
  await api.stop();
});

/**
 * `body` is deliberately loose: these tests assert on a server with no schema,
 * so a typed shape per collection would be fiction. Reads go through
 * bracket-and-cast at each use rather than an `any` the linter rejects.
 */
async function json(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const res = await fetch(`${api.baseUrl}${path}`, init);
  const text = await res.text();
  return {
    status: res.status,
    body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
    headers: res.headers,
  };
}

describe('demo API verbs', () => {
  it('creates with 201 and a Location, then reads back', async () => {
    const created = await json('/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'first' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('first');
    expect(created.headers.get('location')).toBe(`/items/${created.body.id}`);

    const read = await json(`/items/${created.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.title).toBe('first');
  });

  it('PUT replaces and PATCH merges — the whole point of shipping both', async () => {
    const created = await json('/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'a', tag: 'keep' }),
    });
    const id = created.body.id as string;

    const patched = await json(`/items/${id}`, { method: 'PATCH', body: JSON.stringify({ title: 'b' }) });
    expect(patched.body).toMatchObject({ title: 'b', tag: 'keep' });

    const put = await json(`/items/${id}`, { method: 'PUT', body: JSON.stringify({ title: 'c' }) });
    expect(put.body.title).toBe('c');
    expect(put.body.tag).toBeUndefined();
    // The three owned fields survive a replace; `id` especially, or every
    // reference a workflow holds would break on an update.
    expect(put.body.id).toBe(id);
    expect(put.body.createdAt).toBe(created.body.createdAt);
  });

  it('deletes with 204 and then 404s', async () => {
    const created = await json('/items', { method: 'POST', body: JSON.stringify({}) });
    const id = created.body.id as string;
    expect((await json(`/items/${id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await json(`/items/${id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await json(`/items/${id}`)).status).toBe(404);
  });

  it('answers HEAD with the GET headers and no body', async () => {
    const res = await fetch(`${api.baseUrl}/items`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(Number(res.headers.get('content-length'))).toBeGreaterThan(0);
    expect(await res.text()).toBe('');
  });

  it('creates a collection by writing to it — no configuration first', async () => {
    const created = await json('/anything-at-all', { method: 'POST', body: JSON.stringify({ n: 1 }) });
    expect(created.status).toBe(201);
    expect((await json('/anything-at-all')).body.total).toBe(1);
  });
});

describe('demo API errors', () => {
  it('400s unparseable JSON, and a body that is not an object', async () => {
    expect((await json('/items', { method: 'POST', body: '{oops' })).status).toBe(400);
    expect((await json('/items', { method: 'POST', body: '[1,2]' })).status).toBe(400);
  });

  it('405s an unknown method with an Allow header naming what is allowed', async () => {
    const onCollection = await json('/items', { method: 'DELETE' });
    expect(onCollection.status).toBe(405);
    expect(onCollection.headers.get('allow')).toBe('GET, POST, HEAD');

    const onRecord = await json('/items/some-id', { method: 'POST', body: '{}' });
    expect(onRecord.status).toBe(405);
    expect(onRecord.headers.get('allow')).toBe('GET, PUT, PATCH, DELETE, HEAD');
  });

  it('404s a path deeper than /:collection/:id', async () => {
    expect((await json('/items/one/two')).status).toBe(404);
  });

  it('sends application/json on every response that has a body', async () => {
    for (const path of ['/', '/items', '/items/missing']) {
      const res = await fetch(`${api.baseUrl}${path}`);
      expect(res.headers.get('content-type')).toBe('application/json');
    }
  });
});

describe('demo API query params', () => {
  beforeAll(async () => {
    for (const status of ['open', 'open', 'closed']) {
      await json('/tickets', { method: 'POST', body: JSON.stringify({ status }) });
    }
  });

  it('filters on an arbitrary field, so a QUERY-shaped GET has something to query', async () => {
    const open = await json('/tickets?status=open');
    expect(open.body.total).toBe(2);
    const records = open.body.records as { status: string }[];
    expect(records.every((record) => record.status === 'open')).toBe(true);
  });

  it('pages with limit and offset, reporting the unpaged total', async () => {
    const page = await json('/tickets?limit=1&offset=1');
    expect(page.body.records).toHaveLength(1);
    expect(page.body.total).toBe(3);
    expect(page.headers.get('x-total-count')).toBe('3');
  });
});

describe('demo API bind', () => {
  it('binds loopback only', () => {
    // The status port came from `server.address()`, and the address it was
    // bound to is the guarantee that nothing off this machine can reach an
    // unauthenticated CRUD server.
    expect(api.baseUrl.startsWith('http://127.0.0.1:')).toBe(true);
  });

  it('refuses a connection to the machine LAN address on that port', async () => {
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((iface) => iface && iface.family === 'IPv4' && !iface.internal);
    if (!lan) return; // A machine with no external interface has nothing to prove.

    const refused = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: lan.address, port: api.port });
      const done = (value: boolean) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(2_000, () => done(true)); // No listener answering is also a refusal.
      socket.once('error', () => done(true));
      socket.once('connect', () => done(false));
    });
    expect(refused).toBe(true);
  });
});

describe('demo store', () => {
  it('evicts the oldest past the per-collection cap', () => {
    resetDemoStore();
    for (let i = 0; i < DEMO_COLLECTION_CAP + 5; i += 1) createRecord('big', { i });
    const { records, total } = listRecords('big');
    expect(total).toBe(DEMO_COLLECTION_CAP);
    expect(records[0]).toMatchObject({ i: 5 });
    resetDemoStore();
  });

  it('owns id and createdAt — a body carrying its own is overwritten', () => {
    resetDemoStore();
    const record = createRecord('items', { id: 'mine', createdAt: 0, title: 't' });
    expect(record.id).not.toBe('mine');
    expect(record.createdAt).toBeGreaterThan(0);
    resetDemoStore();
  });
});
