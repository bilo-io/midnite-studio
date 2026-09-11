import { useEffect } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import type { ForgeSubscriptionKind } from '@midnite/studio-shared';

import { bridge } from './bridge';
import { invalidateForgeKind } from './queries';

/**
 * Registers this window's interest in one `{repoId, kind}` forge listing
 * (Phase 84 Theme C.5) — mounted by the Actions (`runs`), Reviews (`pulls`),
 * Issues (`issues`) and Projects (`projects`) views, and the status-bar forge
 * chip that renders counts off the same data.
 *
 * Subscribes on mount, unsubscribes on unmount (including a repo switch,
 * which changes the effect's dependency), and reacts to `forgeChanged` by
 * invalidating exactly this kind's queries. Works identically in a popout —
 * it rides the bridge, not `app.tsx` — the same reason `useWatchInvalidation`
 * does.
 */
export function useForgeSubscription(
  repoId: string | null,
  kind: ForgeSubscriptionKind,
  enabled = true,
): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled || repoId === null) return undefined;
    const api = bridge();
    if (!api) return undefined;

    api.forge.subscribe({ repoId, kind });
    const unsubscribeChanged = api.forge.onChanged((event) => {
      if (event.repoId !== repoId || event.kind !== kind) return;
      invalidateForgeKind(client, repoId, kind);
    });

    return () => {
      unsubscribeChanged();
      api.forge.unsubscribe({ repoId, kind });
    };
  }, [repoId, kind, enabled, client]);
}
