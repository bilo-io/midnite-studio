/**
 * Command identifiers and the default keymap.
 *
 * Every user-triggerable action is a CommandId, and *nothing* dispatches a
 * keystroke directly. Three sources feed the same dispatcher: the renderer's
 * key handler, the native menu (`mgit:menu:command`), and the command
 * palette. One registry means a menu item and its shortcut can never drift,
 * and the palette gets its contents for free — including the two ids below
 * that have no chord at all: `op.abort` and `op.continue` are declared here
 * so the palette can list them as present-but-unbound, exactly like every
 * other command.
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
  | 'files';

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
  { id: 'terminal.focus', label: 'Focus Terminal', group: 'terminal', chord: 'Mod+Shift+`' },
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
  { id: 'repo.open', label: 'Open Repository…', group: 'repository', chord: 'Mod+o' },
  { id: 'repo.close', label: 'Close Repository', group: 'repository', chord: 'Mod+w' },
  { id: 'view.refresh', label: 'Refresh', group: 'view', chord: 'Mod+r' },
  { id: 'graph.focus', label: 'Focus Graph', group: 'graph', chord: 'Mod+1' },
  { id: 'status.focus', label: 'Focus Changes', group: 'status', chord: 'Mod+2' },
  { id: 'status.commit', label: 'Commit', group: 'status', chord: 'Mod+Enter' },
  { id: 'sync.fetch', label: 'Fetch', group: 'sync', chord: 'Mod+Shift+f' },
  { id: 'sync.pull', label: 'Pull', group: 'sync', chord: 'Mod+Shift+p' },
  { id: 'sync.push', label: 'Push', group: 'sync', chord: 'Mod+Shift+u' },
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
  // Declared, unbound: Phase 23's palette is the surface that gives this a
  // chord-free way to fire. Enabled only while a description-level markdown
  // surface (Files preview, PR/review description) is in view — see
  // `activeMarkdown` in `slides-store.ts`.
  { id: 'markdown.presentAsSlides', label: 'Present as Slides', group: 'view' },
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

export const isCommandId = (value: string): value is CommandId =>
  (COMMAND_IDS as readonly string[]).includes(value);
