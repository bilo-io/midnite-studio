import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Note } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createNotesStore,
  nullNotesStore,
  parseNotesState,
  repoNotesPath,
  safeRepoId,
} from './notes-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-notes-test-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

const makeNote = (over: Partial<Note> = {}): Note => ({
  id: 'note-1',
  repoId: 'repo-1',
  body: 'Sample note',
  status: 'captured',
  done: false,
  createdAt: 1000,
  updatedAt: 1000,
  order: 0,
  ...over,
});

describe('notes-store (desktop)', () => {
  it('safeRepoId handles alphanumeric, underscores, and special characters', () => {
    expect(safeRepoId('my-repo_123')).toBe('my-repo_123');
    expect(safeRepoId('/Users/dev/repo:main')).toBe('_Users_dev_repo_main');
    expect(safeRepoId('')).toBe('default');
  });

  it('repoNotesPath constructs path under userData/notes/<repoId>.json', async () => {
    const dir = await tempDir();
    const path = repoNotesPath(dir, 'my-repo');
    expect(path).toBe(join(dir, 'notes', 'my-repo.json'));
  });

  it('CRUD operations: save, list, delete, reorder per repo', async () => {
    const dir = await tempDir();
    const store = createNotesStore(dir, { debounceMs: 0 });

    const note1 = makeNote({ id: 'n1', repoId: 'repo-1', body: 'First', order: 0 });
    const note2 = makeNote({ id: 'n2', repoId: 'repo-1', body: 'Second', order: 1 });
    const note3 = makeNote({ id: 'n3', repoId: 'repo-2', body: 'Other repo', order: 0 });

    await store.save(note1);
    await store.save(note2);
    await store.save(note3);
    await store.flush();

    // Listing specific repo
    const repo1Notes = await store.list('repo-1');
    expect(repo1Notes.map((n) => n.id)).toEqual(['n1', 'n2']);

    // Listing all repos
    const allNotes = await store.list();
    expect(allNotes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3']);

    // Reorder repo-1 notes
    await store.reorder('repo-1', ['n2', 'n1']);
    await store.flush('repo-1');
    const reordered = await store.list('repo-1');
    expect(reordered.map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(reordered[0]?.order).toBe(0);
    expect(reordered[1]?.order).toBe(1);

    // Delete a note with repoId
    await store.delete('n1', 'repo-1');
    await store.flush('repo-1');
    const afterDelete = await store.list('repo-1');
    expect(afterDelete.map((n) => n.id)).toEqual(['n2']);

    // Delete a note without repoId (searches repos)
    await store.delete('n3');
    await store.flush();
    const afterDeleteOther = await store.list('repo-2');
    expect(afterDeleteOther).toEqual([]);
  });

  it('updates an existing note in place', async () => {
    const dir = await tempDir();
    const store = createNotesStore(dir, { debounceMs: 0 });

    const note = makeNote({ id: 'n1', repoId: 'repo-1', body: 'Original', done: false });
    await store.save(note);
    await store.flush('repo-1');

    const updated = { ...note, body: 'Updated body', done: true, updatedAt: 2000 };
    await store.save(updated);
    await store.flush('repo-1');

    const listed = await store.list('repo-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.body).toBe('Updated body');
    expect(listed[0]?.done).toBe(true);
    expect(listed[0]?.updatedAt).toBe(2000);
  });

  it('performs atomic writes that write valid JSON to disk', async () => {
    const dir = await tempDir();
    const store = createNotesStore(dir, { debounceMs: 0 });

    const note = makeNote({ id: 'n1', repoId: 'repo-1', body: 'Atomic write check' });
    await store.save(note);
    await store.flush('repo-1');

    const filePath = repoNotesPath(dir, 'repo-1');
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as { version: number; notes: Note[] };

    expect(parsed.version).toBe(1);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0]?.id).toBe('n1');
    expect(parsed.notes[0]?.body).toBe('Atomic write check');
  });

  it('serializes concurrent writes without corruption', async () => {
    const dir = await tempDir();
    const store = createNotesStore(dir, { debounceMs: 10 });

    // Fire 20 rapid saves concurrently to the same repo
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        store.save(
          makeNote({
            id: `note-${i}`,
            repoId: 'repo-concurrent',
            body: `Note ${i}`,
            order: i,
          }),
        ),
      );
    }
    await Promise.all(promises);
    await store.flush('repo-concurrent');

    // Create a new store reading the same directory to verify disk content
    const freshStore = createNotesStore(dir);
    const notes = await freshStore.list('repo-concurrent');

    expect(notes).toHaveLength(20);
    const ids = notes.map((n) => n.id).sort();
    const expectedIds = Array.from({ length: 20 }, (_, i) => `note-${i}`).sort();
    expect(ids).toEqual(expectedIds);
  });

  it('degrades gracefully when encountering a corrupt JSON file', async () => {
    const dir = await tempDir();
    const notesDir = join(dir, 'notes');
    await mkdir(notesDir, { recursive: true });

    // Write malformed JSON
    await writeFile(join(notesDir, 'corrupt-repo.json'), '{{{ INVALID JSON');

    const store = createNotesStore(dir);
    const notes = await store.list('corrupt-repo');
    expect(notes).toEqual([]);

    // Listing all repos should also skip or degrade gracefully
    const all = await store.list();
    expect(all).toEqual([]);
  });

  it('parseNotesState drops corrupt rows while keeping valid rows', () => {
    const raw = {
      version: 1,
      notes: [
        makeNote({ id: 'valid-1', body: 'Valid note 1' }),
        { id: 'bad-1', missingStatus: true },
        'a string is not a note',
        makeNote({ id: 'valid-2', body: 'Valid note 2' }),
      ],
    };

    const parsed = parseNotesState(raw);
    expect(parsed.map((n) => n.id)).toEqual(['valid-1', 'valid-2']);

    // Completely invalid inputs
    expect(parseNotesState(null)).toEqual([]);
    expect(parseNotesState(undefined)).toEqual([]);
    expect(parseNotesState('string')).toEqual([]);
    expect(parseNotesState({ notes: 'not-an-array' })).toEqual([]);
  });

  it('degrades gracefully when directory does not exist yet', async () => {
    const dir = join(await tempDir(), 'nonexistent-subpath');
    const store = createNotesStore(dir);

    const notes = await store.list('repo-1');
    expect(notes).toEqual([]);

    const all = await store.list();
    expect(all).toEqual([]);
  });

  it('nullNotesStore acts as a safe no-op', async () => {
    expect(await nullNotesStore.list()).toEqual([]);
    expect(await nullNotesStore.list('repo-1')).toEqual([]);
    await expect(nullNotesStore.save(makeNote())).resolves.toBeUndefined();
    await expect(nullNotesStore.delete('note-1')).resolves.toBeUndefined();
    await expect(nullNotesStore.reorder('repo-1', ['note-1'])).resolves.toBeUndefined();
    await expect(nullNotesStore.flush()).resolves.toBeUndefined();
  });
});
