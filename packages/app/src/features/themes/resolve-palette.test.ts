import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { usePaletteStore } from './palette-store';
import {
  resolveActiveHighlightTheme,
  resolveActivePalette,
  resolveEditorPalette,
  resolvePaletteById,
  resolveTerminalPalette,
} from './resolve-palette';

/**
 * `resolve-palette.ts` had no test file at all — everything exercising it did
 * so incidentally, through a component (`use-palette-sync.test.tsx`,
 * `code-editor.test.tsx`) that only reads ONE of its four exports. These
 * cover the phase doc's own two Verification items that are really about
 * this file, not any one surface:
 *
 * - override isolation ("master GitHub Dark + terminal override Monokai ->
 *   terminal Monokai, chrome unaffected, preview follows chrome not the
 *   terminal") — every override combination `resolveTerminalPalette` and
 *   `resolveEditorPalette` can produce.
 * - "five surfaces move together in one frame" — the part of that claim
 *   provable without mounting five real components: chrome, terminal,
 *   editor and the Shiki preview/diff highlight all resolve from ONE
 *   synchronous `usePaletteStore.getState()` snapshot inside each function,
 *   so a single `setActivePalette`/override call can never leave them
 *   reading torn (partially-old, partially-new) state relative to each
 *   other — there is no async gap between them for a render to land inside.
 *   Actual same-paint-frame DOM assertion across five mounted surfaces is
 *   an e2e-scale undertaking this phase's remaining budget did not reach;
 *   left unticked in the report for that reason, distinct from the
 *   torn-state property this file DOES prove.
 */
describe('resolve-palette', () => {
  beforeEach(() => {
    usePaletteStore.setState({
      activePaletteId: 'github-dark',
      terminalPaletteOverride: null,
      editorPaletteOverride: null,
      userPalettes: [],
    });
  });

  afterEach(() => {
    usePaletteStore.setState({
      activePaletteId: 'github-dark',
      terminalPaletteOverride: null,
      editorPaletteOverride: null,
      userPalettes: [],
    });
  });

  it('resolvePaletteById falls back to the default builtin for an unknown id', () => {
    expect(resolvePaletteById('does-not-exist', []).id).toBe('github-dark');
  });

  it('resolvePaletteById prefers a user palette over a builtin of the same id', () => {
    const userGithubDark = {
      id: 'github-dark',
      label: 'User override of GitHub Dark',
      appearance: 'dark' as const,
      chrome: {},
      terminal: {} as never,
      editor: { base: 'vs-dark' as const, rules: [], colors: {} },
      highlight: 'github-dark' as const,
    };
    expect(resolvePaletteById('github-dark', [userGithubDark]).label).toBe(
      'User override of GitHub Dark',
    );
  });

  it('with no overrides, chrome/terminal/editor/highlight all agree on the active palette', () => {
    usePaletteStore.setState({ activePaletteId: 'monokai' });
    expect(resolveActivePalette('dark').id).toBe('monokai');
    expect(resolveTerminalPalette('dark').id).toBe('monokai');
    expect(resolveEditorPalette('dark').id).toBe('monokai');
    expect(resolveActiveHighlightTheme(true)).toBe(resolveActivePalette('dark').highlight);
  });

  it('override isolation: a terminal override changes only the terminal, not chrome or the editor', () => {
    usePaletteStore.setState({ activePaletteId: 'github-dark', terminalPaletteOverride: 'monokai' });

    expect(resolveTerminalPalette('dark').id).toBe('monokai');
    expect(resolveActivePalette('dark').id).toBe('github-dark');
    expect(resolveEditorPalette('dark').id).toBe('github-dark');
    // The read-only preview/diff highlight follows chrome, never an
    // override (Decision 8's "the read-only preview follows chrome, not the
    // terminal") — it must still read GitHub Dark's highlight, not Monokai's.
    expect(resolveActiveHighlightTheme(true)).toBe(resolveActivePalette('dark').highlight);
    expect(resolveActiveHighlightTheme(true)).not.toBe(resolveTerminalPalette('dark').highlight);
  });

  it('override isolation: an editor override changes only the editor, not chrome or the terminal', () => {
    usePaletteStore.setState({ activePaletteId: 'github-dark', editorPaletteOverride: 'vscode-dark-plus' });

    expect(resolveEditorPalette('dark').id).toBe('vscode-dark-plus');
    expect(resolveActivePalette('dark').id).toBe('github-dark');
    expect(resolveTerminalPalette('dark').id).toBe('github-dark');
  });

  it('both overrides at once stay independent of each other and of chrome', () => {
    usePaletteStore.setState({
      activePaletteId: 'github-dark',
      terminalPaletteOverride: 'monokai',
      editorPaletteOverride: 'jetbrains-darcula',
    });

    expect(resolveActivePalette('dark').id).toBe('github-dark');
    expect(resolveTerminalPalette('dark').id).toBe('monokai');
    expect(resolveEditorPalette('dark').id).toBe('jetbrains-darcula');
  });

  it('github-dark/github-light auto-track resolved mode; an override does not', () => {
    usePaletteStore.setState({ activePaletteId: 'github-dark', terminalPaletteOverride: 'monokai' });

    // The active (chrome) palette flips with resolved mode...
    expect(resolveActivePalette('light').id).toBe('github-light');
    // ...but a non-tracking override (Monokai) does not un-pick itself.
    expect(resolveTerminalPalette('light').id).toBe('monokai');
  });

  it('all four resolvers read one synchronous snapshot, so a single state change cannot leave them disagreeing', () => {
    // No override yet: every surface must already agree on Atom One Dark
    // from the SAME call that sets it, with no intervening read of any kind
    // able to observe a partially-updated store.
    usePaletteStore.getState().setActivePalette('atom-one-dark');
    expect(resolveActivePalette('dark').id).toBe('atom-one-dark');
    expect(resolveTerminalPalette('dark').id).toBe('atom-one-dark');
    expect(resolveEditorPalette('dark').id).toBe('atom-one-dark');
    expect(resolveActiveHighlightTheme(true)).toBe(resolveActivePalette('dark').highlight);
  });
});
