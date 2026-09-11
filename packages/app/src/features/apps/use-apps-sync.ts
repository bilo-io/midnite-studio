import { useEffect, useRef } from 'react';

import { APP_IDS, type AppId } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

/**
 * Reconciles `ui-store`'s persisted `enabledApps` against main's own
 * `apps-service.ts` map — the missing half B.3 left for this theme (see its
 * own "Left for the Theme C/D follow-up" note in `done.md`).
 *
 * A plain diff-and-call effect, not a store action, for the same reason
 * `use-window-sync.ts` isn't folded into `ui-store.ts` either: `setAppEnabled`
 * only has to be correct about the PREFERENCE (what Settings — Theme E — and
 * the rail's own toggle both write to), and main's actual view lifecycle is a
 * side effect of that preference changing, not part of the preference itself.
 *
 * Runs once on mount (a relaunch with `enabledApps` already populated from a
 * prior session has to re-construct those views — nothing else does that),
 * and again on every `enabledApps` change thereafter. Main-window-only: a
 * popout's own `ui-store` instance never mounts this (see `Shell()`), so an
 * app is never constructed twice against two different windows by two
 * `useAppsSync` instances racing each other.
 */
export function useAppsSync(): void {
  const enabledApps = useUiStore((s) => s.enabledApps);
  const previous = useRef<readonly AppId[] | null>(null);

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const before = previous.current ?? [];
    previous.current = enabledApps;

    for (const id of APP_IDS) {
      const was = before.includes(id);
      const is = enabledApps.includes(id);
      if (is && !was) void api.apps.enable({ id });
      else if (!is && was) api.apps.disable({ id });
    }
  }, [enabledApps]);
}
