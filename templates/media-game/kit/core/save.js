// @ts-check
/**
 * Midnite game kit — save slots in `localStorage` (engine-free).
 *
 * Keys are `midnite:<gameName>:<slot>`. Midnite Studio runs each play in a
 * fresh in-memory storage partition unless the manifest sets `keepSaveData`,
 * so by default saves last only until Stop — the HUD says so.
 */

/**
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void, readonly length: number, key(index: number): string | null }} StorageLike
 */

/**
 * @param {{ gameName: string, storage?: StorageLike | null, persistent?: boolean }} options
 */
export function createSaveStore({ gameName, storage = globalThis.localStorage ?? null, persistent = false }) {
  const prefix = `midnite:${gameName}:`;
  const key = (/** @type {string} */ slot) => `${prefix}${slot}`;
  return {
    persistent,
    key,
    /** @param {string} slot @param {unknown} data */
    save(slot, data) {
      if (!storage) return false;
      try {
        storage.setItem(key(slot), JSON.stringify(data));
        return true;
      } catch {
        return false; // quota exceeded, or storage blocked
      }
    },
    /** @param {string} slot @returns {unknown} the saved value, or `null` */
    load(slot) {
      if (!storage) return null;
      try {
        const raw = storage.getItem(key(slot));
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    remove(/** @type {string} */ slot) {
      storage?.removeItem(key(slot));
    },
    /** Every slot name this game has saved. */
    list() {
      if (!storage) return [];
      /** @type {string[]} */
      const slots = [];
      for (let i = 0; i < storage.length; i += 1) {
        const name = storage.key(i);
        if (name?.startsWith(prefix)) slots.push(name.slice(prefix.length));
      }
      return slots.sort();
    },
  };
}

/**
 * Whether this run keeps its saves after Stop — the manifest's `keepSaveData`,
 * read from the game's own origin (the page cannot see its storage partition).
 * @param {(url: string) => Promise<{ ok: boolean, json: () => Promise<unknown> }>} [fetchFn]
 */
export async function readKeepSaveData(fetchFn = globalThis.fetch) {
  try {
    const response = await fetchFn('./midnite-game.json');
    if (!response.ok) return false;
    const manifest = /** @type {{ keepSaveData?: unknown }} */ (await response.json());
    return manifest?.keepSaveData === true;
  } catch {
    return false;
  }
}

/** The HUD's line when saves do not persist. */
export const EPHEMERAL_SAVE_NOTICE = 'Saves last until Stop';
