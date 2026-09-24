import { useUiStore } from '../../store/ui-store';

/**
 * `projectRef`/`forgeAccountKey` for a session about to launch (Phase 95
 * Theme H) — the one place every kanban-surface launch site (card Play,
 * drag-to-skill, Auto-mate) resolves the same two facts, so they cannot drift
 * on what "the active forge account" means.
 *
 * `forgeAccountKey` reads `forgeActiveAccountId` — the app's one globally
 * "active" account (`account-switcher.tsx`) — because there is no
 * per-repo/per-board account binding to read instead. `projectRef.forge`
 * mirrors that same account's `kind` for want of a repo→forge-kind resolver;
 * it is carried for disambiguation, not required by the kill switch's own
 * scope filtering, which keys on `projectId` alone (`kill-scope.ts`).
 *
 * A plain function over `getState()`, not a hook — every caller already
 * calls `startAgent` (itself a plain function) synchronously from an event
 * handler or a timer callback, never from render.
 */
export function resolveSessionAttribution(
  projectId: string | undefined,
): { projectRef?: { projectId: string; forge: string }; forgeAccountKey?: string } {
  const { forgeAccounts, forgeActiveAccountId } = useUiStore.getState();
  const account = forgeAccounts.find((a) => a.id === forgeActiveAccountId);

  return {
    ...(projectId ? { projectRef: { projectId, forge: account?.kind ?? 'unknown' } } : {}),
    ...(account ? { forgeAccountKey: account.id } : {}),
  };
}
