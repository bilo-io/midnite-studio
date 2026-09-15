import { useEffect, useState } from 'react';

import { useAppearanceStore } from '../../store/appearance-store';
import { usePaletteStore } from './palette-store';
import { resolveActivePalette } from './resolve-palette';
import { STUDIO_TOKENS, type StudioToken } from './theme-types';

/**
 * Tokens retinted by `@bilo-io/shell`'s `html[data-accent]` rules.
 *
 * A palette normally supplies these as part of its complete chrome theme, but
 * an explicit Appearance ▸ Accent choice owns them instead. Leaving a palette
 * value inline would outrank the shell stylesheet and make the stored accent
 * visible in Settings without changing primary surfaces, focus rings, or the
 * active nav row.
 */
const ACCENT_TOKENS = new Set<StudioToken>([
  '--primary',
  '--primary-foreground',
  '--accent',
  '--accent-foreground',
  '--ring',
]);

const resolvedFromDom = (): 'light' | 'dark' =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light';

/**
 * Pushes the active palette's `chrome` tokens onto `document.documentElement`
 * as inline custom properties — called once from `app.tsx`, beside the
 * existing appearance sync.
 *
 * Inline style wins on specificity over both `@bilo-io/ui/dist/tokens.css`'s
 * `:root`/`.dark` rules and `@bilo-io/shell`'s `html[data-accent]` overrides,
 * which is what makes this an extension of the existing systems rather than a
 * fork of either (Decision 7).
 *
 * NOT `useTheme()`: this hook is called directly in `App()`'s own body,
 * which sits ABOVE `<ShellProviders>` in the tree — `App()` returns
 * `<ShellProviders>…</ShellProviders>`, so `App()` itself is not a descendant
 * of the `ThemeProvider` `ShellProviders` renders, and `useTheme()` throws
 * outside one. The provider exposes no change event anyway, so this observes
 * the `dark` class directly — the same `MutationObserver` pattern `app.tsx`'s
 * own window-background sync, `broadcast-sync.ts` and `terminal-view.tsx`
 * already use for the identical reason.
 */
export function usePaletteSync(): void {
  const [resolved, setResolved] = useState(resolvedFromDom);
  const activePaletteId = usePaletteStore((s) => s.activePaletteId);
  const userPalettes = usePaletteStore((s) => s.userPalettes);
  const accent = useAppearanceStore((s) => s.accent);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setResolved(resolvedFromDom()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const palette = resolveActivePalette(resolved);
    const root = document.documentElement.style;
    for (const token of STUDIO_TOKENS) {
      if (accent !== 'default' && ACCENT_TOKENS.has(token)) {
        root.removeProperty(token);
        continue;
      }
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
  }, [resolved, activePaletteId, userPalettes, accent]);
}
