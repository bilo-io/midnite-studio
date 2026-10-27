import { agentSecretKey } from '@midnite/studio-shared';

import { bridge } from '../services/bridge';
import { useToastStore } from './toast-store';
import { useUiStore } from './ui-store';

/**
 * The `agentApiKeys` → vault migration (Phase 113 Theme J slice 2).
 *
 * LLM agent API keys were plaintext in the renderer's persisted `agentApiKeys`.
 * They now live in the vault (`agent.<id>.apiKey`), and after this runs the
 * renderer holds none. Modelled on `migrate-forge-github-key.ts`, with the
 * opposite failure posture: that one drops the plaintext regardless (a dead
 * token is no reason to keep it), but an LLM key the user typed is only ever
 * removed once the vault demonstrably holds it — `secrets.set` is
 * fire-and-forget (a machine with no working keychain drops the write), so
 * success is `secrets.has` answering true afterwards. A key whose write did not
 * land stays where it was and is retried on the next start.
 *
 * Keys for agents with no vault slot (`github`, handled by the forge migration;
 * unknown ids) are left alone. A value is never logged. Idempotent: an entry is
 * removed once migrated, so a second call finds nothing.
 */
export async function migrateLegacyAgentApiKeys(): Promise<void> {
  const api = bridge();
  if (!api) return;

  let movedToSession = false;
  for (const [agentId, value] of Object.entries(useUiStore.getState().agentApiKeys)) {
    const key = agentSecretKey(agentId);
    if (!key) continue;
    if (!value || !value.trim()) {
      // An empty leftover is not a credential — just drop it.
      useUiStore.getState().removeAgentApiKey(agentId);
      continue;
    }
    try {
      await api.secrets.set({ key, value: value.trim() });
      const { hasKey } = await api.secrets.has({ key });
      if (hasKey) {
        useUiStore.getState().removeAgentApiKey(agentId);
        movedToSession = true;
      }
    } catch {
      // Keep the key; the next start retries. Never log the value.
    }
  }
  if (movedToSession) await noticeIfSessionOnly(api);
}

/**
 * Phase 115 Theme D: with no working Keychain the vault holds the key for the session only, and the plaintext
 * copy is gone anyway. Say so once, when the key was moved (the entry is removed, so this cannot repeat).
 */
async function noticeIfSessionOnly(api: NonNullable<ReturnType<typeof bridge>>): Promise<void> {
  try {
    const status = await api.vaultLock?.status({});
    if (status && !status.keychainAvailable) {
      useToastStore.getState().addToast({
        status: 'warning',
        message: 'Keychain unavailable: your agent API keys last until you quit Midnite.',
      });
    }
  } catch {
    // The notice is a courtesy; the key is already safe.
  }
}
