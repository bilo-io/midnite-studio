import { describe, expect, it, vi } from 'vitest';

import { displayChord } from './chord-hint';

vi.mock('../../services/keybindings/chord', () => ({ isMac: () => true }));

describe('displayChord on macOS', () => {
  it('renders Mod as the command glyph', () => {
    expect(displayChord('Mod+k')).toBe('⌘K');
  });

  /**
   * `⌘G`, not `⌘g` — no Mac key label is written in lower case. Before Phase 39
   * the toggles hard-coded an upper-case letter in JSX to get this, which was
   * right on macOS and wrong on every platform where `Mod` is `Ctrl`.
   */
  it('upper-cases the final letter', () => {
    expect(displayChord('Mod+g')).toBe('⌘G');
    expect(displayChord('Mod+b')).toBe('⌘B');
  });

  it('renders Shift as its glyph', () => {
    expect(displayChord('Mod+Shift+f')).toBe('⌘⇧F');
  });

  it('leaves a named key alone rather than shouting it', () => {
    expect(displayChord('Ctrl+`')).toBe('Ctrl+`');
    expect(displayChord('Escape')).toBe('Escape');
    expect(displayChord('Enter')).toBe('Enter');
  });
});
