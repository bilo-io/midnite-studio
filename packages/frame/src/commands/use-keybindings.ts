import { useEffect } from 'react';

import {
  DEFAULT_KEYMAP,
  GLOBAL_CHORDS,
  YIELD_ROOTS,
  type CommandId,
  type MidniteStudioBridge,
} from '@midnite/studio-shared';

import { bridge } from '../bridge';
import { chordFromEvent } from './chord';
import type { CommandRuntime } from './command-runtime';
import { usePaletteStore } from './palette/palette-store';

/**
 * What the host app knows that the frame cannot (Phase 123 Theme D). Both are read at keypress
 * time, outside React, so they must be plain getters over a store's `getState()` rather than
 * values captured at render — and they must be stable (a module constant), or the listener is
 * re-registered on every render.
 */
export type KeybindingGates = {
  /**
   * True while an embedded browser pane is open — its tab commands (`browser.*`, bar
   * `browser.toggle`) then win `Mod+w`/`Mod+t`/`Mod+1…` over the app-wide reading. Absent means
   * "this app has no browser pane".
   */
  browserOpen?: () => boolean;
  /**
   * True when an overlay owns the keyboard and `command`'s chord must fall through untouched —
   * Studio's quick-access menu and its two switcher HUDs. The palette's own gate is the frame's
   * and needs no entry here.
   */
  blocked?: (command: CommandId) => boolean;
};

const NO_GATES: KeybindingGates = {};

/**
 * The single dispatcher for every user-triggerable action, in every suite app.
 *
 * Three sources feed it — the window's key handler, the native menu over `menu:command`, and the
 * command palette — and all three go through the same `CommandId`, resolved against the one
 * `CommandRuntime` the app builds. That is what stops a menu item and its shortcut drifting apart,
 * and it is why the terminal's escape allow-list can be expressed as "which commands are global"
 * rather than as a second list of key codes.
 *
 * A chord whose command has no entry in `runtime` is not this app's: the dispatcher ignores it and
 * the keystroke reaches the page with its default intact.
 */
export function useKeybindings(runtime: CommandRuntime, gates: KeybindingGates = NO_GATES): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const chord = chordFromEvent(event);
      if (chord === null) return;

      // A chord can carry up to THREE bindings on Mod+w/Mod+t — the browser's own tab commands
      // deliberately reuse Mod+w/Mod+1/Mod+2, which already mean repo.close/graph.focus/status.focus
      // app-wide, and terminal.new/terminal.close sit between the two. Priority: the browser
      // reading wins while the pane is open; otherwise an ENABLED terminal reading wins (there is a
      // session to act on, or a repo to open one in); otherwise the app-wide one does. Checking
      // `enabled` rather than mere presence is what lets Mod+w still close the repository when no
      // terminal session exists yet. Candidates with no handler are dropped first, so an app that
      // binds only `terminal.close` gets Mod+w for it and nothing else.
      const candidates = DEFAULT_KEYMAP.filter((b) => b.chord === chord && runtime[b.command] !== undefined);
      const browserOpen = gates.browserOpen?.() ?? false;
      const browserBinding = candidates.find(
        (b) => b.command.startsWith('browser.') && b.command !== 'browser.toggle',
      );
      const terminalBinding = candidates.find((b) => b.command.startsWith('terminal.'));
      const restBinding = candidates.find(
        (b) =>
          (!b.command.startsWith('browser.') || b.command === 'browser.toggle') &&
          !b.command.startsWith('terminal.'),
      );
      const terminalWins = terminalBinding !== undefined && runtime[terminalBinding.command]?.enabled === true;
      const binding = browserOpen
        ? (browserBinding ?? (terminalWins ? terminalBinding : restBinding))
        : terminalWins
          ? terminalBinding
          : restBinding;
      if (!binding) return;

      // A handful of chords belong to whatever widget owns the keyboard — see `YIELD_ROOTS` for
      // which, and why, per root. Matched off the event's own target rather than
      // `document.activeElement`, so a keystroke aimed at one widget is judged by THAT widget.
      if (yieldsToRoot(binding.command, event.target)) return;

      // The palette owns the keyboard while open: only its own chords (to re-focus it, or re-pin
      // the file mode) still resolve here. Every other bound chord falls through untouched, so
      // typing "Mod+g" into the search input does not fire behind it. `getState()`, not a
      // subscription — this effect must not re-run every time the palette opens or closes.
      if (
        usePaletteStore.getState().isOpen &&
        binding.command !== 'palette.open' &&
        binding.command !== 'palette.files'
      ) {
        return;
      }

      if (gates.blocked?.(binding.command)) return;

      const entry = runtime[binding.command];
      // Disabled is treated as unbound: the keystroke falls through to whatever default the
      // browser would have given it, rather than being swallowed for a command that will not run.
      if (!entry?.enabled) return;

      // A bound chord is ours: let it reach the browser's default and it types a character into
      // whatever is focused as well as running the command.
      event.preventDefault();
      event.stopPropagation();
      entry.run();
    };

    // Capture phase: xterm attaches its own listener to its textarea, and a bubble-phase listener
    // here would never see a keystroke aimed at the terminal. Capture sees it first; the terminal's
    // own custom key handler then decides whether to swallow the rest (`shouldEscapeTerminal`).
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [runtime, gates]);

  // Native menu items dispatch the same CommandIds. A suite app's preload may not expose the
  // `menu` slice, hence the widened read.
  useEffect(() => {
    const menu = bridge()?.menu as MidniteStudioBridge['menu'] | undefined;
    return menu?.onCommand((command) => {
      const entry = runtime[command];
      if (entry?.enabled) entry.run();
    });
  }, [runtime]);
}

/**
 * Whether `command`'s chord must yield to whatever root `target` sits inside — any `YIELD_ROOTS`
 * entry the target matches wins; a command absent from that root's own list still fires (e.g.
 * `Mod+1` from inside a terminal still jumps to the Graph).
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
 * The terminal must swallow almost everything — Ctrl+C belongs to the shell, not to a browser
 * shortcut — so the allow-list is deliberately tiny and derived from the keymap's `global` scope
 * (`GLOBAL_CHORDS`) rather than written out again here: `Ctrl+\``, `Mod+k` and the reload pair.
 */
export function shouldEscapeTerminal(event: KeyboardEvent): boolean {
  const chord = chordFromEvent(event);
  return chord !== null && GLOBAL_CHORDS.includes(chord);
}
