import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { StoredChatSchema, type Chat } from '@midnite/studio-shared';

/**
 * Chat persistence — one JSON file per chat under `<userData>/chats/`.
 *
 * **Global, not per-repo.** The Chats page is reachable with no repository open
 * (`global: true` in the view registry) and a chat is as often about a
 * question as about a checkout, so a chat is stored once, with the repo it was
 * started in recorded as `repoId`/`repoPath` — the explorer filters and groups
 * on those. Writing into the working tree instead (`.midnite/…`, like Docs) would
 * dirty the user's repo with transcripts they may never want committed, and
 * would leave a repo-less chat nowhere to live.
 *
 * One file per chat rather than one big file: a streaming turn rewrites its own
 * chat every second or so, and a corrupt or half-written file costs one
 * conversation, not the history. Writes go to a temp name and are renamed over
 * the target, so a crash mid-write leaves the previous complete version.
 *
 * Reviewable patches live beside the chats in `patches/<changeSetId>.json` —
 * a change set's wire shape stays small, and the text needed to apply it is
 * read only when the user decides.
 */

export type StoredPatches = Record<string, string>;

export type ChatStore = {
  /** Every readable chat; a file that fails to parse is skipped, not fatal. */
  loadAll: () => Promise<Chat[]>;
  save: (chat: Chat) => Promise<void>;
  remove: (id: string) => Promise<void>;
  savePatches: (changeSetId: string, patches: StoredPatches) => Promise<void>;
  loadPatches: (changeSetId: string) => Promise<StoredPatches | null>;
  removePatches: (changeSetIds: readonly string[]) => Promise<void>;
};

/** A chat id becomes a filename; keep only characters that cannot escape the directory. */
const safeName = (id: string): string => id.replace(/[^a-zA-Z0-9._-]/g, '_');

async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}

export function createChatStore(userDataDir: string): ChatStore {
  const dir = join(userDataDir, 'chats');
  const patchDir = join(dir, 'patches');
  const fileFor = (id: string): string => join(dir, `${safeName(id)}.json`);
  const patchFileFor = (id: string): string => join(patchDir, `${safeName(id)}.json`);
  // Saves of one chat must not interleave — two renames racing leave the older text.
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const next = (chains.get(key) ?? Promise.resolve()).then(task, task);
    const tail = next.catch(() => undefined);
    chains.set(key, tail);
    void tail.then(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
    return next;
  };

  return {
    loadAll: async () => {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return [];
      }
      const chats: Chat[] = [];
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        try {
          const parsed = StoredChatSchema.safeParse(JSON.parse(await readFile(join(dir, name), 'utf8')));
          if (parsed.success) chats.push(parsed.data.chat);
        } catch {
          // Unreadable or half-written — skip it, never take the list down.
        }
      }
      return chats;
    },

    save: (chat) =>
      serial(chat.id, async () => {
        try {
          await mkdir(dir, { recursive: true });
          await writeAtomic(fileFor(chat.id), `${JSON.stringify({ version: 1, chat })}\n`);
        } catch {
          // A read-only data dir must not take the app down.
        }
      }),

    remove: (id) =>
      serial(id, async () => {
        await rm(fileFor(id), { force: true }).catch(() => undefined);
      }),

    savePatches: async (changeSetId, patches) => {
      try {
        await mkdir(patchDir, { recursive: true });
        await writeAtomic(patchFileFor(changeSetId), JSON.stringify(patches));
      } catch {
        // Same posture as `save`.
      }
    },

    loadPatches: async (changeSetId) => {
      try {
        const raw: unknown = JSON.parse(await readFile(patchFileFor(changeSetId), 'utf8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const out: StoredPatches = {};
        for (const [path, patch] of Object.entries(raw)) if (typeof patch === 'string') out[path] = patch;
        return out;
      } catch {
        return null;
      }
    },

    removePatches: async (changeSetIds) => {
      await Promise.all(changeSetIds.map((id) => rm(patchFileFor(id), { force: true }).catch(() => undefined)));
    },
  };
}

/** In-memory store for tests and the pre-boot window. */
export function createMemoryChatStore(): ChatStore & { chats: Map<string, Chat>; patches: Map<string, StoredPatches> } {
  const chats = new Map<string, Chat>();
  const patches = new Map<string, StoredPatches>();
  return {
    chats,
    patches,
    loadAll: async () => [...chats.values()].map((c) => structuredClone(c)),
    save: async (chat) => void chats.set(chat.id, structuredClone(chat)),
    remove: async (id) => void chats.delete(id),
    savePatches: async (id, value) => void patches.set(id, { ...value }),
    loadPatches: async (id) => patches.get(id) ?? null,
    removePatches: async (ids) => ids.forEach((id) => patches.delete(id)),
  };
}
