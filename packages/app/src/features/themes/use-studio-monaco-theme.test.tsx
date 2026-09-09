import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '@bilo-io/ui/theme';

import { usePaletteStore } from './palette-store';
import { useStudioMonacoTheme } from './use-studio-monaco-theme';

const defineThemeMock = vi.fn();
const setThemeMock = vi.fn();

vi.mock('../../lib/monaco/monaco-loader', () => ({
  getMonaco: vi.fn(async () => ({
    editor: { defineTheme: defineThemeMock, setTheme: setThemeMock },
  })),
}));

let capturedSetPreference: ((next: 'light' | 'dark' | 'system' | 'time') => void) | undefined;

function Harness() {
  useStudioMonacoTheme();
  capturedSetPreference = useTheme().setPreference;
  return null;
}

/** Forces `@bilo-io/ui`'s `ThemeProvider` to a known resolved mode, bypassing
 * `matchMedia`/system-clock resolution entirely — same mechanism the
 * provider itself reads (`localStorage['midnite.theme']`). */
function renderWithResolvedMode(resolved: 'light' | 'dark') {
  localStorage.setItem('midnite.theme', resolved);
  return render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>,
  );
}

describe('useStudioMonacoTheme', () => {
  beforeEach(() => {
    // `ThemeProvider` asks the platform about `prefers-color-scheme` on
    // mount; jsdom ships no `matchMedia` at all (same stub `code-editor.test.tsx`
    // and `theme-toggle.test.tsx` both need).
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    localStorage.clear();
    defineThemeMock.mockClear();
    setThemeMock.mockClear();
    usePaletteStore.setState({
      activePaletteId: 'github-dark',
      terminalPaletteOverride: null,
      editorPaletteOverride: null,
      userPalettes: [],
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('defines and sets a studio-<id> theme for the active palette', async () => {
    renderWithResolvedMode('dark');

    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-github-dark'));
    expect(defineThemeMock).toHaveBeenCalledWith(
      'studio-github-dark',
      expect.objectContaining({ inherit: true }),
    );
  });

  it('honours the editor override over the active palette', async () => {
    usePaletteStore.setState({ activePaletteId: 'github-dark', editorPaletteOverride: 'monokai' });
    renderWithResolvedMode('dark');

    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-monokai'));
    expect(setThemeMock).not.toHaveBeenCalledWith('studio-github-dark');
  });

  it('re-runs when the active palette id changes', async () => {
    renderWithResolvedMode('dark');
    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-github-dark'));

    act(() => {
      usePaletteStore.getState().setActivePalette('monokai');
    });

    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-monokai'));
  });

  it('re-runs when the editor override changes', async () => {
    renderWithResolvedMode('dark');
    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-github-dark'));

    act(() => {
      usePaletteStore.getState().setEditorOverride('jetbrains-darcula');
    });

    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-jetbrains-darcula'));
  });

  it('re-runs when the resolved light/dark mode changes (github-dark/-light auto-track it)', async () => {
    renderWithResolvedMode('dark');
    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-github-dark'));

    act(() => {
      capturedSetPreference?.('light');
    });

    // `resolveEditorPalette`'s `trackResolvedTheme` special-case flips
    // `github-dark` to `github-light` once resolved mode is 'light' — this
    // is the one built-in pair that auto-tracks (`resolve-palette.ts`), so
    // seeing it here proves the hook actually re-read the new resolved mode
    // rather than only re-running on the same value.
    await waitFor(() => expect(setThemeMock).toHaveBeenCalledWith('studio-github-light'));
  });
});
