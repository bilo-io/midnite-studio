import { useCallback, useEffect } from 'react';

import { useTheme } from '@bilo-io/ui/theme';
import type { editor as MonacoEditorNS } from 'monaco-editor';

import { getMonaco } from '../../lib/monaco/monaco-loader';
import { usePaletteStore } from './palette-store';
import { resolveEditorPalette } from './resolve-palette';

type MonacoModule = typeof import('monaco-editor');

/**
 * Defines and applies the active studio editor palette as a real Monaco
 * theme — the one copy of the effect every Monaco mount site calls, replacing
 * what used to be duplicated verbatim across `code-editor.tsx` and
 * `monaco-field.tsx` (and missing outright from `query-editor.tsx`).
 *
 * Returns `applyToMount(monaco)`, which callers MUST invoke from their own
 * `onMount: OnMount = (editor, monaco) => { applyToMount(monaco); ... }`.
 * That call is not optional decoration — see below for why.
 *
 * **The real bug this hook fixes turned out to be one layer deeper than "a
 * hardcoded `theme` prop wins a race".** Every mount site DID also carry a
 * hardcoded `theme={resolved === 'dark' ? 'vs-dark' : 'vs'}` prop, and
 * removing it is necessary — `@monaco-editor/react` reruns
 * `monaco.editor.setTheme(theme)` whenever that prop's VALUE changes, which
 * would otherwise re-stomp the studio theme on every light/dark toggle. But
 * verified directly against the library's source
 * (`@monaco-editor/react@4.7.0/dist/index.mjs`): its internal editor-creation
 * callback calls `monaco.editor.setTheme(theme)` UNCONDITIONALLY, once, the
 * moment it actually creates the editor instance — using the prop's value if
 * given, or its own default literal `"light"` if not. Removing the prop does
 * not remove that call; it only changes what it passes.
 *
 * That creation-time call is *itself* the race, independent of any prop:
 * `<Editor>` gates real DOM creation behind its own internal
 * `@monaco-editor/loader` readiness (a separate promise chain from this
 * hook's `getMonaco()`), which resolves on its own schedule and can land
 * either before or after this hook's reactive `useEffect` below — confirmed
 * by instrumenting both call sites directly: the effect's `setTheme('studio-
 * monokai')` and the library's own creation-time `setTheme('light')` (its
 * default, since no prop is passed) landed in either order depending on
 * which promise chain settled first, with the library's call winning often
 * enough to leave the editor permanently on `vs`/`vs-dark` in practice.
 *
 * `onMount` is the fix for that ordering: it fires in `<Editor>`'s own next
 * effect pass, strictly AFTER its creation-time `setTheme` call has already
 * run (verified against the same source — `onMount` is gated on an
 * `isEditorReady` state flip that only happens after creation, so it can
 * never fire in the same commit as creation, only a later one). Calling
 * `applyToMount(monaco)` there is guaranteed to run last on the initial
 * mount, regardless of which promise chain resolved first. The `useEffect`
 * below still owns every LATER re-theme (palette switch, override change,
 * light/dark toggle) — those happen long after mount, with no competing
 * creation-time call left to race.
 *
 * `resolveEditorPalette` already encodes the "editor override beats active
 * palette" precedence (`resolve-palette.ts`); this hook does not reimplement
 * it, only calls it.
 */
export function useStudioMonacoTheme(): (monaco: MonacoModule) => void {
  const { resolved } = useTheme();
  const activePaletteId = usePaletteStore((s) => s.activePaletteId);
  const editorPaletteOverride = usePaletteStore((s) => s.editorPaletteOverride);
  const userPalettes = usePaletteStore((s) => s.userPalettes);

  const applyToMount = useCallback(
    (monaco: MonacoModule) => {
      const palette = resolveEditorPalette(resolved);
      const themeId = `studio-${palette.id}`;
      monaco.editor.defineTheme(themeId, {
        base: palette.editor.base,
        inherit: true,
        rules: palette.editor.rules,
        colors: palette.editor.colors,
      } satisfies MonacoEditorNS.IStandaloneThemeData);
      monaco.editor.setTheme(themeId);
    },
    [resolved, activePaletteId, editorPaletteOverride, userPalettes],
  );

  useEffect(() => {
    let cancelled = false;
    void getMonaco().then((monaco) => {
      if (!cancelled) applyToMount(monaco);
    });
    return () => {
      cancelled = true;
    };
  }, [applyToMount]);

  return applyToMount;
}
