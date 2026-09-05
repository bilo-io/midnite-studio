import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@bilo-io/ui/theme';

import { usePaletteStore } from '../../themes/palette-store';
import { useThemeImportCommandStore } from '../../themes/theme-import-command-store';
import { AppearancePage } from './appearance-page';

/**
 * Phase 64 Theme F — the "Palette" accordion added to the existing Appearance
 * page: preset selection, the terminal/editor overrides, the light/dark
 * control this page never had before, and the VS Code theme importer wired
 * to a hidden file input.
 */
function renderPage() {
  return render(
    <ThemeProvider>
      <AppearancePage />
    </ThemeProvider>,
  );
}

describe('AppearancePage — Palette accordion', () => {
  beforeEach(() => {
    // `ThemeProvider` asks the platform about `prefers-color-scheme` on
    // mount, and jsdom ships no `matchMedia` — the same stub
    // `code-editor.test.tsx` uses for the identical reason.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    usePaletteStore.setState({
      activePaletteId: 'github-dark',
      terminalPaletteOverride: null,
      editorPaletteOverride: null,
      userPalettes: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a card for every built-in preset, with the active one checked', () => {
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Palette' });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(6);
    expect(
      within(group).getByRole('radio', { name: 'GitHub Dark' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      within(group).getByRole('radio', { name: 'Monokai' }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('clicking a preset card sets it active', () => {
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Palette' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Monokai' }));
    expect(usePaletteStore.getState().activePaletteId).toBe('monokai');
  });

  it('the terminal override defaults to "Match app" and can be set independently', () => {
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Terminal override' });
    expect(within(group).getByRole('radio', { name: 'Match app' })).toBeTruthy();

    fireEvent.click(within(group).getByRole('radio', { name: 'Monokai' }));
    expect(usePaletteStore.getState().terminalPaletteOverride).toBe('monokai');
    // The active (chrome) palette is untouched by a terminal-only override.
    expect(usePaletteStore.getState().activePaletteId).toBe('github-dark');
  });

  it('the editor override defaults to "Match app" and can be set independently', () => {
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Editor override' });
    fireEvent.click(within(group).getByRole('radio', { name: 'GitHub Light' }));
    expect(usePaletteStore.getState().editorPaletteOverride).toBe('github-light');
    expect(usePaletteStore.getState().terminalPaletteOverride).toBeNull();
  });

  it('surfaces the light/dark/system/time preference — a control the page never had before', () => {
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Appearance' });
    const options = Array.from(group.querySelectorAll('[role="radio"]')).map((el) => el.textContent);
    expect(options).toEqual(['Light', 'Dark', 'System', 'Time of day']);
  });

  it('imports a VS Code theme file and adds + selects it as a new palette', async () => {
    renderPage();
    const themeJson = JSON.stringify({
      name: 'My Imported Theme',
      type: 'dark',
      colors: { 'editor.background': '#101010', 'editor.foreground': '#eeeeee' },
      tokenColors: [{ scope: 'comment', settings: { foreground: '#888888' } }],
    });
    const file = new File([themeJson], 'theme.json', { type: 'application/json' });
    const input = screen.getByLabelText('Import VS Code Theme file') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(usePaletteStore.getState().userPalettes).toHaveLength(1);
    });
    expect(usePaletteStore.getState().userPalettes[0]?.label).toBe('My Imported Theme');
    expect(usePaletteStore.getState().activePaletteId).toBe(
      usePaletteStore.getState().userPalettes[0]?.id,
    );
    const paletteGroup = screen.getByRole('radiogroup', { name: 'Palette' });
    expect(within(paletteGroup).getByRole('radio', { name: 'My Imported Theme' })).toBeTruthy();
  });

  it('shows the importer reason inline rather than throwing on a bad file', async () => {
    renderPage();
    const file = new File(['{ not json'], 'bad.json', { type: 'application/json' });
    const input = screen.getByLabelText('Import VS Code Theme file') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Malformed JSON')).toBeTruthy();
    });
    expect(usePaletteStore.getState().userPalettes).toHaveLength(0);
  });

  it('registers a theme-import handle on mount that opens the file picker, and unregisters on unmount', () => {
    const { unmount } = renderPage();
    expect(useThemeImportCommandStore.getState().handle).not.toBeNull();

    const input = screen.getByLabelText('Import VS Code Theme file') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    useThemeImportCommandStore.getState().handle?.run();
    expect(clickSpy).toHaveBeenCalledOnce();

    unmount();
    expect(useThemeImportCommandStore.getState().handle).toBeNull();
  });
});
