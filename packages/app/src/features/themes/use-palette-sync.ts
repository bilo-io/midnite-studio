import { useEffect } from 'react';

import { useTheme } from '@bilo-io/ui/theme';

import { usePaletteStore } from './palette-store';
import { resolveActivePalette } from './resolve-palette';
import { STUDIO_TOKENS } from './theme-types';

/**
 * Pushes the active palette's `chrome` tokens onto `document.documentElement`
 * as inline custom properties — called once from `app.tsx`, beside the
 * existing appearance sync.
 *
 * Inline style wins on specificity over both `@bilo-io/ui/dist/tokens.css`'s
 * `:root`/`.dark` rules and `@bilo-io/shell`'s `html[data-accent]` overrides,
 * which is what makes this an extension of the existing systems rather than a
 * fork of either (Decision 7).
 */
export function usePaletteSync(): void {
  const { resolved } = useTheme();
  const activePaletteId = usePaletteStore((s) => s.activePaletteId);
  const userPalettes = usePaletteStore((s) => s.userPalettes);

  useEffect(() => {
    const palette = resolveActivePalette(resolved);
    const root = document.documentElement.style;
    for (const token of STUDIO_TOKENS) {
      const value = palette.chrome[token];
      // Clears (rather than leaves stranded) a token THIS palette does not
      // set, restoring `@bilo-io/ui`'s own value — switching from a palette
      // that overrides `--ring` to one that doesn't must not strand the old
      // override.
      if (value) root.setProperty(token, value);
      else root.removeProperty(token);
    }
    // `activePaletteId`/`userPalettes` are read again inside the effect via
    // `resolveActivePalette`'s own `getState()` call — depending on them here
    // (rather than only on `resolved`) is what re-runs this effect when the
    // user or a synced popout message changes the selection without touching
    // light/dark at all.
  }, [resolved, activePaletteId, userPalettes]);
}
