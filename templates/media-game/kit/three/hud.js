// @ts-check
/**
 * Midnite game kit — a DOM overlay HUD for three.js games.
 *
 * Plain absolutely-positioned elements over the canvas: a text line per named
 * slot (top-left by default), a centre crosshair, and a paused banner. DOM text
 * stays crisp at any resolution and costs nothing in the WebGL frame.
 */

const STYLE = `
.midnite-hud { position: fixed; inset: 0; pointer-events: none; font: 600 14px/1.4 ui-monospace, Menlo, monospace; color: #e8ecf4; text-shadow: 0 1px 2px #000a; }
.midnite-hud .slots { position: absolute; top: 12px; left: 14px; display: flex; flex-direction: column; gap: 2px; }
.midnite-hud .right { position: absolute; top: 12px; right: 14px; text-align: right; }
.midnite-hud .crosshair { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fffc; box-shadow: 0 0 0 1px #0008; display: none; }
.midnite-hud .banner { position: absolute; left: 50%; top: 40%; transform: translateX(-50%); padding: 8px 16px; border-radius: 8px; background: #0b0d12cc; font-size: 18px; display: none; }
.midnite-hud .hint { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); opacity: 0.8; font-weight: 500; font-size: 12px; }
`;

/**
 * @param {{ parent?: HTMLElement, hint?: string }} [options]
 */
export function createHud(options = {}) {
  if (!document.getElementById('midnite-hud-style')) {
    const style = document.createElement('style');
    style.id = 'midnite-hud-style';
    style.textContent = STYLE;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = 'midnite-hud';
  root.innerHTML = '<div class="slots"></div><div class="right"></div><div class="crosshair"></div><div class="banner"></div><div class="hint"></div>';
  (options.parent ?? document.body).append(root);
  const slots = /** @type {HTMLElement} */ (root.querySelector('.slots'));
  const right = /** @type {HTMLElement} */ (root.querySelector('.right'));
  const crosshair = /** @type {HTMLElement} */ (root.querySelector('.crosshair'));
  const banner = /** @type {HTMLElement} */ (root.querySelector('.banner'));
  const hint = /** @type {HTMLElement} */ (root.querySelector('.hint'));
  hint.textContent = options.hint ?? '';
  /** @type {Map<string, HTMLElement>} */
  const lines = new Map();

  return {
    root,
    /**
     * Set a named line (`hud.set('health', 'HP 100')`); `null` removes it.
     * @param {string} slot
     * @param {string | null} text
     * @param {{ align?: 'left' | 'right' }} [opts]
     */
    set(slot, text, opts = {}) {
      let line = lines.get(slot);
      if (text === null) {
        line?.remove();
        lines.delete(slot);
        return;
      }
      if (!line) {
        line = document.createElement('div');
        (opts.align === 'right' ? right : slots).append(line);
        lines.set(slot, line);
      }
      if (line.textContent !== text) line.textContent = text;
    },
    crosshair(/** @type {boolean} */ on) {
      crosshair.style.display = on ? 'block' : 'none';
    },
    banner(/** @type {string | null} */ text) {
      banner.textContent = text ?? '';
      banner.style.display = text ? 'block' : 'none';
    },
    hint(/** @type {string} */ text) {
      hint.textContent = text;
    },
    dispose() {
      root.remove();
    },
  };
}
