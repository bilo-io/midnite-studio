import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { usePaletteStore } from '../../store/palette-store';

import { FilesToggle } from './files-toggle';
import { PaletteToggle } from './palette-toggle';

const pressed = (id: string) =>
  screen.getByTestId(id).getAttribute('aria-pressed') === 'true';

afterEach(cleanup);

beforeEach(() => {
  usePaletteStore.getState().close();
});

describe('the palette pair on the rail', () => {
  it('neither is lit while the palette is shut', () => {
    render(
      <>
        <PaletteToggle />
        <FilesToggle />
      </>,
    );
    expect(pressed('palette-toggle')).toBe(false);
    expect(pressed('files-toggle')).toBe(false);
  });

  /**
   * Exactly one is ever lit. `setQuery` re-derives `mode` from a typed sigil,
   * so typing into one mode can legitimately move the lit state to the other
   * button mid-keystroke — correct behaviour, and easy to mistake for a bug, so
   * it is asserted rather than assumed.
   */
  it('lights exactly one, whichever mode is open', () => {
    render(
      <>
        <PaletteToggle />
        <FilesToggle />
      </>,
    );

    fireEvent.click(screen.getByTestId('palette-toggle'));
    expect(pressed('palette-toggle')).toBe(true);
    expect(pressed('files-toggle')).toBe(false);

    fireEvent.click(screen.getByTestId('files-toggle'));
    expect(pressed('palette-toggle')).toBe(false);
    expect(pressed('files-toggle')).toBe(true);
  });

  it('opens the palette in its own mode', () => {
    render(<FilesToggle />);
    fireEvent.click(screen.getByTestId('files-toggle'));
    expect(usePaletteStore.getState().isOpen).toBe(true);
    expect(usePaletteStore.getState().mode).toBe('files');
  });

  /** A control reporting `aria-pressed` that cannot un-press is lying. */
  it('closes the palette on a second press of the lit button', () => {
    render(<PaletteToggle />);
    const button = screen.getByTestId('palette-toggle');
    fireEvent.click(button);
    expect(usePaletteStore.getState().isOpen).toBe(true);
    fireEvent.click(button);
    expect(usePaletteStore.getState().isOpen).toBe(false);
  });
});
