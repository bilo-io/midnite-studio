import { usePaletteStore } from './palette-store';
import { BUILTIN_PALETTES, DEFAULT_PALETTE_ID } from './presets';
import type { StudioPalette } from './theme-types';

/**
 * `github-dark`/`github-light` are the one pair that auto-tracks
 * `@bilo-io/ui`'s resolved theme mode — the migration/regression baseline
 * (Decision 1) requires a fresh install's chrome, terminal, editor and Shiki
 * theme to look exactly like today's app in BOTH light and dark, and today's
 * app already flips automatically with the resolved mode. Every other preset
 * is an explicit choice and stays orthogonal to it (Decision 7): picking
 * "Monokai" does not un-pick itself when the OS flips light/dark under a
 * `system`/`time` preference.
 */
function trackResolvedTheme(id: string, resolved: 'light' | 'dark'): string {
  if (id === 'github-dark' || id === 'github-light') {
    return resolved === 'dark' ? 'github-dark' : 'github-light';
  }
  return id;
}

export function resolvePaletteById(
  id: string,
  userPalettes: readonly StudioPalette[],
): StudioPalette {
  return (
    userPalettes.find((p) => p.id === id) ??
    BUILTIN_PALETTES.find((p) => p.id === id) ??
    // Guaranteed to exist — `DEFAULT_PALETTE_ID` names a builtin.
    BUILTIN_PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID)!
  );
}

/** The palette that governs app chrome, and (absent an override) the editor,
 * terminal and Shiki surfaces too. */
export function resolveActivePalette(resolved: 'light' | 'dark'): StudioPalette {
  const { activePaletteId, userPalettes } = usePaletteStore.getState();
  return resolvePaletteById(trackResolvedTheme(activePaletteId, resolved), userPalettes);
}

export function resolveTerminalPalette(resolved: 'light' | 'dark'): StudioPalette {
  const { activePaletteId, terminalPaletteOverride, userPalettes } = usePaletteStore.getState();
  const id = terminalPaletteOverride ?? activePaletteId;
  return resolvePaletteById(trackResolvedTheme(id, resolved), userPalettes);
}

export function resolveEditorPalette(resolved: 'light' | 'dark'): StudioPalette {
  const { activePaletteId, editorPaletteOverride, userPalettes } = usePaletteStore.getState();
  const id = editorPaletteOverride ?? activePaletteId;
  return resolvePaletteById(trackResolvedTheme(id, resolved), userPalettes);
}

/**
 * The Shiki theme id for the read-only preview, diff rows and slide code
 * blocks (Decision 8) — these always follow the ACTIVE (chrome) palette, never
 * an override: "the read-only preview follows chrome, not the terminal."
 */
export function resolveActiveHighlightTheme(dark: boolean): StudioPalette['highlight'] {
  return resolveActivePalette(dark ? 'dark' : 'light').highlight;
}
