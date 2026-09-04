import type { CommandId } from '@midnite/studio-shared';

import { commandChord } from '../features/status-bar/chord-hint';
import type { ViewId } from '../store/ui-store';

/**
 * The chord that reaches each rail view, keyed by view — the sibling of
 * `nav-icons`' `VIEW_ICON` map, and a separate module for the same reason: the
 * rail's item list already carries ordering and the forge gating, and this is
 * read by the rail rows and the rail footer both.
 *
 * A **CommandId**, never a chord literal. `COMMANDS`
 * (`shared/src/keybindings.ts`) is this repo's single source of truth for what
 * key does what, so a rebound command has to move the rail's tooltip with it
 * without anyone remembering this file exists — the same argument
 * `landing-shortcuts.ts` makes for storing ids rather than chords.
 *
 * Only four views have one, and the map is deliberately partial rather than
 * exhaustive: a view with no chord gets no tooltip at all, not an empty one.
 *
 * Where a view has two chords, this names the one that navigates there
 * UNCONDITIONALLY. `graph` is the case that matters: `graph.focus` is `Mod+1`,
 * which is shorter, but `use-keybindings.ts` re-reads `Mod+1` as
 * `browser.selectTab1` while the browser pane is open — so the rail would be
 * promising a key that sometimes switches a browser tab instead.
 * `view.graph`'s `Mod+Shift+g` has no such carve-out.
 *
 * `changes` is the one entry that cannot follow that rule: `status.focus`
 * (`Mod+2`) is the only chord it has, and it carries the same browser-pane
 * caveat. It is listed anyway — with the pane closed, which is the common
 * case, it does exactly what the row says, and the landing page already
 * teaches it.
 */
export const VIEW_COMMAND: Partial<Record<ViewId, CommandId>> = {
  files: 'view.files',
  search: 'search.open',
  graph: 'view.graph',
  changes: 'status.focus',
  issues: 'view.issues',
};

/** The rail tooltip's text for a view, or `undefined` where there is no chord. */
export function navChord(view: ViewId): string | undefined {
  const id = VIEW_COMMAND[view];
  return id === undefined ? undefined : commandChord(id);
}
