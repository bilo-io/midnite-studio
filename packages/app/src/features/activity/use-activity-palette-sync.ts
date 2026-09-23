import { useEffect } from 'react';

import { ACTIVITY_PRESETS, DEFAULT_ACTIVITY_PALETTE_ID } from '@midnite/studio-shared';

import { useActivityPaletteStore } from './activity-palette-store';
import { activityTokenNames, resolveActivityTokens } from './resolve-activity-tokens';

/**
 * Pushes the active Activity preset's tokens onto `document.documentElement`
 * as inline `--activity-*` custom properties — `app.tsx` calls this beside
 * the existing `usePaletteSync()` call, the same relationship Phase 64's own
 * hook has to `use-palette-sync.ts` (Theme A's own checklist item).
 *
 * No `MutationObserver`/light-dark watch like `usePaletteSync` needs: every
 * built-in preset's values are either a literal colour or an
 * `hsl(var(--token))` reference that resolves itself at used-value time —
 * `--activity-done` can hold the literal string `"hsl(var(--success))"` and
 * the browser re-resolves it through light/dark for free, the same way
 * `field-option-colors.ts`'s callers already lean on nested `var()`
 * resolution. This hook only re-runs when the active preset id changes.
 */
export function useActivityPaletteSync(): void {
  const activePaletteId = useActivityPaletteStore((s) => s.activePaletteId);

  useEffect(() => {
    const palette = ACTIVITY_PRESETS[activePaletteId] ?? ACTIVITY_PRESETS[DEFAULT_ACTIVITY_PALETTE_ID];
    if (!palette) return;
    const root = document.documentElement.style;
    const tokens = resolveActivityTokens(palette);
    for (const name of activityTokenNames()) {
      const value = tokens[name];
      if (value === null || value === undefined) root.removeProperty(name);
      else root.setProperty(name, value);
    }
  }, [activePaletteId]);
}
