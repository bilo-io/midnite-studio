// @ts-check
/**
 * Midnite game kit — the asset lookup (engine-free).
 *
 * `assets/index.json` is the one place a game looks assets up by kind and name
 * (the asset bridge writes it when you import from Terrain, Sprites, Models,
 * Images or Audio). Shape: `{ version: 1, assets: [{ kind, name, path, files? }] }`,
 * `path` relative to the repo root.
 */

/**
 * @typedef {{ kind: string, name: string, path: string, files?: string[] }} AssetEntry
 */

/** @param {unknown} json */
export function createAssetIndex(json) {
  const raw = /** @type {{ assets?: unknown }} */ (json ?? {}).assets;
  /** @type {AssetEntry[]} */
  const assets = Array.isArray(raw)
    ? raw.filter(
        (entry) => entry && typeof entry.kind === 'string' && typeof entry.name === 'string' && typeof entry.path === 'string',
      )
    : [];
  const get = (/** @type {string} */ kind, /** @type {string} */ name) =>
    assets.find((entry) => entry.kind === kind && entry.name === name) ?? null;
  return {
    get,
    list: (/** @type {string} */ kind) => assets.filter((entry) => entry.kind === kind),
    /**
     * A URL for one file of an asset (`url('sprite', 'hero', 'atlas.json')`), or
     * `null` when the asset is not in the index.
     * @param {string} kind
     * @param {string} name
     * @param {string} [file]
     */
    url(kind, name, file) {
      const entry = get(kind, name);
      if (!entry) return null;
      const base = entry.path.replace(/\/+$/, '');
      return file ? `./${base}/${file}` : `./${base}`;
    },
  };
}

/**
 * Fetch and parse `assets/index.json`; an empty index when it does not exist yet.
 * @param {(url: string) => Promise<{ ok: boolean, json: () => Promise<unknown> }>} [fetchFn]
 */
export async function loadAssetIndex(fetchFn = globalThis.fetch) {
  try {
    const response = await fetchFn('./assets/index.json');
    return createAssetIndex(response.ok ? await response.json() : null);
  } catch {
    return createAssetIndex(null);
  }
}
