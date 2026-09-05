import { useEffect } from 'react';

import { DEFAULT_KEYMAP, GLOBAL_CHORDS, YIELD_ROOTS, type CommandId } from '@midnite/studio-shared';

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

      // A chord can carry up to THREE bindings on Mod+w/Mod+t — the browser's
      // own tab commands (Theme C) deliberately reuse Mod+w/Mod+1/Mod+2, which
      // already mean repo.close/graph.focus/status.focus app-wide, and
      // terminal.new/terminal.close sit between the two. Priority: the
      // browser reading wins while the pane is open; otherwise an ENABLED
      // terminal reading wins (there is a session to act on, or a repo to
      // open one in); otherwise the app-wide one does. Checking `enabled`
      // rather than mere presence is what lets Mod+w still close the
      // repository when no terminal session exists yet, instead of the
      // keystroke silently doing nothing. `getState()`, not a subscription,
      // so the effect need not re-run on every browser/terminal state change.
      const candidates = DEFAULT_KEYMAP.filter((b) => b.chord === chord);
      const browserOpen = useUiStore.getState().browserOpen;
      const browserBinding = candidates.find((b) => b.command.startsWith('browser.'));
      const terminalBinding = candidates.find((b) => b.command.startsWith('terminal.'));
      const restBinding = candidates.find(
        (b) => !b.command.startsWith('browser.') && !b.command.startsWith('terminal.'),
      );
      const terminalWins = terminalBinding !== undefined && runtime[terminalBinding.command].enabled;
      const binding = browserOpen
        ? (browserBinding ?? (terminalWins ? terminalBinding : restBinding))
        : (terminalWins ? terminalBinding : restBinding);
      if (!binding) return;

      // A handful of chords belong to whatever widget owns the keyboard —
      // see `YIELD_ROOTS` (Phase 64 Theme D generalised this from a single
      // hard-coded `.xterm` check) for which, and why, per root. Matched off
      // the event's own target rather than `document.activeElement`, so a
      // keystroke aimed at one widget is judged by THAT widget.
      if (yieldsToRoot(binding.command, event.target)) return;

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

      // Same gate, for the quick-access menu (Phase 58 Theme E): while it is
      // open, every OTHER bound chord falls through untouched rather than
      // firing behind the menu's back. Its own single-letter mnemonics
      // (`L`/`N`/`I`/`G`) are not in `DEFAULT_KEYMAP` at all — no unmodified
      // single-letter chord is — so they were never at risk of double-firing
      // here; this gate exists for every chord that IS bound (arrow keys,
      // Escape-adjacent commands, a future addition) so the menu keeps
      // uncontested ownership of the keyboard for as long as it is up.
      if (useUiStore.getState().quickAccessOpen) return;

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
 * Whether `command`'s chord must yield to whatever root `target` sits inside
 * — any `YIELD_ROOTS` entry the target matches wins; a command absent from
 * that root's own list still fires (e.g. `Mod+1` from inside a terminal
 * still jumps to the Graph).
 */
function yieldsToRoot(command: CommandId, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return YIELD_ROOTS.some(
    (root) => target.closest(root.selector) !== null && root.commands.includes(command),
  );
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
