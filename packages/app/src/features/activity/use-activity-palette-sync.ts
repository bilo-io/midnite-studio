import { useEffect } from 'react';

import { useActivityPaletteStore } from './activity-palette-store';
import { resolveActivePalette } from './resolve-active-palette';
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
 * resolution. This hook re-runs whenever any Settings ▸ Activity field
 * changes (Theme B) — the preset id, a per-status override, or the agent/
 * shell style pickers — `resolveActivePalette` is where those compose into
 * one `ActivityPalette` before this hook ever touches the DOM.
 */
export function useActivityPaletteSync(): void {
  const activePaletteId = useActivityPaletteStore((s) => s.activePaletteId);
  const statusOverrides = useActivityPaletteStore((s) => s.statusOverrides);
  const agentStyle = useActivityPaletteStore((s) => s.agentStyle);
  const shellStyle = useActivityPaletteStore((s) => s.shellStyle);

  useEffect(() => {
    const palette = resolveActivePalette(activePaletteId, statusOverrides, agentStyle, shellStyle);
    const root = document.documentElement.style;
    const tokens = resolveActivityTokens(palette);
    for (const name of activityTokenNames()) {
      const value = tokens[name];
      if (value === null || value === undefined) root.removeProperty(name);
      else root.setProperty(name, value);
    }
  }, [activePaletteId, statusOverrides, agentStyle, shellStyle]);
}
