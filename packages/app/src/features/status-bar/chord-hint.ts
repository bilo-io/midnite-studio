import { COMMANDS, DEFAULT_KEYMAP, type CommandId } from '@midnite/studio-shared';

import { chordOf } from '../../store/palette-store';
import { isMac } from '../../services/keybindings/chord';

/**
 * Look up the chord for a command from the keymap.
 *
 * Widened to `CommandId` (the full shared union) so any toggle the status bar
 * gains — repos, terminal, browser, … — can call this without touching the
 * function. Previously the parameter was a narrow two-member union in
 * `footer-bar.tsx`; keeping it narrow would require every new caller to widen
 * it by hand.
 */
export function chordFor(command: CommandId, fallback: string): string {
  return DEFAULT_KEYMAP.find((b) => b.command === command)?.chord ?? fallback;
}

/**
 * Render a keymap chord as a key hint the user's platform actually uses.
 *
 * `Mod` is how the keymap spells "Cmd on macOS, Ctrl elsewhere" — correct for
 * comparison, meaningless on a button. Render the modifier the user's keyboard
 * actually has; `Ctrl+`` and the rest pass through untouched.
 *
 * Shift becomes ⇧ on macOS for the same reason: a hint that reads `⌘Shift+b`
 * is half symbol and half word, which is not how any Mac key label is written.
 */
export function displayChord(chord: string): string {
  const platform = isMac()
    ? chord.replace(/^Mod\+/, '⌘').replace(/Shift\+/, '⇧')
    : chord.replace(/^Mod\+/, 'Ctrl+');
  return upperFinalLetter(platform);
}

/**
 * `⌘G`, not `⌘g`.
 *
 * The keymap stores chords lower-cased (`Mod+g`) because that is what
 * comparison needs; no Mac key label is ever written in lower case. Before
 * Phase 39 the three status-bar toggles worked around this by hard-coding
 * `⌘`+bold-`G` in JSX — which was right on macOS and wrong everywhere `Mod` is
 * `Ctrl`. Doing it here fixes both at once.
 *
 * Only a trailing letter that is the **whole final key** is touched — one that
 * begins the string or follows a modifier (`+`, `⌘`, `⇧`). A named key passes
 * through untouched: `Escape` also ends in a lone `e`, and a naive
 * `/([a-z])$/` turns it into `EscapE`.
 */
function upperFinalLetter(chord: string): string {
  return chord.replace(/(^|[+⌘⇧])([a-z])$/, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * A command's chord straight from the registry, rendered for this platform —
 * or `undefined` for a command that has none.
 *
 * `chordFor`'s two-argument shape asks the caller for a fallback, which every
 * caller answers with a literal copy of the chord it is looking up. That is
 * fine for a control hard-wired to one command (a fallback that has drifted
 * still renders *something*), and wrong for the surfaces that teach chords in
 * bulk — the landing cheat sheet and the nav rail — where a literal per row is
 * exactly the duplication `COMMANDS` exists to prevent.
 *
 * `chordOf` rather than `command.chord`: `CommandDescriptor` is the const
 * array's own union, so half its members have no such property to read at the
 * type level.
 */
export function commandChord(id: CommandId): string | undefined {
  const command = COMMANDS.find((c) => c.id === id);
  if (!command) return undefined;
  const declared = chordOf(command);
  return declared === undefined ? undefined : displayChord(chordFor(id, declared));
}
