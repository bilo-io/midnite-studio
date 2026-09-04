import { describe, expect, it } from 'vitest';

// Not `node:fs` — the renderer's eslint boundary denies node builtins under
// `src/`, so `vitest.config.ts` reads the stylesheet and hands it over as a
// virtual module. Same seam `loop-spectrum.test.ts` uses.
import stylesCss from 'virtual:midnite-styles-raw';

/**
 * The lock screen's inner glow is a single arc orbiting the screen's edge, not
 * a full unbroken ring.
 *
 * `--fab-arc-from`/`--fab-arc-to` mask `.gradient-frame::before`'s conic ramp
 * down to one lit span, and `--fab-panel-angle`'s rotation walks that span
 * around the frame. The screensaver has no `[data-fab-tab]` above it to read an
 * arc from, so it pins its own — and if that pin is ever dropped, both angles
 * fall back to their registered initial values (`0deg`/`360deg`), the mask
 * keeps the whole ramp lit, and the glow silently becomes a static border. That
 * failure looks like a design choice on screen, which is why it needs a test.
 */
/**
 * Every declaration block whose selector list names `selector` exactly,
 * concatenated. Comments are stripped first — this file's are dense with
 * selector names, and a `/* … .gradient-frame::before … *\/` note sitting
 * above an unrelated rule would otherwise hand back that rule's body.
 */
function declarationsFor(selector: string): string {
  const source = stylesCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(source))) {
    const selectors = (match[1] ?? '').split(',').map((one) => one.trim());
    if (selectors.includes(selector)) out.push(match[2] ?? '');
  }
  return out.join('\n');
}

function angle(block: string, prop: string): number | undefined {
  const match = block.match(new RegExp(`${prop}:\\s*(-?[\\d.]+)deg`));
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

describe('screensaver glow arc', () => {
  it('pins the arc on the pseudo-element, which is the only thing that consumes it', () => {
    // `--fab-arc-from`/`--fab-arc-to` are registered `inherits: false`, so a
    // value on the host would never reach `::before`. Naming the pseudo is the
    // whole mechanism.
    const block = declarationsFor('.screensaver-panel-gradient::before');

    expect(angle(block, '--fab-arc-from')).toBe(-90);
    expect(angle(block, '--fab-arc-to')).toBe(90);
  });

  it('lights a half-ring — a span narrower than the full 360deg ramp', () => {
    const block = declarationsFor('.screensaver-panel-gradient::before');
    const from = angle(block, '--fab-arc-from');
    const to = angle(block, '--fab-arc-to');

    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect((to as number) - (from as number)).toBe(180);
  });

  it('keeps the rotation that walks the arc around the frame', () => {
    // An arc with no rotation is just a shorter static border. The spin lives
    // on `.gradient-frame::before`, which the host's own `animation: none`
    // reset does not touch.
    expect(declarationsFor('.gradient-frame::before')).toMatch(/fab-panel-spin/);
  });
});
