import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearHistory, historyStats, pruneHistory } from './history-retention';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 27);
let root: string;

async function put(rel: string, bytes: number, ageDays: number): Promise<void> {
  const path = join(root, rel);
  await writeFile(path, 'x'.repeat(bytes));
  const t = new Date(NOW - ageDays * DAY);
  await utimes(path, t, t);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'retention-'));
  for (const d of ['scrollback', 'session-history', 'logs', 'chats']) await mkdir(join(root, d));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('pruneHistory', () => {
  it('deletes an 8-day-old transcript under a 7-day limit and keeps a live session', async () => {
    await put('session-history/old.bin', 10, 8);
    await put('session-history/fresh.bin', 10, 2);
    await put('scrollback/live.bin', 10, 30); // old but live
    await put('scrollback/dead.bin', 10, 30);
    const out = await pruneHistory(root, { days: 7, liveIds: new Set(['live']), now: NOW });
    expect(out).toEqual({ files: 2, bytes: 20, transcriptIds: ['old'] });
    expect(await readdir(join(root, 'session-history'))).toEqual(['fresh.bin']);
    expect(await readdir(join(root, 'scrollback'))).toEqual(['live.bin']);
  });

  it('keeps everything when the limit is null, and never touches chats', async () => {
    await put('session-history/old.bin', 10, 400);
    await put('chats/c.json', 10, 400);
    expect(await pruneHistory(root, { days: null, liveIds: new Set(), now: NOW })).toEqual({ files: 0, bytes: 0 });
    await pruneHistory(root, { days: 1, liveIds: new Set(), now: NOW });
    expect(await readdir(join(root, 'chats'))).toEqual(['c.json']);
  });
});

describe('historyStats and clearHistory', () => {
  it('count and delete scrollback, transcripts and logs, never live sessions or chats', async () => {
    await put('scrollback/live.bin', 5, 1);
    await put('scrollback/dead.bin', 7, 1);
    await put('session-history/a.bin', 11, 1);
    await put('logs/main.log', 13, 1);
    await put('chats/c.json', 17, 1);
    const live = new Set(['live']);
    expect(await historyStats(root, live)).toEqual({ files: 3, bytes: 31 });
    expect(await clearHistory(root, live)).toEqual({ files: 3, bytes: 31 });
    expect(await historyStats(root, live)).toEqual({ files: 0, bytes: 0 });
    expect(await readdir(join(root, 'scrollback'))).toEqual(['live.bin']);
    expect(await readdir(join(root, 'chats'))).toEqual(['c.json']);
  });

  it('answers zero for a profile with no history directories', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'retention-empty-'));
    expect(await historyStats(empty, new Set())).toEqual({ files: 0, bytes: 0 });
    await rm(empty, { recursive: true });
  });
});
