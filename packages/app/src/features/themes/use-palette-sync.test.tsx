import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StudioPalette } from './theme-types';
import { usePaletteStore } from './palette-store';
import { usePaletteSync } from './use-palette-sync';

function Harness() {
  usePaletteSync();
  return null;
}

/** A minimal, valid palette that deliberately omits `--ring` from `chrome`. */
const NO_RING_PALETTE: StudioPalette = {
  id: 'test-no-ring',
  label: 'No Ring (test)',
  appearance: 'dark',
  chrome: { '--background': '0 0% 0%', '--foreground': '0 0% 100%' },
  terminal: {
    background: '#000000',
    foreground: '#ffffff',
    black: '#000000',
    red: '#000000',
    green: '#000000',
    yellow: '#000000',
    blue: '#000000',
    magenta: '#000000',
    cyan: '#000000',
    white: '#000000',
    brightBlack: '#000000',
    brightRed: '#000000',
    brightGreen: '#000000',
    brightYellow: '#000000',
    brightBlue: '#000000',
    brightMagenta: '#000000',
    brightCyan: '#000000',
    brightWhite: '#000000',
  },
  editor: { base: 'vs-dark', rules: [], colors: {} },
  highlight: 'github-dark',
};

describe('usePaletteSync — removeProperty (Phase 64 Theme B)', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.cssText = '';
    usePaletteStore.setState({
      activePaletteId: 'jetbrains-darcula',
      terminalPaletteOverride: null,
      editorPaletteOverride: null,
      userPalettes: [],
    });
  });

  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  it('sets a token the active palette defines', () => {
    render(<Harness />);
    expect(document.documentElement.style.getPropertyValue('--ring')).not.toBe('');
  });

  it('clears a token the NEW active palette omits, rather than stranding the old value', () => {
    render(<Harness />);
    expect(document.documentElement.style.getPropertyValue('--ring')).not.toBe('');

    act(() => {
      usePaletteStore.getState().addUserPalette(NO_RING_PALETTE);
      usePaletteStore.getState().setActivePalette(NO_RING_PALETTE.id);
    });

    expect(document.documentElement.style.getPropertyValue('--ring')).toBe('');
    // The tokens the new palette DOES set still land.
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('0 0% 0%');
  });
});
