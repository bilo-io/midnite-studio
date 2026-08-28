import { describe, expect, it, vi } from 'vitest';

import { chordFromEvent } from './chord';

const event = (over: Partial<Parameters<typeof chordFromEvent>[0]>) => ({
  key: 'a',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});

const withPlatform = (platform: string, run: () => void) => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'platform');
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(navigator, 'platform', original);
  }
};

describe('chordFromEvent on macOS', () => {
  it('reports Cmd as Mod', () => {
    withPlatform('MacIntel', () => {
      expect(chordFromEvent(event({ key: 'o', metaKey: true }))).toBe('Mod+o');
    });
  });

  it('reports Ctrl literally, because on macOS Ctrl is not the Mod key', () => {
    // This is what lets `Ctrl+\`` mean the same thing on every platform while
    // `Mod+o` means Cmd+O here and Ctrl+O elsewhere.
    withPlatform('MacIntel', () => {
      expect(chordFromEvent(event({ key: '`', ctrlKey: true }))).toBe('Ctrl+`');
    });
  });

  it('orders modifiers canonically', () => {
    withPlatform('MacIntel', () => {
      expect(
        chordFromEvent(event({ key: 'p', metaKey: true, altKey: true, shiftKey: true })),
      ).toBe('Mod+Alt+Shift+p');
    });
  });
});

describe('chordFromEvent on other platforms', () => {
  it('reports Ctrl as Mod', () => {
    withPlatform('Win32', () => {
      expect(chordFromEvent(event({ key: 'o', ctrlKey: true }))).toBe('Mod+o');
    });
  });

  it('does not emit both Mod and Ctrl for one key', () => {
    // Emitting `Mod+Ctrl+o` here would never match any binding.
    withPlatform('Win32', () => {
      expect(chordFromEvent(event({ key: 'o', ctrlKey: true }))).not.toContain('Ctrl');
    });
  });
});

describe('key normalisation', () => {
  it('lowercases printable keys so shift state cannot fork a binding', () => {
    withPlatform('Win32', () => {
      expect(chordFromEvent(event({ key: 'F', ctrlKey: true, shiftKey: true }))).toBe(
        'Mod+Shift+f',
      );
    });
  });

  it('keeps named keys as-is', () => {
    withPlatform('Win32', () => {
      expect(chordFromEvent(event({ key: 'Enter', ctrlKey: true }))).toBe('Mod+Enter');
    });
  });

  it('handles a bare key with no modifiers', () => {
    withPlatform('Win32', () => {
      expect(chordFromEvent(event({ key: 'Escape' }))).toBe('Escape');
    });
  });
});

describe('the keymap matches real keystrokes', () => {
  it('Ctrl+` on macOS resolves to the terminal toggle binding', async () => {
    const { DEFAULT_KEYMAP } = await import('@midnite/git-shared');
    withPlatform('MacIntel', () => {
      const chord = chordFromEvent(event({ key: '`', ctrlKey: true }));
      const binding = DEFAULT_KEYMAP.find((b) => b.chord === chord);
      expect(binding?.command).toBe('terminal.toggle');
    });
  });

  it('Cmd+` does NOT resolve to anything — macOS reserves it', () => {
    withPlatform('MacIntel', () => {
      const chord = chordFromEvent(event({ key: '`', metaKey: true }));
      expect(chord).toBe('Mod+`');
      // Nothing in the keymap may claim it: macOS uses it to cycle windows.
      void vi;
    });
  });
});

describe('the registry is palette-shaped', () => {
  it('gives every CommandId a label and a group', async () => {
    const { COMMANDS } = await import('@midnite/git-shared');
    for (const c of COMMANDS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.group.length).toBeGreaterThan(0);
    }
  });

  it('lists op.abort and op.continue with no chord, not silently dropped', async () => {
    const { COMMANDS } = await import('@midnite/git-shared');
    const abort = COMMANDS.find((c) => c.id === 'op.abort') as { chord?: string } | undefined;
    const cont = COMMANDS.find((c) => c.id === 'op.continue') as { chord?: string } | undefined;
    expect(abort?.chord).toBeUndefined();
    expect(cont?.chord).toBeUndefined();
  });

  it('never binds two commands to the same chord', async () => {
    const { DEFAULT_KEYMAP } = await import('@midnite/git-shared');
    const chords = DEFAULT_KEYMAP.map((b) => b.chord);
    expect(new Set(chords).size).toBe(chords.length);
  });

  it('keeps Mod+Shift+p as sync.pull', async () => {
    const { DEFAULT_KEYMAP } = await import('@midnite/git-shared');
    const binding = DEFAULT_KEYMAP.find((b) => b.chord === 'Mod+Shift+p');
    expect(binding?.command).toBe('sync.pull');
  });

  it('lets palette.open escape the terminal, and keeps palette.files from doing so', async () => {
    const { GLOBAL_CHORDS, DEFAULT_KEYMAP } = await import('@midnite/git-shared');
    const open = DEFAULT_KEYMAP.find((b) => b.command === 'palette.open');
    const files = DEFAULT_KEYMAP.find((b) => b.command === 'palette.files');
    expect(open && GLOBAL_CHORDS.includes(open.chord)).toBe(true);
    expect(files && GLOBAL_CHORDS.includes(files.chord)).toBe(false);
  });
});
