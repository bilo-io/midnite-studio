import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ConnectionConfig } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createConnectionsStore, parseConnectionsState } from './connections-store';

const postgres: ConnectionConfig = {
  id: 'c1',
  name: 'Local Postgres',
  provider: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app_user',
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-db-connections-'));
});

describe('createConnectionsStore', () => {
  it('starts empty', async () => {
    const store = createConnectionsStore(dir);
    expect(await store.list()).toEqual([]);
    expect(await store.get('c1')).toBeNull();
  });

  it('saves, lists and re-reads across instances', async () => {
    const first = createConnectionsStore(dir);
    await first.save(postgres);

    const second = createConnectionsStore(dir);
    expect(await second.list()).toEqual([postgres]);
    expect(await second.get('c1')).toEqual(postgres);
  });

  it('never writes a password field — there is none on the shape at all', async () => {
    const store = createConnectionsStore(dir);
    await store.save(postgres);
    expect(JSON.stringify(await store.list())).not.toContain('password');
  });

  it('round-trips deleting a connection', async () => {
    const store = createConnectionsStore(dir);
    await store.save(postgres);
    await store.delete('c1');
    expect(await store.get('c1')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('overwrites an existing connection by id rather than duplicating it', async () => {
    const store = createConnectionsStore(dir);
    await store.save(postgres);
    await store.save({ ...postgres, name: 'Renamed' });
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('Renamed');
  });

  it('survives a corrupt file by starting empty', async () => {
    await writeFile(join(dir, 'db-connections.json'), '{ not json');
    const store = createConnectionsStore(dir);
    expect(await store.list()).toEqual([]);
  });
});

describe('parseConnectionsState', () => {
  it('returns nothing for shapes that are not a state object', () => {
    expect(parseConnectionsState(null)).toEqual({});
    expect(parseConnectionsState([])).toEqual({});
    expect(parseConnectionsState({ connections: 'no' })).toEqual({});
  });

  it('drops a record that does not validate against ConnectionConfigSchema', () => {
    const parsed = parseConnectionsState({
      connections: { c1: { id: 'c1', name: '', provider: 'postgres', database: 'app' } },
    });
    expect(parsed).toEqual({});
  });

  it('drops a record whose key does not match its own id', () => {
    const parsed = parseConnectionsState({ connections: { wrongKey: postgres } });
    expect(parsed).toEqual({});
  });

  it('keeps a SQLite-shaped connection with no host/port/username', () => {
    const sqlite: ConnectionConfig = {
      id: 'c2',
      name: 'Local SQLite',
      provider: 'sqlite',
      database: 'main',
      sqlitePath: '/tmp/app.db',
    };
    const parsed = parseConnectionsState({ connections: { c2: sqlite } });
    expect(parsed['c2']).toEqual(sqlite);
  });
});
