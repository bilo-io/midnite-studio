/**
 * Carry a persisted store across the `midnite-git` → `midnite-studio` rename.
 *
 * zustand's own `migrate` hook cannot help here: it runs *after* the key is
 * read, so a store whose KEY changed sees no stored value at all and hydrates
 * from defaults. The rename has to happen in localStorage before the store is
 * created — which is why this is a plain function called at module scope
 * beside each `persist({ name })`, not middleware.
 *
 * Idempotent by construction: it does nothing once the new key exists, so a
 * second call (React StrictMode, a hot reload, a second store on the same key)
 * can never overwrite fresh state with the stale pre-rename copy.
 */
export function adoptRenamedPersistKey(legacyKey: string, currentKey: string): void {
  try {
    if (localStorage.getItem(currentKey) !== null) return;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return;
    localStorage.setItem(currentKey, legacy);
    // The old key is left in place deliberately: an older build launched
    // afterwards still finds its state, and one stale JSON blob costs nothing.
  } catch {
    // Private mode, a disabled-storage policy, or a quota refusal. Hydrating
    // from defaults is a worse first launch, never a broken one.
  }
}
