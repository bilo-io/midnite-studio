import type { VaultClient } from '@midnite/studio-runtime';
import type { SecretKey } from '@midnite/studio-shared';

/**
 * The stored keys Gamer's tabs use, and nothing else (Phase 113 Theme S): the optional MapTiler key that
 * unlocks Maps' satellite, Terrain-RGB and styles, and the Gemini and OpenAI image keys behind Sprites'
 * generating methods and Terrain's prompted heightmap. (Ollama needs no key; agent API keys are not
 * Gamer's — a game agent run's CLI, Claude Code or Codex, uses its own sign-in, as it does in Studio.)
 *
 * Gamer reads them from the runtime host's vault, as `gamer`, once paired (`pairing.ts`) and only if the
 * user has granted them in Vault. A grant covers a name or `*`; this list is the other half of the
 * promise — even a `*` grant is never *asked* for anything outside it, by code or by a channel. Every read
 * stays in main: no channel returns a value, and Gamer's preload exposes no `secrets` namespace at all.
 */
export const GAMER_SECRET_KEYS = ['media.mapTilerApiKey', 'media.geminiApiKey', 'media.openaiApiKey'] as const satisfies readonly SecretKey[];
export type GamerSecretKey = (typeof GAMER_SECRET_KEYS)[number];

const ALLOWED: ReadonlySet<string> = new Set(GAMER_SECRET_KEYS);

/**
 * A reader over the vault client: the decrypted value, or `null` when the key is not one of Gamer's, is
 * absent, is not granted, or no host is running (the client's own "denied read is absent" contract). It
 * never throws — callers turn `null` into the existing "not available" answers.
 */
export function createGamerKeyReader(vault: Pick<VaultClient, 'get'>): (key: SecretKey) => Promise<string | null> {
  return async (key) => {
    if (!ALLOWED.has(key)) return null;
    try {
      return (await vault.get('secrets', key)) || null;
    } catch {
      return null;
    }
  };
}
