import type { VaultClient } from '@midnite/studio-runtime';
import type { SecretKey } from '@midnite/studio-shared';

/**
 * The one stored key Media uses, and nothing else (Phase 113 Theme R): the TMDB key behind the Library's
 * opt-in online metadata. Off by default, the library never reads it — the switch in the Library's
 * Metadata section is what makes a scan ask for it.
 *
 * Media reads it from the runtime host's vault, as `media`, once paired (`pairing.ts`) and only if the
 * user has granted it in Vault. A grant covers a name or `*`; this list is the other half of the promise
 * — even a `*` grant is never *asked* for anything outside it. The read stays in main: no channel returns
 * a value, and Media's preload exposes no `secrets` namespace at all.
 */
export const MEDIA_SECRET_KEYS = ['media.tmdbApiKey'] as const satisfies readonly SecretKey[];
export type MediaSecretKey = (typeof MEDIA_SECRET_KEYS)[number];

const ALLOWED: ReadonlySet<string> = new Set(MEDIA_SECRET_KEYS);

/**
 * A reader over the vault client: the decrypted value, or `null` when the key is not Media's, is absent,
 * is not granted, or no host is running (the client's own "denied read is absent" contract). It never
 * throws — the library turns `null` into "no key, no lookup".
 */
export function createMediaKeyReader(
  vault: Pick<VaultClient, 'get'>,
): (key: SecretKey) => Promise<string | null> {
  return async (key) => {
    if (!ALLOWED.has(key)) return null;
    try {
      return (await vault.get('secrets', key)) || null;
    } catch {
      return null;
    }
  };
}
