import { useEffect } from 'react';

import { DEFAULT_KEYMAP, GLOBAL_CHORDS } from '@midnite/git-shared';

import { bridge } from '../bridge';
import { usePaletteStore } from '../../store/palette-store';
import { useUiStore } from '../../store/ui-store';
import { chordFromEvent } from './chord';
import type { CommandRuntime } from './use-command-handlers';

/**
 * The single dispatcher for every user-triggerable action.
 *
 * Three sources feed it — the window's key handler, the native menu over
 * `menu:command`, and the command palette — and all three go through the same
 * `CommandId`, resolved against the one `CommandRuntime` `useCommandHandlers`
 * builds. That is what stops a menu item and its shortcut drifting apart, and
 * it is why the terminal's escape allow-list can be expressed as "which
 * commands are global" rather than as a second list of key codes.
 */
export function useKeybindings(runtime: CommandRuntime): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chord = chordFromEvent(event);
      if (chord === null) return;

      // A chord can carry TWO bindings — the browser's own tab commands
      // (Theme C) deliberately reuse Mod+w/Mod+1/Mod+2, which already mean
      // repo.close/graph.focus/status.focus app-wide. While the pane is
      // open the browser reading wins; otherwise the app-wide one does. Two
      // real commands can never share a chord OUTSIDE this one carve-out —
      // `getState()`, not a subscription, so the effect need not re-run on
      // every browser open/close.
      const candidates = DEFAULT_KEYMAP.filter((b) => b.chord === chord);
      const browserOpen = useUiStore.getState().browserOpen;
      const binding = browserOpen
        ? (candidates.find((b) => b.command.startsWith('browser.')) ??
          candidates.find((b) => !b.command.startsWith('browser.')))
        : candidates.find((b) => !b.command.startsWith('browser.'));
      if (!binding) return;

      // The palette owns the keyboard while open: only its own chords (to
      // re-focus it, or re-pin the file mode) still resolve here. Every other
      // bound chord falls through untouched, so typing "Mod+g" into the
      // search input does not toggle the repos panel out from under it.
      // `getState()`, not a subscription — this effect must not re-run every
      // time the palette opens or closes.
      if (
        usePaletteStore.getState().isOpen &&
        binding.command !== 'palette.open' &&
        binding.command !== 'palette.files'
      ) {
        return;
      }

      const entry = runtime[binding.command];
      // Disabled is treated as unbound: the keystroke falls through to
      // whatever default the browser would have given it, rather than being
      // swallowed for a command that will not run.
      if (!entry.enabled) return;

      // A bound chord is ours: let it reach the browser's default and it types
      // a character into whatever is focused as well as running the command.
      event.preventDefault();
      event.stopPropagation();
      entry.run();
    };

    // Capture phase: xterm attaches its own listener to its textarea, and a
    // bubble-phase listener here would never see a keystroke aimed at the
    // terminal. Capture sees it first; the terminal's own custom key handler
    // then decides whether to swallow the rest (see attachEscapeHandler).
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [runtime]);

  // Native menu items dispatch the same CommandIds.
  useEffect(() => {
    const off = bridge()?.menu.onCommand((command) => {
      const entry = runtime[command];
      if (entry.enabled) entry.run();
    });
    return off;
  }, [runtime]);
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
  const chord = chordFromEvent(event);
  return chord !== null && GLOBAL_CHORDS.includes(chord);
}
