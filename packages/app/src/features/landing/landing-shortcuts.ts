import { COMMANDS, type CommandId } from '@midnite/studio-shared';

import { COMMAND_ICONS } from '../palette/command-icons';
import { chordOf } from '../../store/palette-store';
import { chordFor, displayChord } from '../status-bar/chord-hint';
import type { IconComponent } from '../../components/icon-button';

/**
 * The two batches of shortcuts the landing carousel teaches, as ids only.
 *
 * Ids, deliberately — not labels, chords or glyphs. All three of those
 * already exist exactly once in the app: the label and the chord in
 * `COMMANDS` (`shared/src/keybindings.ts`, the single source of truth this
 * repo's conventions name by file), the glyph in `COMMAND_ICONS`. A page
 * whose whole job is *telling the user which key does what* is the last place
 * that should carry a fourth copy — a rebound chord has to be right here
 * without anyone remembering this file exists.
 *
 * What this file does own is the curation and the one-line gloss: which of
 * the 43 commands are worth a new user's attention, in what order, and what
 * each is *for* (as opposed to what it is called). `COMMANDS` labels are
 * imperative — "Toggle Repositories" — which is right for a menu row and
 * says nothing on a cheat sheet.
 */

export type ShortcutCard = {
  id: CommandId;
  /** From `COMMANDS` — never restated here. */
  label: string;
  /** From the keymap, rendered for this platform (`⌘K` / `Ctrl+K`). */
  chord: string;
  icon: IconComponent;
  /** Why you would reach for it. */
  hint: string;
};

export type ShortcutBatch = {
  title: string;
  blurb: string;
  cards: readonly ShortcutCard[];
};

/** The glosses, keyed by id — the only per-command prose this page adds. */
const HINTS: Partial<Record<CommandId, string>> = {
  'palette.open': 'Every command, by name',
  'palette.files': 'Jump straight to a file',
  'search.open': 'Across commits, files and messages',
  'repos.toggle': 'Show or hide the repository list',
  'terminal.toggle': 'The integrated shell, on any platform',
  'browser.toggle': 'The embedded browser pane',
  'fab.toggle': 'The agent loop console',
  'view.graph': 'Back to the commit graph',
  'graph.focus': 'Put the keyboard in the graph',
  'status.focus': 'Put the keyboard in Changes',
  'status.commit': 'Commit what is staged',
  'sync.pull': 'Fetch and integrate',
  'sync.push': 'Publish the current branch',
  'terminal.new': 'A fresh shell session',
  'app.reload': 'Reload the window, as a browser would',
  'app.lock': 'Lock the screen behind your passcode',
};

const BATCH_ONE: readonly CommandId[] = [
  'palette.open',
  'palette.files',
  'search.open',
  'repos.toggle',
  'terminal.toggle',
  'browser.toggle',
  'fab.toggle',
  'view.graph',
];

const BATCH_TWO: readonly CommandId[] = [
  'status.commit',
  'sync.pull',
  'sync.push',
  'graph.focus',
  'status.focus',
  'terminal.new',
  'app.reload',
  'app.lock',
];

/**
 * A command's chord, from the registry, rendered for this platform — or
 * `undefined` for a command that has none.
 *
 * Exported because slide 4 needs the FAB's chord on its own, outside a card,
 * and the alternative was a second literal `'Mod+m'` beside the one in
 * `COMMANDS` — which is the exact duplication this whole module exists to
 * avoid. `chordOf` rather than `command.chord`: `CommandDescriptor` is the
 * const array's own union, so half its members have no such property to read
 * at the type level.
 */
export function commandChord(id: CommandId): string | undefined {
  const command = COMMANDS.find((c) => c.id === id);
  if (!command) return undefined;
  const declared = chordOf(command);
  return declared === undefined ? undefined : displayChord(chordFor(id, declared));
}

/**
 * An id becomes a card by reading the registry.
 *
 * A command with no chord is dropped rather than shown blank: this page's
 * promise is "here is the key", and a row that cannot keep it is noise. Both
 * batches above name only bound commands today, so nothing is currently
 * dropped — the filter is what keeps the page honest the day one of them
 * loses its chord, the way `view.refresh` and `sync.fetch` already have.
 */
function cardsFor(ids: readonly CommandId[]): readonly ShortcutCard[] {
  return ids.flatMap((id) => {
    const command = COMMANDS.find((c) => c.id === id);
    const chord = commandChord(id);
    if (!command || chord === undefined) return [];
    return [
      {
        id,
        label: command.label,
        chord,
        icon: COMMAND_ICONS[id],
        hint: HINTS[id] ?? '',
      },
    ];
  });
}

export const SHORTCUT_BATCHES: readonly ShortcutBatch[] = [
  {
    title: 'Getting around',
    blurb: 'The panels and the two ways to find anything.',
    cards: cardsFor(BATCH_ONE),
  },
  {
    title: 'Getting work done',
    blurb: 'Commit, sync, and the keyboard-first surfaces.',
    cards: cardsFor(BATCH_TWO),
  },
];
