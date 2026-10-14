import { useEffect, useRef } from 'react';

import { WEB_APP_IDS, type WebAppId } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

/**
 * Reconciles `ui-store`'s persisted `enabledWebApps` against main's own
 * `web-apps-service.ts` map — the missing half B.3 left for this theme (see its
 * own "Left for the Theme C/D follow-up" note in `done.md`).
 *
 * A plain diff-and-call effect, not a store action, for the same reason
 * `use-window-sync.ts` isn't folded into `ui-store.ts` either: `setWebAppEnabled`
 * only has to be correct about the PREFERENCE (what Settings — Theme E — and
 * the rail's own toggle both write to), and main's actual view lifecycle is a
 * side effect of that preference changing, not part of the preference itself.
 *
 * Runs once on mount (a relaunch with `enabledWebApps` already populated from a
 * prior session has to re-construct those views — nothing else does that),
 * and again on every `enabledWebApps` change thereafter. Main-window-only: a
 * popout's own `ui-store` instance never mounts this (see `Shell()`), so an
 * app is never constructed twice against two different windows by two
 * `useWebAppsSync` instances racing each other.
 */
export function useWebAppsSync(): void {
  const enabledWebApps = useUiStore((s) => s.enabledWebApps);
  const previous = useRef<readonly WebAppId[] | null>(null);

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const before = previous.current ?? [];
    previous.current = enabledWebApps;

    for (const id of WEB_APP_IDS) {
      const was = before.includes(id);
      const is = enabledWebApps.includes(id);
      if (is && !was) void api.webApps.enable({ id });
      else if (!is && was) api.webApps.disable({ id });
    }
  }, [enabledWebApps]);
}
