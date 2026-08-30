import { create } from 'zustand';

import type { CommandDescriptor, CommandGroup } from '@midnite/studio-shared';

/**
 * A deliberate second store rather than a slice of `ui-store`: an open palette,
 * its query and its selection are true only for the lifetime of one keypress-to-
 * Escape session. A query string that survived a restart would be a bug wearing
 * a feature's clothes, and `ui-store`'s `partialize` would have to remember to
 * exclude every field here rather than nobody having to remember anything.
 *
 * Zustand rather than a `DialogHost`-style React Context, unlike every other
 * app-level surface: `use-keybindings.ts`'s capture-phase listener has to know
 * whether the palette is open *before* React re-renders anything, so it can
 * decide whether `Mod+g` belongs to the app or to whatever the user is typing.
 * `usePaletteStore.getState()` answers that outside the render cycle; a Context
 * value cannot be read at all without a component subscribed to it.
 */

/**
 * Palette section headings that come from typing, not from a command's own
 * `CommandGroup` — `'all'` is what an empty or sigil-less query means, and the
 * other four are the sigil grammar. `'refs'`, `'views'`, `'files'` and
 * `'journal'` have no source yet: Theme C lists commands only, and the other
 * four render "arrives in Theme X" until their own theme lands, per the phase
 * doc's "one surface, no second component invented later" resolution.
 */
export type PaletteMode = 'all' | 'commands' | 'refs' | 'views' | 'files' | 'journal';

export type ParsedPaletteQuery = { mode: PaletteMode; needle: string };

/**
 * `#` is reserved for the ops journal (Phase 22 Theme H), documented here per
 * the phase doc, but resolves like a bare needle until that source exists —
 * listing it as a recognised sigil now means Theme H only has to add a source,
 * not touch this parser.
 */
const SIGIL_MODE: Record<string, PaletteMode> = {
  '>': 'commands',
  '@': 'refs',
  ':': 'views',
  '#': 'journal',
};

/**
 * A `>` (or any sigil) only counts in the first position — mid-string it is
 * just a character the query is searching for, per the phase doc's own test
 * case for this function.
 */
export function parsePaletteQuery(input: string): ParsedPaletteQuery {
  const mode = SIGIL_MODE[input.charAt(0)];
  return mode ? { mode, needle: input.slice(1) } : { mode: 'all', needle: input };
}

/** Naive, case-insensitive substring match. Theme D replaces this with real
 * fuzzy scoring and matched-character highlighting; Theme C's job is the
 * surface, not the ranking. */
export function matchesQuery(label: string, needle: string): boolean {
  return needle.length === 0 || label.toLowerCase().includes(needle.toLowerCase());
}

/**
 * `CommandDescriptor` is a union of the literal `COMMANDS` entries, so a
 * command with no `chord` at all (`op.abort`) has no `chord` property rather
 * than one typed `chord?: undefined` — `'in'` is what actually narrows that,
 * where `.chord` on the bare union does not typecheck.
 */
export function chordOf(command: CommandDescriptor): string | undefined {
  return 'chord' in command ? command.chord : undefined;
}

export function filterCommands(
  commands: readonly CommandDescriptor[],
  needle: string,
): CommandDescriptor[] {
  return commands.filter((command) => matchesQuery(command.label, needle));
}

/** Commands grouped in first-seen order, so the palette's section order
 * follows `COMMANDS`' own order rather than an alphabetised one nobody chose. */
export function groupCommands(
  commands: readonly CommandDescriptor[],
): [CommandGroup, CommandDescriptor[]][] {
  const groups = new Map<CommandGroup, CommandDescriptor[]>();
  for (const command of commands) {
    const bucket = groups.get(command.group);
    if (bucket) bucket.push(command);
    else groups.set(command.group, [command]);
  }
  return [...groups.entries()];
}

/**
 * Whether a modal dialog is actually visible right now.
 *
 * `role="dialog"` alone is not enough: `@bilo-io/shell`'s `AppFrame` keeps its
 * own mobile nav dialog in the DOM at every viewport width, `display: none`
 * below its breakpoint rather than unmounted, so a bare `querySelector` finds
 * it even on a desktop window with no dialog open anywhere in this app.
 * `ConfirmDialog` and `PromptDialog` are conditionally rendered, not merely
 * hidden, so this only ever true-positives on those.
 */
function hasVisibleDialog(): boolean {
  if (typeof document === 'undefined') return false;
  return Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (el) => getComputedStyle(el).display !== 'none',
  );
}

type PaletteState = {
  isOpen: boolean;
  mode: PaletteMode;
  query: string;
  selectedIndex: number;

  /**
   * Refuses to open over a modal dialog rather than stacking two overlays that
   * both trap focus and both listen for Escape — the whole nesting question,
   * avoided in one check. `role="dialog"` is `ConfirmDialog`'s and
   * `PromptDialog`'s alone; the context menu is `role="menu"` and does not
   * count.
   */
  open: (mode?: PaletteMode) => void;
  close: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
};

export const usePaletteStore = create<PaletteState>()((set) => ({
  isOpen: false,
  mode: 'all',
  query: '',
  selectedIndex: 0,

  open: (mode = 'all') => {
    if (hasVisibleDialog()) return;
    set({ isOpen: true, mode, query: '', selectedIndex: 0 });
  },
  close: () => set({ isOpen: false }),
  setQuery: (query) =>
    set((state) => {
      if (query.length === 0) return { query, mode: 'all', selectedIndex: 0 };
      const parsed = parsePaletteQuery(query);
      // A typed sigil switches mode immediately; otherwise the mode a pinned
      // open() set (e.g. `palette.files`) stays sticky while the query fills
      // in around it, rather than reverting to 'all' on the next keystroke.
      return { query, mode: parsed.mode !== 'all' ? parsed.mode : state.mode, selectedIndex: 0 };
    }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
}));
