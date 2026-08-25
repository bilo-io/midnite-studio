import { useEffect } from 'react';

import { DEFAULT_KEYMAP, GLOBAL_CHORDS, type CommandId } from '@midnite/git-shared';

import { bridge } from '../bridge';
import { chordFromEvent } from './chord';

export type CommandHandlers = Partial<Record<CommandId, () => void>>;

/**
 * The single dispatcher for every user-triggerable action.
 *
 * Three sources feed it — the window's key handler, the native menu over
 * `menu:command`, and (later) a command palette — and all three go through the
 * same `CommandId`. That is what stops a menu item and its shortcut drifting
 * apart, and it is why the terminal's escape allow-list can be expressed as
 * "which commands are global" rather than as a second list of key codes.
 */
export function useKeybindings(handlers: CommandHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chord = chordFromEvent(event);
      const binding = DEFAULT_KEYMAP.find((b) => b.chord === chord);
      if (!binding) return;

      const handler = handlers[binding.command];
      if (!handler) return;

      // A bound chord is ours: let it reach the browser's default and it types
      // a character into whatever is focused as well as running the command.
      event.preventDefault();
      event.stopPropagation();
      handler();
    };

    // Capture phase: xterm attaches its own listener to its textarea, and a
    // bubble-phase listener here would never see a keystroke aimed at the
    // terminal. Capture sees it first; the terminal's own custom key handler
    // then decides whether to swallow the rest (see attachEscapeHandler).
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handlers]);

  // Native menu items dispatch the same CommandIds.
  useEffect(() => {
    const off = bridge()?.menu.onCommand((command) => handlers[command]?.());
    return off;
  }, [handlers]);
}

/**
 * Whether xterm should let a keystroke through to the app.
 *
 * The terminal must swallow almost everything — Ctrl+C belongs to the shell,
 * not to a browser shortcut — so the allow-list is deliberately tiny and
 * derived from the keymap's `global` scope rather than written out again here.
 * Today that is exactly `Ctrl+\``: toggling the terminal has to work while the
 * terminal has focus, which is the one case where a shortcut genuinely
 * outranks the shell.
 */
export function shouldEscapeTerminal(event: KeyboardEvent): boolean {
  return GLOBAL_CHORDS.includes(chordFromEvent(event));
}
