import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isMac } from '../../services/keybindings/chord';
import { displayChord } from './chord-hint';

vi.mock('../../services/keybindings/chord', () => ({ isMac: vi.fn(() => true) }));

const platform = (mac: boolean) => vi.mocked(isMac).mockReturnValue(mac);

describe('displayChord on macOS', () => {
  beforeEach(() => platform(true));

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

/**
 * The branch the fix was actually FOR.
 *
 * The three old toggles hard-coded `⌘`+an upper-case letter in JSX, which was
 * right on macOS and wrong on every platform where `Mod` is `Ctrl` — so the one
 * branch that had the bug is the one that most needs an assertion.
 */
describe('displayChord elsewhere', () => {
  beforeEach(() => platform(false));

  it('renders Mod as Ctrl, and still upper-cases the key', () => {
    expect(displayChord('Mod+g')).toBe('Ctrl+G');
    expect(displayChord('Mod+k')).toBe('Ctrl+K');
  });

  it('leaves Shift spelled out, as a PC key label is', () => {
    expect(displayChord('Mod+Shift+f')).toBe('Ctrl+Shift+F');
  });

  it('leaves a named key alone', () => {
    expect(displayChord('Ctrl+`')).toBe('Ctrl+`');
    expect(displayChord('Escape')).toBe('Escape');
    expect(displayChord('Mod+Enter')).toBe('Ctrl+Enter');
  });
});
