/**
 * Command identifiers and the default keymap.
 *
 * Every user-triggerable action is a CommandId, and *nothing* dispatches a
 * keystroke directly. Three sources feed the same dispatcher: the renderer's
 * key handler, the native menu (`mstudio:menu:command`), and the command
 * palette. One registry means a menu item and its shortcut can never drift,
 * and the palette gets its contents for free — including the ids below that
 * have no chord at all (`view.refresh`, `sync.fetch`, `op.abort`,
 * `op.continue`, …), declared here so the palette and the native menu list
 * them as present-but-unbound, exactly like every other command.
 */

/**
 * Palette section headings. A plain string literal union rather than derived
 * from the `id` prefix (e.g. `sync.` → `'sync'`): the prefixes are consistent
 * by habit, not by contract, and a palette that regroups itself when someone
 * renames an id is a palette with a trap in it. `status.focus` and
 * `status.commit` share a prefix and land in different groups — `focus` is a
 * view action, `commit` is a status action — which a derived group could
 * never express.
 */
export type CommandGroup =
  | 'repository'
  | 'view'
  | 'sync'
  | 'terminal'
  | 'status'
  | 'graph'
  | 'operation'
  | 'palette'
  | 'files'
  | 'window';

/**
 * Where a command is allowed to fire. The terminal swallows almost every
 * keystroke (it must — `Ctrl+C` belongs to the shell), so a chord only escapes
 * xterm when its command is `global`. See the allow-list in
 * `app/src/services/keybindings`.
 */
export type CommandScope = 'global' | 'app';

type CommandDescriptorInput = {
  id: string;
  /** Shown in the native menu and the command palette. */
  label: string;
  group: CommandGroup;
  /**
   * Normalised chord: modifiers in the order `Cmd+Ctrl+Alt+Shift`, then the key
   * (`KeyboardEvent.key`, lowercased for printable characters). `Mod` means
   * Cmd on macOS and Ctrl elsewhere. Omitted entirely for a command with no
   * shortcut — it is still a first-class palette row.
   */
  chord?: string;
  /** Meaningless without a `chord`; defaults to `'app'` when one is present. */
  scope?: CommandScope;
};

/**
 * The single source of truth. `CommandId`, `COMMAND_IDS`, `DEFAULT_KEYMAP` and
 * `GLOBAL_CHORDS` all derive from this array — there is deliberately nowhere
 * else to add a command.
 */
export const COMMANDS = [
  /**
   * Ctrl+` on EVERY platform, macOS included. macOS reserves Cmd+` for
   * "cycle windows within an application" — taking it would break a system
   * gesture, and VS Code sets the same precedent with Ctrl+` on mac.
   * `global` scope: this must work while the terminal itself has focus, so
   * it's on the xterm escape allow-list.
   */
  {
    id: 'terminal.toggle',
    label: 'Toggle Terminal',
    group: 'terminal',
    chord: 'Ctrl+`',
    scope: 'global',
  },
  /**
   * The terminal toggle's own chord plus Shift — one gesture family: Ctrl+`
   * opens/closes the panel, holding Shift as well switches it between half
   * and full height. Ctrl, not Mod, for the same reason as `terminal.toggle`:
   * the pair must feel identical on every platform, and on macOS Mod is Cmd.
   */
  {
    id: 'terminal.toggleHalfMaximized',
    label: 'Toggle Terminal Half / Full Height',
    group: 'terminal',
    chord: 'Ctrl+Shift+`',
    scope: 'global',
  },
  { id: 'terminal.focus', label: 'Focus Terminal', group: 'terminal' },
  /**
   * `Mod+t`/`Mod+w` for the terminal panel — a new plain shell, and closing
   * whichever session is selected (with the same "still running" confirm the
   * session list's own close button shows). `app` scope, same reasoning as
   * `repos.toggle`: neither chord needs to reach through xterm itself, and
   * doing so on non-mac platforms would steal Ctrl+W from readline's own
   * delete-word-backward binding. See the collision note on `browser.newTab`/
   * `browser.closeTab` below — these two chords are shared three ways.
   */
  { id: 'terminal.new', label: 'New Terminal', group: 'terminal', chord: 'Mod+t' },
  { id: 'terminal.close', label: 'Close Terminal', group: 'terminal', chord: 'Mod+w' },
  /**
   * Mod+g ("G" for Git). `app` scope, unlike the terminal toggle: showing the
   * repository list while the terminal has focus is not something you reach
   * for mid-command.
   */
  { id: 'repos.toggle', label: 'Toggle Repositories', group: 'view', chord: 'Mod+g' },
  /**
   * Mod+b toggles the browser pane — a chrome stub with no engine yet, but a
   * real panel rather than a notice. `app` scope, like `repos.toggle`: a
   * browser is not something you reach for mid-command with the terminal
   * focused.
   */
  { id: 'browser.toggle', label: 'Toggle Browser', group: 'view', chord: 'Mod+b' },
  /**
   * Mod+l — "L" for Loops, which is what this used to open directly. Phase 58
   * Theme E put a menu behind it instead (Loops, Notes, and two disabled
   * future leaves, each one mnemonic-keystroke away once the menu is open),
   * so the label changed with the behaviour: a stale "Toggle Loop Panel"
   * would surface in the palette and the native menu bar, not just in source.
   * It used to be Mod+m, picked by elimination back when g and b were the
   * taken letters; a mnemonic that names the panel beats one that names the
   * leftovers, and Loops is still one keystroke behind this one (`L`, then `L`
   * again) rather than two.
   *
   * Listed in `TERMINAL_YIELD_COMMANDS` below, unlike the g/b toggles beside
   * it: `Mod` is Ctrl off macOS, and `Ctrl+L` there is the shell's own
   * clear-screen. Same carve-out as the reload pair, for the same reason — the
   * dispatcher grabs every bound chord app-wide, terminal focus included, so
   * `app` scope alone would swallow it.
   */
  { id: 'fab.toggle', label: 'Quick Access', group: 'view', chord: 'Mod+l' },
  /**
   * Chord-free, like `view.refresh`/`sync.fetch` above: Notes is one of the
   * quick-access menu's own rows (`N`), so a global chord for it would be a
   * second way to reach the same place rather than a saved keystroke. Palette
   * and menu-bar discoverability only.
   */
  { id: 'notes.toggle', label: 'Notes', group: 'view' },
  /**
   * Mod+Shift+a for the commit-activity timeline. Shifted because plain Mod+a
   * is select-all everywhere text can be selected, and `app` scope like the
   * other panel toggles: a chart is not something you reach for mid-command.
   */
  { id: 'activity.toggle', label: 'Toggle Activity Timeline', group: 'view', chord: 'Mod+Shift+a' },
  /**
   * The browser's own tab chords (Theme C), all sharing a chord with an
   * app-wide command that means something else with the pane closed —
   * `Mod+w` is `repo.close`, `Mod+1`/`Mod+2` are `graph.focus`/`status.focus`.
   * `use-keybindings.ts` resolves the collision by preferring a `browser.*`
   * binding ONLY while `browserOpen` is true, so Mod+w still closes the
   * repository the rest of the time. An app-scoped Mod+w with no such
   * carve-out would close the window's repository out from under a browser
   * user reaching to close a tab — the scoping is load-bearing, not cosmetic.
   *
   * `Mod+w`/`Mod+t` are a THREE-way chord now: `terminal.close`/`terminal.new`
   * (below) sit between the browser reading and the app-wide fallback, so
   * `use-keybindings.ts`'s priority is browser (pane open) > terminal (a
   * session exists to act on) > repo.close/unbound. Neither of these gets a
   * native Electron menu accelerator (see `menu.ts`) — an OS-level accelerator
   * fires unconditionally regardless of which of the three contexts is
   * actually active, which is exactly the bug this carve-out exists to avoid.
   */
  { id: 'browser.newTab', label: 'New Browser Tab', group: 'view', chord: 'Mod+t' },
  { id: 'browser.closeTab', label: 'Close Browser Tab', group: 'view', chord: 'Mod+w' },
  { id: 'browser.nextTab', label: 'Next Browser Tab', group: 'view', chord: 'Ctrl+Tab' },
  { id: 'browser.prevTab', label: 'Previous Browser Tab', group: 'view', chord: 'Ctrl+Shift+Tab' },
  /**
   * The first history chords in the app — `title-bar-nav.tsx`'s Back/Forward
   * buttons call `viewHistory` directly today and carry no chord at all.
   * Panel-local (Phase 42 Theme D): the handler no-ops unless the Councils
   * panel that owns the active `panel-stack` is mounted.
   */
  { id: 'panel.back', label: 'Back', group: 'view', chord: 'Mod+[' },
  { id: 'panel.forward', label: 'Forward', group: 'view', chord: 'Mod+]' },
  { id: 'browser.reopenTab', label: 'Reopen Closed Browser Tab', group: 'view', chord: 'Mod+Shift+t' },
  { id: 'browser.selectTab1', label: 'Select Browser Tab 1', group: 'view', chord: 'Mod+1' },
  { id: 'browser.selectTab2', label: 'Select Browser Tab 2', group: 'view', chord: 'Mod+2' },
  { id: 'browser.selectTab3', label: 'Select Browser Tab 3', group: 'view', chord: 'Mod+3' },
  { id: 'browser.selectTab4', label: 'Select Browser Tab 4', group: 'view', chord: 'Mod+4' },
  { id: 'browser.selectTab5', label: 'Select Browser Tab 5', group: 'view', chord: 'Mod+5' },
  { id: 'browser.selectTab6', label: 'Select Browser Tab 6', group: 'view', chord: 'Mod+6' },
  { id: 'browser.selectTab7', label: 'Select Browser Tab 7', group: 'view', chord: 'Mod+7' },
  { id: 'browser.selectTab8', label: 'Select Browser Tab 8', group: 'view', chord: 'Mod+8' },
  /** 9 always means "the last tab", regardless of count — matches every browser's own convention. */
  { id: 'browser.selectTab9', label: 'Select Last Browser Tab', group: 'view', chord: 'Mod+9' },
  { id: 'repo.open', label: 'Open Repository…', group: 'repository', chord: 'Mod+o' },
  { id: 'repo.close', label: 'Close Repository', group: 'repository', chord: 'Mod+w' },
  /**
   * Refresh (refetch the repo's git data) and Fetch below are both deliberately
   * chord-free: `Mod+r` and `Mod+Shift+r` now mean what they mean in every
   * browser and Electron app — reload the window, and reload it bypassing the
   * cache. Both stay first-class palette and menu rows; the git-data refresh
   * they used to own is also what a window reload does on its way back up, so
   * losing the chord costs a keystroke, not a capability.
   */
  { id: 'view.refresh', label: 'Refresh', group: 'view' },
  /**
   * `Mod+r` / `Mod+Shift+r`, the browser reload pair — plain, and bypassing
   * the HTTP cache. `app` scope, and additionally listed in
   * `TERMINAL_YIELD_COMMANDS` below, which is what actually keeps them out of
   * the shell: `app` alone would still fire them with xterm focused, and
   * `Ctrl+R` (which is what `Mod+R` is off macOS) is readline's
   * reverse-i-search.
   */
  { id: 'app.reload', label: 'Reload', group: 'view', chord: 'Mod+r' },
  { id: 'app.hardReload', label: 'Hard Reload', group: 'view', chord: 'Mod+Shift+r' },
  /**
   * Mod+Shift+l, the shifted sibling of `fab.toggle`'s Mod+l — the same letter,
   * one modifier apart, for the two things the "L" surfaces do. It replaces
   * Mod+Alt+l, which shared no family with anything and on macOS types a `¬`
   * into whatever has focus if the app ever misses it. No terminal carve-out
   * needed: `Ctrl+Shift+L` is not a readline binding, unlike bare `Ctrl+L`.
   */
  { id: 'app.lock', label: 'Lock Screen', group: 'view', chord: 'Mod+Shift+l' },
  { id: 'app.screensaver', label: 'Start Screensaver', group: 'view' },
  /**
   * Mod+Shift+g navigates to the Graph view from anywhere. `app` scope like
   * `repos.toggle`: you rarely need this while mid-command with the terminal
   * focused, and it must not conflict with the terminal's own Ctrl+G binding.
   */
  { id: 'view.graph', label: 'Go to Graph', group: 'graph', chord: 'Mod+Shift+g' },
  { id: 'graph.focus', label: 'Focus Graph', group: 'graph', chord: 'Mod+1' },
  { id: 'status.focus', label: 'Focus Changes', group: 'status', chord: 'Mod+2' },
  { id: 'status.commit', label: 'Commit', group: 'status', chord: 'Mod+Enter' },
  // Chord-free since the reload pair took Mod+Shift+r — see `view.refresh`.
  { id: 'sync.fetch', label: 'Fetch', group: 'sync' },
  { id: 'sync.pull', label: 'Pull', group: 'sync', chord: 'Mod+Shift+p' },
  { id: 'sync.push', label: 'Push', group: 'sync', chord: 'Mod+Shift+u' },
  { id: 'search.open', label: 'Search Everywhere', group: 'view', chord: 'Mod+Shift+f', scope: 'global' },
  // Declared, unbound, and left that way: Phase 22 rebuilds operation state
  // and owns wiring these up.
  { id: 'op.abort', label: 'Abort Operation', group: 'operation' },
  { id: 'op.continue', label: 'Continue Operation', group: 'operation' },
  /**
   * `Mod+k` escapes the terminal — same as `Ctrl+\``, and for the same
   * reason: a palette you cannot open while a shell has focus is half a
   * palette. `Mod+p` does not: it is the conventional file-finder chord and
   * doubles as `Mod+k` with the file sigil pre-filled, so it never needs to
   * reach through xterm on its own.
   */
  { id: 'palette.open', label: 'Command Palette', group: 'palette', chord: 'Mod+k', scope: 'global' },
  { id: 'palette.files', label: 'Go to File…', group: 'palette', chord: 'Mod+p' },
  { id: 'file.save', label: 'Save File', group: 'files', chord: 'Mod+s' },
  /**
   * Mod+Shift+e navigates to the Explorer view from anywhere — same pattern
   * as `view.graph`'s Mod+Shift+g, and for the same reason: plain `Mod+e`
   * would be `Ctrl+e` off macOS, which readline already owns (move to end of
   * line), and the terminal must keep it. Shift sidesteps the collision
   * entirely rather than adding a third name to `TERMINAL_YIELD_COMMANDS`.
   */
  { id: 'view.files', label: 'Go to Explorer', group: 'files', chord: 'Mod+Shift+e' },
  /**
   * Mod+Shift+i navigates to Issues from anywhere — same pattern as
   * `view.graph`'s Mod+Shift+g and `view.files`'s Mod+Shift+e. `view` rather
   * than a dedicated group: Issues has no further sub-commands of its own the
   * way Graph and Files do, so it sits with the other cross-app navigations.
   */
  { id: 'view.issues', label: 'Go to Issues', group: 'view', chord: 'Mod+Shift+i' },
  // Declared, unbound: Phase 23's palette is the surface that gives this a
  // chord-free way to fire. Enabled only while a description-level markdown
  // surface (Files preview, PR/review description) is in view — see
  // `activeMarkdown` in `slides-store.ts`.
  { id: 'markdown.presentAsSlides', label: 'Present as Slides', group: 'view' },
  // Declared, unbound: like `sync.fetch`, chord-free by choice rather than by
  // exhaustion — a run action does not need a global chord, and the canvas's
  // own Run button (Theme F) is already one click away once the view is open.
  { id: 'workflow.run', label: 'Run Workflow', group: 'view' },
  { id: 'view.video', label: 'Go to Video Studio', group: 'view' },
  /**
   * Phase 64 Theme F. Chord-free, like `view.refresh`/`app.screensaver` above
   * — every single-letter `Mod` chord worth having is already taken, and a
   * palette entry for something this occasional does not need one. Both
   * navigate to Settings ▸ Appearance's new "Palette" accordion; `theme.import`
   * additionally opens the accordion's own file picker when it is already
   * mounted (see `theme-import-command-store.ts`), the same handle-if-present
   * shape `workflow.run` uses.
   */
  { id: 'theme.select', label: 'Select Theme Palette', group: 'view' },
  { id: 'theme.import', label: 'Import VS Code Theme', group: 'view' },
  /**
   * Multi-window (Phase 55). One chord for the common case — detach whichever
   * panel currently has the top-left morph focus/hover — plus four chord-free
   * palette rows for a specific panel. `Mod+Shift+d` is unused: the
   * `Mod+Shift+` space is nearly exhausted (a, e, f, g, i, l, p, r, t, u taken)
   * and `Mod+m`/`Mod+Alt+l` are forbidden by assertion (see `ipc.test.ts`).
   */
  { id: 'window.detachActive', label: 'Detach Active Panel', group: 'window', chord: 'Mod+Shift+d' },
  { id: 'window.detachTerminal', label: 'Detach Terminal', group: 'window' },
  { id: 'window.detachRepos', label: 'Detach Git Repos', group: 'window' },
  { id: 'window.detachFab', label: 'Detach Loops Panel', group: 'window' },
  { id: 'window.detachBrowser', label: 'Detach Browser', group: 'window' },
] as const satisfies readonly CommandDescriptorInput[];

export type CommandDescriptor = (typeof COMMANDS)[number];
export type CommandId = CommandDescriptor['id'];

export const COMMAND_IDS: readonly CommandId[] = COMMANDS.map((c) => c.id);

/**
 * The legacy chord-only shape, derived by dropping every command with no
 * chord. `use-keybindings.ts` and `menu.ts` only ever need to resolve a real
 * keystroke or accelerator, so an unbound command is correctly invisible here
 * — it still exists in `COMMANDS` for the palette to find.
 */
export type KeyBinding = {
  command: CommandId;
  chord: string;
  scope: CommandScope;
  label: string;
};

export const DEFAULT_KEYMAP: readonly KeyBinding[] = (
  COMMANDS as readonly CommandDescriptorInput[]
)
  .filter((c): c is CommandDescriptorInput & { chord: string } => c.chord !== undefined)
  .map((c) => ({ command: c.id as CommandId, chord: c.chord, scope: c.scope ?? 'app', label: c.label }));

/** Chords that must reach the app even while the terminal owns the keyboard. */
export const GLOBAL_CHORDS: readonly string[] = DEFAULT_KEYMAP.filter(
  (b) => b.scope === 'global',
).map((b) => b.chord);

/**
 * A root element selector, and the commands whose chord must yield to
 * whatever is focused inside it rather than firing app-wide.
 *
 * Phase 64 Theme D generalised this from a single hard-coded `.xterm` check
 * (`insideTerminal` in `use-keybindings.ts`) into a small registry — Monaco
 * needed its OWN, different yield set, and `|| target.closest('.monaco-
 * editor')` bolted onto `insideTerminal` would have made Monaco swallow
 * `fab.toggle`/`window.detachActive` too, which it should not, while still not
 * letting it keep the chords it actually needs (`Mod+d`, `Mod+/`, …).
 * `landing-carousel.tsx:80-85`'s own multi-root selector list is the in-repo
 * precedent this shape generalises toward.
 */
export type YieldRoot = { selector: string; commands: readonly CommandId[] };

export const YIELD_ROOTS: readonly YieldRoot[] = [
  {
    selector: '.xterm',
    /**
     * The dispatcher grabs every bound chord app-wide, terminal focus
     * included — `scope` only governs xterm's own escape allow-list, so `app`
     * is not, on its own, "the terminal keeps this". For nearly every command
     * that is right: `Mod+1` should still jump to the Graph from inside a
     * shell. The reload pair is the exception, in both directions at once.
     * `Mod` is Ctrl off macOS, and `Ctrl+R` there is readline's
     * reverse-i-search — the single most-used keystroke a shell owns — and
     * the command it would fire instead throws the whole renderer away
     * mid-command. So these two, and only these two, fall through to the
     * terminal when that is what has focus; the title bar's reload button
     * and the palette are both still one gesture away.
     *
     * `panel.back`/`panel.forward` (Phase 42 Theme D) join them for the
     * identical reason: `Mod+[` off macOS is `Ctrl+[`, which is `ESC` in
     * every terminal — the docked Terminal panel can be open regardless of
     * which view is active, so Councils being the active view is not enough
     * on its own to know the keystroke was meant for the panel rather than
     * the shell sitting behind it.
     *
     * `fab.toggle` joins them the day it took `Mod+l`: `Ctrl+L` is
     * clear-screen in every shell, and a loop panel is never what someone
     * reaching for it mid-command meant. On macOS, where `Mod` is Cmd, the
     * yield costs nothing — `Ctrl+L` was never the chord there in the first
     * place.
     */
    commands: [
      'app.reload',
      'app.hardReload',
      'panel.back',
      'panel.forward',
      'fab.toggle',
      'window.detachActive',
    ],
  },
  {
    selector: '.monaco-editor',
    /**
     * Phase 64 Theme D — Monaco's own yield set: `Mod+d` (add selection to
     * next match), `Mod+/` (toggle comment), `Mod+[`/`Mod+]` (outdent/
     * indent) and `Mod+Enter` (insert line below). Only `panel.back`
     * (`Mod+[`), `panel.forward` (`Mod+]`) and `status.commit` (`Mod+Enter`)
     * need an entry HERE — `use-keybindings.ts:90`'s capture-phase `window`
     * listener only ever contests a chord that some `CommandId` is actually
     * bound to. `Mod+d` and `Mod+/` bind to nothing in `DEFAULT_KEYMAP`
     * (same reasoning the doc gives for `Mod+f`, which also needs no entry:
     * `search.open` is `Mod+Shift+f`), so the dispatcher already finds no
     * candidate for them and does nothing — Monaco gets all five unopposed.
     */
    commands: ['panel.back', 'panel.forward', 'status.commit'],
  },
];

/**
 * The legacy flat alias, derived from `YIELD_ROOTS`'s `.xterm` entry — kept
 * because it is exported and named in `menu.ts`'s doc comment, and because
 * `use-keybindings.ts`'s allow-list check reads more plainly against a flat
 * list at its one remaining call site.
 */
export const TERMINAL_YIELD_COMMANDS: readonly CommandId[] =
  YIELD_ROOTS.find((root) => root.selector === '.xterm')!.commands;

export const isCommandId = (value: string): value is CommandId =>
  (COMMAND_IDS as readonly string[]).includes(value);
