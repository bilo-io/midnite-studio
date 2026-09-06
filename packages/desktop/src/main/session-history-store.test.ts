import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_CLOSED_SESSIONS, type ClosedSession } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createSessionHistoryStore,
  evictClosed,
  parseHistoryState,
  transcriptPath,
} from './session-history-store';
import { safeId, scrollbackPath } from './terminal-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-history-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

const closed = (over: Partial<ClosedSession> = {}): ClosedSession => ({
  id: 'sess-1',
  kind: 'shell',
  title: 'midnite',
  cwd: '/Users/x/Dev/midnite',
  repoId: 'repo:/Users/x/Dev/midnite',
  createdAt: 1_700_000_000_000,
  closedAt: 1_700_000_060_000,
  exitCode: 0,
  reason: 'closed',
  transcriptBytes: 0,
  ...over,
});

/** Put bytes where a live session's scrollback would be, ready to be moved. */
const seedScrollbackFile = async (dir: string, id: string, body: string): Promise<string> => {
  await mkdir(join(dir, 'scrollback'), { recursive: true });
  const path = scrollbackPath(dir, id);
  await writeFile(path, body);
  return path;
};

describe('session history store', () => {
  it('round-trips appended records newest-first', async () => {
    const dir = await tempDir();
    const store = createSessionHistoryStore(dir);

    await store.append(closed({ id: 'a', closedAt: 1 }), null);
    await store.append(closed({ id: 'b', closedAt: 2 }), null);
    await store.append(closed({ id: 'c', closedAt: 3 }), null);

    expect((await store.list()).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('survives a fresh store over the same directory', async () => {
    const dir = await tempDir();
    await createSessionHistoryStore(dir).append(closed({ id: 'a', reason: 'exited' }), null);

    const reopened = await createSessionHistoryStore(dir).list();
    expect(reopened).toHaveLength(1);
    expect(reopened[0]?.reason).toBe('exited');
  });

  it('moves the transcript rather than copying it, byte for byte', async () => {
    const dir = await tempDir();
    const store = createSessionHistoryStore(dir);
    const body = 'hello [31mworld[0m\n';
    const from = await seedScrollbackFile(dir, 'a', body);

    await store.append(closed({ id: 'a', transcriptBytes: body.length }), from);

    expect(Buffer.from(await store.transcript('a')).toString()).toBe(body);
    // The source is gone — a rename, not a copy.
    await expect(readFile(from)).rejects.toThrow();
  });

  it('replaces rather than doubles a record closed twice', async () => {
    const dir = await tempDir();
    const store = createSessionHistoryStore(dir);

    await store.append(closed({ id: 'a', exitCode: null }), null);
    await store.append(closed({ id: 'a', exitCode: 130 }), null);

    const rows = await store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.exitCode).toBe(130);
  });

  it('caps at 200 records AND 200 files', async () => {
    const dir = await tempDir();
    const store = createSessionHistoryStore(dir);

    for (let i = 0; i < MAX_CLOSED_SESSIONS + 1; i += 1) {
      const id = `sess-${i}`;
      const from = await seedScrollbackFile(dir, id, `output ${i}\n`);
      await store.append(closed({ id, closedAt: 1_700_000_000_000 + i }), from);
    }

    const rows = await store.list();
    expect(rows).toHaveLength(MAX_CLOSED_SESSIONS);
    // The evicted one is the oldest.
    expect(rows.map((r) => r.id)).not.toContain('sess-0');

    // The assertion that actually matters: the file went with the row. Phase 45
    // found the half-applied version of this cap twice.
    expect(await readdir(join(dir, 'session-history'))).toHaveLength(MAX_CLOSED_SESSIONS);
  });

  it('evictClosed trims the array and the files in one call', async () => {
    const dir = await tempDir();
    await mkdir(join(dir, 'session-history'), { recursive: true });
    const rows = [closed({ id: 'old' }), closed({ id: 'new' })];
    await Promise.all(rows.map((r) => writeFile(transcriptPath(dir, r.id), 'x')));

    const kept = await evictClosed(dir, rows, 1);

    expect(kept.map((r) => r.id)).toEqual(['new']);
    expect(await readdir(join(dir, 'session-history'))).toEqual(['new.bin']);
  });

  it('degrades to an empty history on a corrupt file rather than throwing', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'session-history.json'), '{ not json at all');

    await expect(createSessionHistoryStore(dir).list()).resolves.toEqual([]);
  });

  it('drops an unparseable row without losing the readable ones', () => {
    const parsed = parseHistoryState({
      version: 1,
      closed: [closed({ id: 'good' }), { id: 'bad', reason: 'vanished' }],
    });
    expect(parsed.map((r) => r.id)).toEqual(['good']);
  });

  it('returns a zero-length transcript for an id it has never seen', async () => {
    const store = createSessionHistoryStore(await tempDir());
    const bytes = await store.transcript('nobody');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(0);
  });

  it('purges one record and its transcript, and then all of them', async () => {
    const dir = await tempDir();
    const store = createSessionHistoryStore(dir);
    for (const id of ['a', 'b']) {
      await store.append(closed({ id }), await seedScrollbackFile(dir, id, id));
    }

    await store.purge('a');
    expect((await store.list()).map((r) => r.id)).toEqual(['b']);
    expect(await readdir(join(dir, 'session-history'))).toEqual(['b.bin']);

    await store.purge(null);
    expect(await store.list()).toEqual([]);
    expect(await readdir(join(dir, 'session-history'))).toEqual([]);
  });

  it('keeps a traversal-shaped id inside session-history/', async () => {
    const dir = await tempDir();
    const evil = '../../etc/passwd';
    expect(safeId(evil)).toBe('______etc_passwd');
    expect(transcriptPath(dir, evil)).toBe(join(dir, 'session-history', '______etc_passwd.bin'));

    const store = createSessionHistoryStore(dir);
    await store.append(closed({ id: evil }), await seedScrollbackFile(dir, evil, 'pwned'));
    expect(await readdir(join(dir, 'session-history'))).toEqual(['______etc_passwd.bin']);
  });
});
