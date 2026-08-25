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
export function chordFromEvent(event: ChordEvent): string {
  const mac = isMac();
  const parts: string[] = [];

  const modPressed = mac ? event.metaKey : event.ctrlKey;
  if (modPressed) parts.push('Mod');
  // On macOS, Ctrl is a distinct modifier from Mod and must be reported; on
  // other platforms Ctrl IS Mod and reporting both would never match.
  if (mac && event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  parts.push(normaliseKey(event.key));
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
