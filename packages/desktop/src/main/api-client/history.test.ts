import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearHistory, listHistory, MAX_HISTORY_ENTRIES, recordHistoryEntry, type HistoryRecordInput } from './history';

function makeInput(overrides: Partial<HistoryRecordInput> = {}): HistoryRecordInput {
  return {
    method: 'get',
    url: 'https://api.example.com/things?api_key=super-secret-token',
    status: 200,
    durationMs: 12.4,
    sizeBytes: 128,
    collectionId: 'coll.postman_collection.json',
    itemPath: ['Folder', 'Get thing'],
    environmentId: 'local.postman_environment.json',
    secretValues: { apiKey: 'super-secret-token' },
    ...overrides,
  };
}

async function readHistoryFileBytes(repoRoot: string): Promise<string> {
  return readFile(join(repoRoot, '.midnite', 'api', 'history.local.json'), 'utf8');
}

describe('history', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-history-')));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  describe('recording and listing', () => {
    it('records metadata only — no headers, no request body, no response body ever reach the file', async () => {
      const ok = await recordHistoryEntry(repoRoot, makeInput());
      expect(ok).toBe(true);

      const bytes = await readHistoryFileBytes(repoRoot);
      // The one query value that is a secret is rewritten; nothing else in
      // this fixture could carry a header or a body — the type itself has
      // no field for either, so this also proves there is nowhere for one to
      // hide.
      expect(bytes).not.toContain('super-secret-token');

      const listed = await listHistory(repoRoot);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]).toMatchObject({
        method: 'GET',
        status: 200,
        collectionId: 'coll.postman_collection.json',
        itemPath: ['Folder', 'Get thing'],
        environmentId: 'local.postman_environment.json',
      });
    });

    it('a query value matching a secret is rewritten to {{key}}', async () => {
      await recordHistoryEntry(
        repoRoot,
        makeInput({
          url: 'https://api.example.com/things?api_key=super-secret-token&other=fine',
          secretValues: { apiKey: 'super-secret-token' },
        }),
      );

      const listed = await listHistory(repoRoot);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value[0]?.url).toBe('https://api.example.com/things?api_key={{apiKey}}&other=fine');
    });

    it('an empty secret value is never substituted in (no blank-splice)', async () => {
      await recordHistoryEntry(
        repoRoot,
        makeInput({ url: 'https://api.example.com/things', secretValues: { unset: '' } }),
      );
      const listed = await listHistory(repoRoot);
      if (!listed.ok) return;
      expect(listed.value[0]?.url).toBe('https://api.example.com/things');
    });

    it('listHistory on a repo with nothing recorded yet is an empty success, not an error', async () => {
      const listed = await listHistory(repoRoot);
      expect(listed).toEqual({ ok: true, value: [] });
    });

    it('new entries land newest-first', async () => {
      await recordHistoryEntry(repoRoot, makeInput({ url: 'https://api.example.com/first' }));
      await recordHistoryEntry(repoRoot, makeInput({ url: 'https://api.example.com/second' }));

      const listed = await listHistory(repoRoot);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.map((e) => e.url)).toEqual([
        'https://api.example.com/second',
        'https://api.example.com/first',
      ]);
    });
  });

  describe('the 200-entry cap', () => {
    it('evicts the oldest row first once more than 200 entries have been recorded', async () => {
      for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i += 1) {
        await recordHistoryEntry(repoRoot, makeInput({ url: `https://api.example.com/${i}`, secretValues: {} }));
      }

      const listed = await listHistory(repoRoot);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value).toHaveLength(MAX_HISTORY_ENTRIES);
      // Newest first: the most recent 200 survive, the first five recorded do not.
      expect(listed.value[0]?.url).toBe(`https://api.example.com/${MAX_HISTORY_ENTRIES + 4}`);
      expect(listed.value.at(-1)?.url).toBe('https://api.example.com/5');
      expect(listed.value.some((e) => e.url === 'https://api.example.com/0')).toBe(false);
      expect(listed.value.some((e) => e.url === 'https://api.example.com/4')).toBe(false);
    });
  });

  describe('clearHistory', () => {
    it('empties a populated history', async () => {
      await recordHistoryEntry(repoRoot, makeInput());
      const cleared = await clearHistory(repoRoot);
      expect(cleared.ok).toBe(true);

      const listed = await listHistory(repoRoot);
      expect(listed).toEqual({ ok: true, value: [] });
    });

    it('is a no-op success on a repo with no history file at all', async () => {
      const cleared = await clearHistory(repoRoot);
      expect(cleared.ok).toBe(true);
    });
  });

  describe('symlink escape refusal', () => {
    it('confineTree refuses a listHistory read through a .midnite/api symlinked outside the repo', async () => {
      const outsideRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-outside-history-')));
      // A rogue file at the exact name `readHistory` would otherwise read —
      // the assertion that matters is that its content never comes back.
      await writeFile(
        join(outsideRoot, 'history.local.json'),
        JSON.stringify([{ id: 'rogue', at: 0, method: 'GET', url: 'https://rogue.example/', status: 200, durationMs: 1, sizeBytes: 1, collectionId: null, itemPath: null, environmentId: null }]),
        'utf8',
      );

      await mkdir(join(repoRoot, '.midnite'));
      await symlink(outsideRoot, join(repoRoot, '.midnite', 'api'));

      // A symlinked `.midnite/api` fails `confineTree` before `history.local.json`
      // is ever read — listHistory folds that into the same empty-history
      // state as "nothing recorded yet" rather than surfacing an error, so
      // the rogue entry never comes back.
      const listed = await listHistory(repoRoot);
      expect(listed).toEqual({ ok: true, value: [] });

      await rm(outsideRoot, { recursive: true, force: true });
    });

    it('refuses to write when .midnite/api itself is symlinked outside the repo, writing nothing there', async () => {
      const outsideRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-outside-history-write-')));

      await mkdir(join(repoRoot, '.midnite'), { recursive: true });
      await symlink(outsideRoot, join(repoRoot, '.midnite', 'api'));

      const ok = await recordHistoryEntry(repoRoot, makeInput());
      expect(ok).toBe(false);

      const { readdir } = await import('node:fs/promises');
      expect(await readdir(outsideRoot)).toEqual([]);

      await rm(outsideRoot, { recursive: true, force: true });
    });
  });
});
