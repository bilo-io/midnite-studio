import { bridge } from '../services/bridge';
import { useUiStore } from './ui-store';

/**
 * The `agentApiKeys['github']` → forge-account-vault migration (Phase 90
 * Theme B).
 *
 * `persisted-keys.ts`'s own docblock names this slot: `ui-store.ts` already
 * persisted a `GITHUB_TOKEN`-shaped value in plaintext `localStorage` under
 * `agentApiKeys.github`, classified by `persisted-keys.ts` as an ordinary
 * preference. Theme B gives forge tokens a real home — `forge-account-vault.ts`,
 * encrypted behind `safeStorage` — and this is the one-time step that moves
 * that one slot into it.
 *
 * **Two halves, both required by the phase doc:** the leftover value is
 * offered to `forgeAccounts.add` as a GitHub PAT (validated against `whoami`
 * exactly like any other account addition), AND the plaintext key is removed
 * from `agentApiKeys` regardless of whether that validation succeeds — a
 * token that no longer works is not a reason to leave a plaintext credential
 * sitting in `localStorage`. The five LLM keys beside it are untouched: they
 * are agent credentials, not forge credentials, and belong to Phase 76 Theme D
 * and Phase 91 Theme G instead.
 *
 * Not part of `ui-store.ts`'s own `migrate()`: that hook runs synchronously
 * during zustand's `persist` rehydration, before a bridge call could resolve,
 * so this is a separate step run once the app has mounted and the bridge is
 * live (`app.tsx`'s own one-time effect). Naturally idempotent — once the key
 * is removed, a second call finds nothing to migrate.
 */
export async function migrateLegacyGithubAgentKey(): Promise<void> {
  const api = bridge();
  if (!api) return;

  const token = useUiStore.getState().agentApiKeys['github'];
  if (!token || !token.trim()) return;

  try {
    await api.forgeAccounts.add({ kind: 'github', host: 'github.com', token: token.trim() });
  } catch {
    // A network hiccup or a token that no longer validates is not a reason
    // to leave the plaintext copy behind — see the module docblock.
  } finally {
    useUiStore.getState().removeAgentApiKey('github');
  }
}
