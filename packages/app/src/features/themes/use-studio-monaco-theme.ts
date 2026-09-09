import { useEffect } from 'react';

import { useTheme } from '@bilo-io/ui/theme';

import { getMonaco } from '../../lib/monaco/monaco-loader';
import { usePaletteStore } from './palette-store';
import { resolveEditorPalette } from './resolve-palette';

/**
 * Defines and applies the active studio editor palette as a real Monaco
 * theme — the one copy of the effect every Monaco mount site calls, replacing
 * what used to be duplicated verbatim across `code-editor.tsx` and
 * `monaco-field.tsx` (and missing outright from `query-editor.tsx`).
 *
 * Re-runs whenever the resolved light/dark mode, the active palette, the
 * editor override, or a user palette's own definition changes — Monaco's
 * theme is a process-wide singleton, so `setTheme` re-themes every mounted
 * editor immediately, which is exactly what a palette switch needs.
 * `resolveEditorPalette` already encodes the "editor override beats active
 * palette" precedence (`resolve-palette.ts`); this hook does not reimplement
 * it, only calls it.
 *
 * **Callers must not also pass a `theme` prop to `<Editor>`.** Verified
 * against `@monaco-editor/react`'s own source: a `theme` prop registers its
 * own effect calling `monaco.editor.setTheme(theme)` (plus setting it again
 * at editor-creation time), which races this hook's `setTheme('studio-<id>')`
 * call for the same global singleton and can silently stomp it. That was the
 * whole bug this hook exists to fix — every mount site had a correct
 * `defineTheme`/`setTheme` effect (or, for `query-editor.tsx`, none at all)
 * PLUS a hardcoded `theme={resolved === 'dark' ? 'vs-dark' : 'vs'}` prop that
 * silently overrode it.
 */
export function useStudioMonacoTheme(): void {
  const { resolved } = useTheme();
  const activePaletteId = usePaletteStore((s) => s.activePaletteId);
  const editorPaletteOverride = usePaletteStore((s) => s.editorPaletteOverride);
  const userPalettes = usePaletteStore((s) => s.userPalettes);

  useEffect(() => {
    let cancelled = false;
    void getMonaco().then((monaco) => {
      if (cancelled) return;
      const palette = resolveEditorPalette(resolved);
      const themeId = `studio-${palette.id}`;
      monaco.editor.defineTheme(themeId, {
        base: palette.editor.base,
        inherit: true,
        rules: palette.editor.rules,
        colors: palette.editor.colors,
      });
      monaco.editor.setTheme(themeId);
    });
    return () => {
      cancelled = true;
    };
  }, [resolved, activePaletteId, editorPaletteOverride, userPalettes]);
}
