import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MidniteStudioBridge, Note } from '@midnite/studio-shared';
import {
  migrateNotesFromLocalStorage,
  NOTES_PERSIST_KEY,
  useNotesStore,
  type MigrationStorage,
} from './notes-store';

describe('notes-migration and bridge integration', () => {
  let memoryStorage: Record<string, string>;
  let fakeStorage: MigrationStorage;

  beforeEach(() => {
    memoryStorage = {};
    fakeStorage = {
      getItem: (key: string) => memoryStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        memoryStorage[key] = value;
      },
    };
    useNotesStore.setState({ notes: {}, hydrated: false });
  });

  it('migrates a populated v2 localStorage payload to disk and marks as migrated', async () => {
    const savedNotes: Note[] = [];
    const v2Payload = {
      version: 2,
      state: {
        notes: {
          n1: {
            id: 'n1',
            repoId: 'r1',
            body: 'Note 1',
            status: 'captured',
            done: false,
            createdAt: 100,
            updatedAt: 100,
            order: 0,
          },
          n2: {
            id: 'n2',
            repoId: 'r1',
            body: 'Note 2',
            status: 'planned',
            done: true,
            createdAt: 200,
            updatedAt: 200,
            order: 1,
          },
        },
      },
    };
    fakeStorage.setItem(NOTES_PERSIST_KEY, JSON.stringify(v2Payload));

    const mockBridge = {
      notes: {
        save: vi.fn(({ note }: { note: Note }) => {
          savedNotes.push(note);
        }),
        list: vi.fn(async () => ({
          notes: [...savedNotes],
        })),
        delete: vi.fn(),
        reorder: vi.fn(),
      },
    } as unknown as MidniteStudioBridge;

    const result = await migrateNotesFromLocalStorage(mockBridge, fakeStorage);
    expect(result).toBe(true);

    expect(mockBridge.notes.save).toHaveBeenCalledTimes(2);
    expect(mockBridge.notes.list).toHaveBeenCalledTimes(1);

    // Verify localStorage payload was marked migrated, but raw data was preserved
    const stored = JSON.parse(fakeStorage.getItem(NOTES_PERSIST_KEY)!) as {
      migrated: boolean;
      migratedAt: number;
      state: { notes: { n1: Note; n2: Note } };
    };
    expect(stored.migrated).toBe(true);
    expect(stored.migratedAt).toBeGreaterThan(0);
    expect(stored.state.notes.n1.body).toBe('Note 1');
    expect(stored.state.notes.n2.body).toBe('Note 2');
  });

  it('migrates a v1 localStorage payload by seeding order first', async () => {
    const savedNotes: Note[] = [];
    const v1Payload = {
      version: 1,
      state: {
        notes: {
          older: {
            id: 'older',
            repoId: 'r1',
            body: 'Older note',
            status: 'captured',
            done: false,
            createdAt: 100,
            updatedAt: 100,
          },
          newer: {
            id: 'newer',
            repoId: 'r1',
            body: 'Newer note',
            status: 'captured',
            done: false,
            createdAt: 500,
            updatedAt: 500,
          },
        },
      },
    };
    fakeStorage.setItem(NOTES_PERSIST_KEY, JSON.stringify(v1Payload));

    const mockBridge = {
      notes: {
        save: vi.fn(({ note }: { note: Note }) => {
          savedNotes.push(note);
        }),
        list: vi.fn(async () => ({
          notes: [...savedNotes],
        })),
        delete: vi.fn(),
        reorder: vi.fn(),
      },
    } as unknown as MidniteStudioBridge;

    const result = await migrateNotesFromLocalStorage(mockBridge, fakeStorage);
    expect(result).toBe(true);

    // Newer note (createdAt 500) gets order 0, older gets order 1
    const newerSaved = savedNotes.find((n) => n.id === 'newer');
    const olderSaved = savedNotes.find((n) => n.id === 'older');
    expect(newerSaved?.order).toBe(0);
    expect(olderSaved?.order).toBe(1);

    const stored = JSON.parse(fakeStorage.getItem(NOTES_PERSIST_KEY)!) as { migrated: boolean };
    expect(stored.migrated).toBe(true);
  });

  it('handles empty or missing localStorage gracefully', async () => {
    const mockBridge = {
      notes: {
        save: vi.fn(),
        list: vi.fn(async () => ({ notes: [] })),
        delete: vi.fn(),
        reorder: vi.fn(),
      },
    } as unknown as MidniteStudioBridge;

    const result = await migrateNotesFromLocalStorage(mockBridge, fakeStorage);
    expect(result).toBe(false);
    expect(mockBridge.notes.save).not.toHaveBeenCalled();
  });

  it('skips migration if already marked migrated', async () => {
    const alreadyMigrated = {
      version: 2,
      migrated: true,
      state: {
        notes: {
          n1: {
            id: 'n1',
            repoId: 'r1',
            body: 'Already migrated',
            status: 'captured',
            done: false,
            createdAt: 1,
            updatedAt: 1,
            order: 0,
          },
        },
      },
    };
    fakeStorage.setItem(NOTES_PERSIST_KEY, JSON.stringify(alreadyMigrated));

    const mockBridge = {
      notes: {
        save: vi.fn(),
        list: vi.fn(async () => ({ notes: [] })),
        delete: vi.fn(),
        reorder: vi.fn(),
      },
    } as unknown as MidniteStudioBridge;

    const result = await migrateNotesFromLocalStorage(mockBridge, fakeStorage);
    expect(result).toBe(false);
    expect(mockBridge.notes.save).not.toHaveBeenCalled();
  });

  it('does NOT mark migrated if read-back verification fails', async () => {
    const v2Payload = {
      version: 2,
      state: {
        notes: {
          n1: {
            id: 'n1',
            repoId: 'r1',
            body: 'Expected Note',
            status: 'captured',
            done: false,
            createdAt: 1,
            updatedAt: 1,
            order: 0,
          },
        },
      },
    };
    fakeStorage.setItem(NOTES_PERSIST_KEY, JSON.stringify(v2Payload));

    const mockBridge = {
      notes: {
        save: vi.fn(),
        // Return empty list so verification fails
        list: vi.fn(async () => ({ notes: [] })),
        delete: vi.fn(),
        reorder: vi.fn(),
      },
    } as unknown as MidniteStudioBridge;

    const result = await migrateNotesFromLocalStorage(mockBridge, fakeStorage);
    expect(result).toBe(false);

    // Payload should NOT be marked migrated
    const stored = JSON.parse(fakeStorage.getItem(NOTES_PERSIST_KEY)!) as { migrated?: boolean };
    expect(stored.migrated).toBeUndefined();
  });

  it('hydrate loads notes from bridge and sets hydrated flag', async () => {
    const diskNote: Note = {
      id: 'disk-1',
      repoId: 'r1',
      body: 'From disk',
      status: 'captured',
      done: false,
      createdAt: 100,
      updatedAt: 100,
      order: 0,
    };

    const mockBridge = {
      notes: {
        save: vi.fn(),
        list: vi.fn(async () => ({ notes: [diskNote] })),
        delete: vi.fn(),
        reorder: vi.fn(),
      },
    } as unknown as MidniteStudioBridge;

    const originalBridge = window.midniteStudio;
    const originalLocalStorage = window.localStorage;

    Object.defineProperty(window, 'midniteStudio', {
      value: mockBridge,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: fakeStorage,
      configurable: true,
      writable: true,
    });

    try {
      await useNotesStore.getState().hydrate();
      expect(useNotesStore.getState().hydrated).toBe(true);
      expect(useNotesStore.getState().notes['disk-1']?.body).toBe('From disk');

      // Bridge calls on store mutations
      useNotesStore.getState().addNote('r1', 'New note');
      expect(mockBridge.notes.save).toHaveBeenCalled();

      useNotesStore.getState().setBody('disk-1', 'Updated body');
      expect(mockBridge.notes.save).toHaveBeenCalled();

      useNotesStore.getState().setStatus('disk-1', 'planned');
      expect(mockBridge.notes.save).toHaveBeenCalled();

      useNotesStore.getState().toggleDone('disk-1');
      expect(mockBridge.notes.save).toHaveBeenCalled();

      useNotesStore.getState().reorderNotes('r1', ['disk-1']);
      expect(mockBridge.notes.reorder).toHaveBeenCalled();

      useNotesStore.getState().removeNote('disk-1');
      expect(mockBridge.notes.delete).toHaveBeenCalledWith({ id: 'disk-1', repoId: 'r1' });
    } finally {
      Object.defineProperty(window, 'midniteStudio', {
        value: originalBridge,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
        writable: true,
      });
    }
  });
});
