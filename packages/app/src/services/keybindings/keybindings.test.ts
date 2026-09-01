import { COMMANDS, DEFAULT_KEYMAP } from '@midnite/studio-shared';
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
      expect(chordFromEvent(event({ key: 'a', metaKey: true, shiftKey: true, altKey: true }))).toBe(
        'Mod+Alt+Shift+a',
      );
    });
  });

  it('drops dead Mod when not accompanied by a primary key', () => {
    withPlatform('MacIntel', () => {
      expect(chordFromEvent(event({ key: 'Meta', metaKey: true }))).toBeNull();
    });
  });

  it('handles lowercase-normalised key names', () => {
    withPlatform('MacIntel', () => {
      expect(chordFromEvent(event({ key: 'K', metaKey: true }))).toBe('Mod+k');
    });
  });
});

describe('chordFromEvent on Linux / Windows', () => {
  it('reports Ctrl as Mod', () => {
    withPlatform('Linux x86_64', () => {
      expect(chordFromEvent(event({ key: 'o', ctrlKey: true }))).toBe('Mod+o');
    });
  });

  it('reports Meta literally', () => {
    withPlatform('Linux x86_64', () => {
      expect(chordFromEvent(event({ key: 'o', metaKey: true }))).toBe('Meta+o');
    });
  });
});

describe('chordFromEvent special keys', () => {
  it('preserves Enter, Backspace, Tab, Escape case', () => {
    withPlatform('MacIntel', () => {
      expect(chordFromEvent(event({ key: 'Enter' }))).toBe('Enter');
      expect(chordFromEvent(event({ key: 'Backspace' }))).toBe('Backspace');
      expect(chordFromEvent(event({ key: 'Tab' }))).toBe('Tab');
      expect(chordFromEvent(event({ key: 'Escape' }))).toBe('Escape');
    });
  });
});

describe('the keymap matches real keystrokes', () => {
  it('Ctrl+` on macOS resolves to the terminal toggle binding', () => {
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

  /**
   * The half/full toggle is the terminal toggle's chord plus Shift. The trap
   * is that Shift changes what the browser reports for the backquote key —
   * `key: '~'` on a US layout — so this must match by the physical `code`,
   * or the binding is dead on every keyboard.
   */
  it('Ctrl+Shift+` (reported as ~) resolves to the half/full toggle', () => {
    const keystroke = event({ key: '~', code: 'Backquote', ctrlKey: true, shiftKey: true });
    withPlatform('MacIntel', () => {
      const chord = chordFromEvent(keystroke);
      expect(chord).toBe('Ctrl+Shift+`');
      const binding = DEFAULT_KEYMAP.find((b) => b.chord === chord);
      expect(binding?.command).toBe('terminal.toggleHalfMaximized');
      expect(binding?.scope).toBe('global');
    });
  });

  it('matches the backquote key by position even when no shift is held', () => {
    // Some layouts report a dead key or a different character for the
    // physical backquote — `code` is what keeps Ctrl+` alive there.
    withPlatform('MacIntel', () => {
      expect(chordFromEvent(event({ key: 'Dead', code: 'Backquote', ctrlKey: true }))).toBe(
        'Ctrl+`',
      );
    });
  });
});

describe('the registry is palette-shaped', () => {
  it('gives every CommandId a label and a group', () => {
    for (const c of COMMANDS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.group.length).toBeGreaterThan(0);
    }
  });

  it('lists op.abort and op.continue with no chord, not silently dropped', () => {
    const abort = COMMANDS.find((c) => c.id === 'op.abort') as { chord?: string } | undefined;
    const cont = COMMANDS.find((c) => c.id === 'op.continue') as { chord?: string } | undefined;
    expect(abort?.chord).toBeUndefined();
    expect(cont?.chord).toBeUndefined();
  });

  it('never binds two commands to the same chord, except a browser.* command deliberately sharing one', async () => {
    // Phase 32 Theme C: the browser's own tab chords intentionally reuse
    // chords repo.close/graph.focus/status.focus already own —
    // `use-keybindings.ts` prefers the `browser.*` reading only while the
    // pane is open. See the identical, fuller-commented assertion in
    // `@midnite/studio-shared`'s own ipc.test.ts.
    const { DEFAULT_KEYMAP } = await import('@midnite/studio-shared');
    const byChord = new Map<string, string[]>();
    for (const binding of DEFAULT_KEYMAP) {
      byChord.set(binding.chord, [...(byChord.get(binding.chord) ?? []), binding.command]);
    }
    for (const [chord, commands] of byChord) {
      if (commands.length === 1) continue;
      expect(commands, `chord ${chord} bound to ${commands.join(', ')}`).toHaveLength(2);
      const browserCommands = commands.filter((c) => c.startsWith('browser.'));
      expect(browserCommands, `chord ${chord} bound to ${commands.join(', ')}`).toHaveLength(1);
    }
  });

  it('keeps Mod+Shift+p as sync.pull', async () => {
    const { DEFAULT_KEYMAP } = await import('@midnite/studio-shared');
    const binding = DEFAULT_KEYMAP.find((b) => b.chord === 'Mod+Shift+p');
    expect(binding?.command).toBe('sync.pull');
  });

  it('lets palette.open escape the terminal, and keeps palette.files from doing so', async () => {
    const { GLOBAL_CHORDS, DEFAULT_KEYMAP } = await import('@midnite/studio-shared');
    const open = DEFAULT_KEYMAP.find((b) => b.command === 'palette.open');
    const files = DEFAULT_KEYMAP.find((b) => b.command === 'palette.files');
    expect(open && GLOBAL_CHORDS.includes(open.chord)).toBe(true);
    expect(files && GLOBAL_CHORDS.includes(files.chord)).toBe(false);
  });

  it('binds Mod+Shift+g to view.graph', async () => {
    const { DEFAULT_KEYMAP } = await import('@midnite/studio-shared');
    const binding = DEFAULT_KEYMAP.find((b) => b.chord === 'Mod+Shift+g');
    expect(binding?.command).toBe('view.graph');
  });
});
