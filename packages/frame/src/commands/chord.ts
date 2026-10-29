/**
 * Turn a KeyboardEvent into the normalised chord string the keymap uses.
 *
 * One representation, produced in one place, so a binding written as
 * `Mod+Shift+f` in the keymap can be compared to a real keystroke without any
 * per-call parsing or platform branching at the comparison site.
 *
 * Modifier order is fixed (`Mod`/`Cmd`/`Ctrl`/`Alt`/`Shift`) because a chord is
 * compared by string equality — `Ctrl+Shift+p` and `Shift+Ctrl+p` must not be
 * two different bindings.
 */
export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

export type ChordEvent = {
  key: string;
  /**
   * The physical-key code (`KeyboardEvent.code`), used only to recognise the
   * backquote key. Optional because tests and synthetic callers predate it —
   * absent, the `key` value stands alone.
   */
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/**
 * `Mod` is Cmd on macOS and Ctrl elsewhere.
 *
 * Emitted in preference to the concrete modifier so a keystroke matches the
 * platform-agnostic bindings in DEFAULT_KEYMAP. A chord that genuinely means
 * "Ctrl, even on a Mac" — the terminal toggle — is produced as `Ctrl+…`,
 * because on macOS Ctrl is *not* the Mod key and so is reported literally.
 */
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift']);

export function chordFromEvent(event: ChordEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const mac = isMac();
  const parts: string[] = [];

  const modPressed = mac ? event.metaKey : event.ctrlKey;
  if (modPressed) parts.push('Mod');
  // On macOS, Ctrl is a distinct modifier from Mod and must be reported; on
  // other platforms Ctrl IS Mod and reporting both would never match.
  if (mac && event.ctrlKey) parts.push('Ctrl');
  if (!mac && event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  // The backquote key is matched by POSITION, not by the character it typed.
  // With Shift held a US layout reports `key: '~'`, so a chord written
  // `Ctrl+Shift+\`` could never match by `key` alone — and other layouts put
  // different characters on that physical key entirely. VS Code binds its
  // terminal chords to the Backquote position for the same reason.
  parts.push(event.code === 'Backquote' ? '`' : normaliseKey(event.key));
  return parts.join('+');
}

/**
 * Printable keys lowercase; named keys keep their canonical casing.
 *
 * Without this, `Shift+F` and `Shift+f` are different chords depending on
 * whether the browser reported the shifted character — which it does
 * inconsistently across layouts.
 */
function normaliseKey(key: string): string {
  if (key.length === 1) return key.toLowerCase();
  return key;
}
