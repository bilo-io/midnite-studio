// @ts-check
/**
 * Midnite game kit — the asset lookup (engine-free).
 *
 * `assets/index.json` is the one place a game looks assets up by kind and name
 * (the asset bridge writes it when you import from Terrain, Sprites, Models,
 * Images or Audio). Shape: `{ version: 1, assets: [{ kind, name, path, entry?, files? }] }`,
 * `path` relative to the repo root, `entry` the file inside `path` that opens the asset
 * (`terrain.manifest.json`, `atlas.json`, `map.tmj`, ...). The bridge keeps names unique across
 * kinds, so `assetUrl(name)` needs no kind.
 */

/**
 * @typedef {{ kind: string, name: string, path: string, entry?: string, files?: string[] }} AssetEntry
 */

/**
 * A single-file web export (Phase 107 Theme P) has no server to fetch from: it sets
 * `window.__MIDNITE_ASSETS__ = { index, files }`, where `files` maps a repo-relative path to a
 * `data:` URL. When it is there, the index comes from it and a URL for a file it holds is that `data:` URL.
 * @returns {{ index?: unknown, files?: Record<string, string> } | null}
 */
function inlinedAssets() {
  const inlined = /** @type {any} */ (globalThis).__MIDNITE_ASSETS__;
  return inlined && typeof inlined === 'object' ? inlined : null;
}

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
  const byName = (/** @type {string} */ name) => assets.find((entry) => entry.name === name) ?? null;
  const urlOf = (/** @type {AssetEntry | null} */ entry, /** @type {string | undefined} */ file) => {
    if (!entry) return null;
    const base = entry.path.replace(/\/+$/, '');
    const files = inlinedAssets()?.files;
    const inlined = files?.[file ? `${base}/${file}` : base];
    if (typeof inlined === 'string') return inlined;
    return file ? `./${base}/${file}` : `./${base}`;
  };
  return {
    get,
    byName,
    list: (/** @type {string} */ kind) => assets.filter((entry) => entry.kind === kind),
    /**
     * A URL for one file of an asset (`url('sprite', 'hero', 'atlas.json')`), or
     * `null` when the asset is not in the index.
     * @param {string} kind
     * @param {string} name
     * @param {string} [file]
     */
    url(kind, name, file) {
      return urlOf(get(kind, name), file);
    },
    /**
     * The URL to load an asset by name alone: `file` inside it, else its `entry` file
     * (a single-file asset's path is already the file), else its folder. `null` when unknown.
     * @param {string} name
     * @param {string} [file]
     */
    assetUrl(name, file) {
      const entry = byName(name);
      return urlOf(entry, file ?? entry?.entry);
    },
  };
}

/**
 * Fetch and parse `assets/index.json`; an empty index when it does not exist yet.
 * @param {(url: string) => Promise<{ ok: boolean, json: () => Promise<unknown> }>} [fetchFn]
 */
export async function loadAssetIndex(fetchFn = globalThis.fetch) {
  const inlined = inlinedAssets();
  if (inlined?.index) return createAssetIndex(inlined.index);
  try {
    const response = await fetchFn('./assets/index.json');
    return createAssetIndex(response.ok ? await response.json() : null);
  } catch {
    return createAssetIndex(null);
  }
}
