import { useEffect } from 'react';

import { bridge } from './bridge';
import { useUiStore } from '../store/ui-store';

/**
 * Pushes `ui-store`'s auto-fetch settings into main (Phase 84 Theme B.4) —
 * on mount (so a scheduler started before this hook's first render sees the
 * real settings rather than main's built-in defaults) and again on every
 * change. `ui-store` stays the sole owner; main only mirrors the last
 * snapshot it was sent (`settings-mirror.ts`).
 *
 * Mounted once in the main window's `Shell()` — `fetch-scheduler.ts` is one
 * instance for the whole process, so one pusher is enough; a popout never
 * changes these settings (there is no Settings entry point in a popout) and
 * needs no copy of its own.
 */
export function useSettingsSync(): void {
  const autoFetchEnabled = useUiStore((s) => s.autoFetchEnabled);
  const autoFetchIntervalMs = useUiStore((s) => s.autoFetchIntervalMs);

  useEffect(() => {
    const api = bridge();
    if (!api) return;
    api.settings.sync({
      autoFetchEnabled,
      // `null`/sub-floor values are already treated as "effectively off" by
      // the old renderer-side gate; main's own floor
      // (`MIN_AUTO_FETCH_INTERVAL_MS`) re-applies the same rule, so a raw
      // fallback here just keeps the payload's type honest.
      autoFetchIntervalMs: autoFetchIntervalMs ?? 60_000,
    });
  }, [autoFetchEnabled, autoFetchIntervalMs]);
}
