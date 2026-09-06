import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteCollection,
  exportCollection,
  importCollection,
  listCollections,
  readCollection,
  saveCollection,
} from './collection-io';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'sample.postman_collection.json');

/** `JSON.stringify(value, null, 2)` plus a trailing newline — the exact shape
 *  every write in `collection-io.ts` produces, and the shape the fixture's
 *  own (arbitrary) formatting is normalised to before a byte-for-byte
 *  comparison. */
function normalise(text: string): string {
  return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
}

async function readCollectionFileBytes(repoRoot: string, fileName: string): Promise<string> {
  return readFile(join(repoRoot, '.midnite', 'api', 'collections', fileName), 'utf8');
}

describe('collection-io', () => {
  let repoRoot: string;

  beforeEach(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var →
    // /private/var), and confineParent/confineTree compare against the REAL
    // root, so the fixture must too (fs-scope-write.test.ts does the same).
    repoRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-collection-io-')));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  describe('import → read → save round trip', () => {
    it('is byte-for-byte identical to the normalised original, at every stage', async () => {
      const originalText = readFileSync(FIXTURE_PATH, 'utf8');
      const normalisedOriginal = normalise(originalText);

      const imported = await importCollection(repoRoot, FIXTURE_PATH);
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;
      expect(imported.value.fileName).toBe('sample-api.postman_collection.json');
      expect(imported.value.id).toBe(imported.value.fileName);

      // The file written by import already matches the normalised original —
      // proof that import serialises the raw parsed value, not a zod-reshaped
      // one.
      const onDiskAfterImport = await readCollectionFileBytes(repoRoot, imported.value.fileName);
      expect(onDiskAfterImport).toBe(normalisedOriginal);

      const read = await readCollection(repoRoot, imported.value.id);
      expect(read.ok).toBe(true);
      if (!read.ok) return;

      const saved = await saveCollection(repoRoot, imported.value.id, read.value);
      expect(saved.ok).toBe(true);

      const onDiskAfterSave = await readCollectionFileBytes(repoRoot, imported.value.fileName);
      expect(onDiskAfterSave).toBe(normalisedOriginal);
    });

    it('exportCollection writes the identical bytes saveCollection would — one serialiser, two destinations', async () => {
      const normalisedOriginal = normalise(readFileSync(FIXTURE_PATH, 'utf8'));
      const imported = await importCollection(repoRoot, FIXTURE_PATH);
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;

      const exportDest = join(await realpath(await mkdtemp(join(tmpdir(), 'mstudio-export-'))), 'exported.json');
      const exported = await exportCollection(repoRoot, imported.value.id, exportDest);
      expect(exported.ok).toBe(true);

      const exportedBytes = await readFile(exportDest, 'utf8');
      expect(exportedBytes).toBe(normalisedOriginal);
      await rm(join(exportDest, '..'), { recursive: true, force: true });
    });
  });

  describe('slug de-duplication', () => {
    it('imports of the same collection twice land as <slug> then <slug>-2', async () => {
      const first = await importCollection(repoRoot, FIXTURE_PATH);
      const second = await importCollection(repoRoot, FIXTURE_PATH);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(first.value.fileName).toBe('sample-api.postman_collection.json');
      expect(second.value.fileName).toBe('sample-api-2.postman_collection.json');

      const list = await listCollections(repoRoot);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value.map((c) => c.fileName).sort()).toEqual([
        'sample-api-2.postman_collection.json',
        'sample-api.postman_collection.json',
      ]);
    });
  });

  describe('symlink escape refusals', () => {
    it('confineTree refuses a listCollections read through a .midnite/api symlinked outside the repo, and writes nothing', async () => {
      const outsideRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-outside-')));
      const outsideCollections = join(outsideRoot, 'collections');
      await mkdir(outsideCollections);
      await writeFile(join(outsideCollections, 'rogue.postman_collection.json'), '{}', 'utf8');

      await mkdir(join(repoRoot, '.midnite'));
      await symlink(outsideRoot, join(repoRoot, '.midnite', 'api'));

      const result = await listCollections(repoRoot);
      expect(result.ok).toBe(false);

      // Nothing was written anywhere — the outside directory the symlink
      // points at still holds exactly the one file it started with.
      expect(await readdir(outsideCollections)).toEqual(['rogue.postman_collection.json']);

      await rm(outsideRoot, { recursive: true, force: true });
    });

    it('refuses to import when .midnite/api already exists as a symlink out of the repo, and writes nothing', async () => {
      const outsideRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-outside-')));

      await mkdir(join(repoRoot, '.midnite'));
      await symlink(outsideRoot, join(repoRoot, '.midnite', 'api'));

      const result = await importCollection(repoRoot, FIXTURE_PATH);
      expect(result.ok).toBe(false);

      // The escape attempt wrote nothing into the directory the symlink
      // points at either.
      expect(await readdir(outsideRoot)).toEqual([]);

      await rm(outsideRoot, { recursive: true, force: true });
    });
  });

  describe('the three distinguishable import failures', () => {
    it('reports invalid JSON', async () => {
      const badFile = join(repoRoot, 'not-json.txt');
      await writeFile(badFile, '{ this is not json', 'utf8');

      const result = await importCollection(repoRoot, badFile);
      expect(result).toEqual({ ok: false, kind: 'error', message: 'That file is not valid JSON.' });
    });

    it('reports a Postman environment with its own message', async () => {
      const envFile = join(repoRoot, 'env.postman_environment.json');
      await writeFile(
        envFile,
        JSON.stringify({ id: 'abc', name: 'My Env', values: [{ key: 'token', value: 'x' }] }),
        'utf8',
      );

      const result = await importCollection(repoRoot, envFile);
      expect(result).toEqual({
        ok: false,
        kind: 'error',
        message:
          'That looks like a Postman environment, not a collection — environment support is coming in a later release.',
      });
    });

    it('reports an unrecognised shape as not a v2.1 collection', async () => {
      const otherFile = join(repoRoot, 'other.json');
      await writeFile(otherFile, JSON.stringify({ foo: 'bar', count: 3 }), 'utf8');

      const result = await importCollection(repoRoot, otherFile);
      expect(result).toEqual({
        ok: false,
        kind: 'error',
        message: 'That file is not a Postman v2.1 collection.',
      });
    });

    it('imports a collection with an unrecognised info.schema version anyway', async () => {
      const original = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
      original.info.schema = 'https://schema.getpostman.com/json/collection/v9.9.9/collection.json';
      const oddSchemaFile = join(repoRoot, 'odd-schema.json');
      await writeFile(oddSchemaFile, JSON.stringify(original), 'utf8');

      const result = await importCollection(repoRoot, oddSchemaFile);
      expect(result.ok).toBe(true);
    });
  });

  describe('.midnite/api/README.md', () => {
    it('is written on first import and not clobbered on the second', async () => {
      const readmePath = join(repoRoot, '.midnite', 'api', 'README.md');

      const first = await importCollection(repoRoot, FIXTURE_PATH);
      expect(first.ok).toBe(true);
      const afterFirst = await readFile(readmePath, 'utf8');
      expect(afterFirst.length).toBeGreaterThan(0);

      // Simulate a user having edited it — a genuine "not clobbered" check
      // has to prove the second import didn't overwrite whatever was there.
      const marker = 'a user edit that must survive a second import\n';
      await writeFile(readmePath, marker, 'utf8');

      const second = await importCollection(repoRoot, FIXTURE_PATH);
      expect(second.ok).toBe(true);

      expect(await readFile(readmePath, 'utf8')).toBe(marker);
    });
  });

  describe('readCollection / saveCollection on an unknown id', () => {
    it('readCollection fails for a collection that was never imported', async () => {
      const result = await readCollection(repoRoot, 'nope.postman_collection.json');
      expect(result.ok).toBe(false);
    });

    it('saveCollection fails for a collection that was never imported', async () => {
      const result = await saveCollection(repoRoot, 'nope.postman_collection.json', { info: { name: 'x' }, item: [] });
      expect(result.ok).toBe(false);
    });
  });

  describe('deleteCollection', () => {
    it('removes an imported collection so listCollections and readCollection stop seeing it', async () => {
      const imported = await importCollection(repoRoot, FIXTURE_PATH);
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;

      const deleted = await deleteCollection(repoRoot, imported.value.id);
      expect(deleted.ok).toBe(true);

      const list = await listCollections(repoRoot);
      expect(list.ok).toBe(true);
      if (list.ok) expect(list.value).toEqual([]);

      const read = await readCollection(repoRoot, imported.value.id);
      expect(read.ok).toBe(false);
    });
  });

  describe('listCollections on a repo with nothing imported yet', () => {
    it('is an empty success, not an error', async () => {
      const result = await listCollections(repoRoot);
      expect(result).toEqual({ ok: true, value: [] });
    });
  });
});
