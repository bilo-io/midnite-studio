/**
 * Command identifiers and the default keymap.
 *
 * Every user-triggerable action is a CommandId, and *nothing* dispatches a
 * keystroke directly. Three sources feed the same dispatcher: the renderer's
 * key handler, the native menu (`mgit:menu:command`), and — later — a command
 * palette. One registry means a menu item and its shortcut can never drift, and
 * the palette gets its contents for free.
 */
export const COMMAND_IDS = [
  'terminal.toggle',
  'terminal.focus',
  'repos.toggle',
  'repo.open',
  'repo.close',
  'view.refresh',
  'browser.open',
  'graph.focus',
  'status.focus',
  'status.commit',
  'sync.fetch',
  'sync.pull',
  'sync.push',
  'op.abort',
  'op.continue',
] as const;

export type CommandId = (typeof COMMAND_IDS)[number];

/**
 * Where a command is allowed to fire. The terminal swallows almost every
 * keystroke (it must — `Ctrl+C` belongs to the shell), so a chord only escapes
 * xterm when its command is `global`. See the allow-list in
 * `app/src/services/keybindings`.
 */
export type CommandScope = 'global' | 'app';

export type KeyBinding = {
  command: CommandId;
  /**
   * Normalised chord: modifiers in the order `Cmd+Ctrl+Alt+Shift`, then the key
   * (`KeyboardEvent.key`, lowercased for printable characters). `Mod` means
   * Cmd on macOS and Ctrl elsewhere.
   */
  chord: string;
  scope: CommandScope;
  /** Shown in the native menu and the (future) command palette. */
  label: string;
};

export const DEFAULT_KEYMAP: readonly KeyBinding[] = [
  /**
   * Ctrl+` on EVERY platform, macOS included. macOS reserves Cmd+` for
   * "cycle windows within an application" — taking it would break a system
   * gesture, and VS Code sets the same precedent with Ctrl+` on mac.
   * `global` scope: this must work while the terminal itself has focus, so it's
   * on the xterm escape allow-list.
   */
  { command: 'terminal.toggle', chord: 'Ctrl+`', scope: 'global', label: 'Toggle Terminal' },
  { command: 'terminal.focus', chord: 'Mod+Shift+`', scope: 'app', label: 'Focus Terminal' },
  /**
   * Mod+Shift+b. Mod+b is the chord every editor with a left sidebar uses, and
   * it was this one's until the browser claimed it below; Shift keeps the
   * panel a keystroke away on the same letter. `app` scope, unlike the
   * terminal toggle: showing the repository list while the terminal has focus
   * is not something you reach for mid-command, and Ctrl+B is a readline
   * motion the shell is entitled to keep.
   */
  { command: 'repos.toggle', chord: 'Mod+Shift+b', scope: 'app', label: 'Toggle Repositories' },
  /**
   * Mod+b is where a browser will live — the built-in web pane is not written
   * yet, so for now the chord opens a notice that says so. Claiming it early
   * costs nothing and means the shortcut will not move under a user once the
   * pane lands; `repos.toggle`, which held it, shifts one modifier along.
   */
  { command: 'browser.open', chord: 'Mod+b', scope: 'app', label: 'Browser' },
  { command: 'repo.open', chord: 'Mod+o', scope: 'app', label: 'Open Repository…' },
  { command: 'repo.close', chord: 'Mod+w', scope: 'app', label: 'Close Repository' },
  { command: 'view.refresh', chord: 'Mod+r', scope: 'app', label: 'Refresh' },
  /**
   * Mod+g, not Mod+1: the graph is the git tree, and the letter says so where
   * a positional number only says "first in the rail" — which stopped being
   * true the moment the rail was reordered.
   */
  { command: 'graph.focus', chord: 'Mod+g', scope: 'app', label: 'Focus Graph' },
  { command: 'status.focus', chord: 'Mod+2', scope: 'app', label: 'Focus Changes' },
  { command: 'status.commit', chord: 'Mod+Enter', scope: 'app', label: 'Commit' },
  { command: 'sync.fetch', chord: 'Mod+Shift+f', scope: 'app', label: 'Fetch' },
  { command: 'sync.pull', chord: 'Mod+Shift+p', scope: 'app', label: 'Pull' },
  { command: 'sync.push', chord: 'Mod+Shift+u', scope: 'app', label: 'Push' },
];

/** Chords that must reach the app even while the terminal owns the keyboard. */
export const GLOBAL_CHORDS: readonly string[] = DEFAULT_KEYMAP.filter(
  (b) => b.scope === 'global',
).map((b) => b.chord);

export const isCommandId = (value: string): value is CommandId =>
  (COMMAND_IDS as readonly string[]).includes(value);
