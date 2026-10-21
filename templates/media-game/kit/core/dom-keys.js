// @ts-check
/**
 * Midnite game kit — DOM key codes to the kit's key names (engine-free).
 *
 * Bindings name keys the way Phaser does (`W`, `SPACE`, `SHIFT`, `ESC`, `UP`),
 * so a 2D and a 3D game bind the same way. The three.js kit has no engine
 * keyboard, so it reads `KeyboardEvent.code` (layout-independent: WASD stays
 * under the left hand on AZERTY) and names it with this.
 */

/** @type {Readonly<Record<string, string>>} */
const SPECIAL = Object.freeze({
  Space: 'SPACE',
  Escape: 'ESC',
  Enter: 'ENTER',
  Tab: 'TAB',
  Backspace: 'BACKSPACE',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
});

/**
 * `KeyW` → `W`, `Digit1` → `1`, `Space` → `SPACE`,
 * `ShiftLeft` → `SHIFT`; anything else upper-cased as is.
 * @param {string} code a `KeyboardEvent.code`
 */
export function domKeyName(code) {
  if (SPECIAL[code]) return SPECIAL[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.toUpperCase();
}
