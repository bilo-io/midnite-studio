import { DEFAULT_LOOPS, LOOP_SPECTRUM_HUES, createBlankCustomLoop } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

// See `loop-spectrum.test.ts` for why the stylesheet arrives as a virtual module.
import stylesCss from 'virtual:midnite-styles-raw';

import { loopSpectrumProps, spectrumHex, spectrumStops, spectrumStyle } from './loop-spectrum';

/**
 * A custom loop's colour is computed from its hue rather than written into
 * `styles.css`, so the one thing that keeps it from drifting off the built-ins'
 * palette is this: picking a built-in's anchor hue reproduces that built-in's
 * five declared stops, to within one unit of rounding.
 */
function readVar(tabId: string, name: string): string | undefined {
  const blocks = stylesCss.match(new RegExp(`\\[data-fab-tab='${tabId}'\\][^{]*\\{([^}]*)\\}`, 'g'));
  for (const block of blocks ?? []) {
    const hit = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (hit?.[1]) return hit[1].trim();
  }
  return undefined;
}

const triplet = (value: string): number[] => value.split(/\s+/).map(Number);

describe('custom loop spectrum', () => {
  it('reproduces every built-in’s declared stops from its anchor hue', () => {
    for (const loop of DEFAULT_LOOPS) {
      const hue = LOOP_SPECTRUM_HUES[loop.id];
      expect(hue, `${loop.id} has no anchor hue`).toBeDefined();
      const from = Number(readVar(loop.id, '--fab-arc-from')?.replace('deg', ''));
      expect(((from + 60) % 360 + 360) % 360, `${loop.id} anchor`).toBe(hue);

      spectrumStops(hue!).forEach((computed, index) => {
        const declared = readVar(loop.id, `--fab-spec-${index + 1}`);
        expect(declared, `${loop.id} --fab-spec-${index + 1}`).toBeDefined();
        triplet(computed).forEach((channel, c) => {
          expect(Math.abs(channel - triplet(declared!)[c]!), `${loop.id} stop ${index + 1}`).toBeLessThanOrEqual(1);
        });
      });
    }
  });

  it('wraps the hue and spans the same 120° arc a built-in does', () => {
    expect(spectrumStops(360)).toEqual(spectrumStops(0));
    expect(spectrumStops(-90)).toEqual(spectrumStops(270));
    const style = spectrumStyle(200) as Record<string, string>;
    expect(style['--fab-custom-arc-from']).toBe('140deg');
    expect(style['--fab-custom-arc-to']).toBe('260deg');
    expect(style['--fab-spec-3']).toBe(spectrumStops(200)[2]);
    expect(spectrumHex(0)).toBe('#f43f5e');
  });

  it('paints only custom loops inline', () => {
    expect(loopSpectrumProps(DEFAULT_LOOPS[0])).toEqual({});
    const custom = { ...createBlankCustomLoop(), hue: 30 };
    const props = loopSpectrumProps(custom);
    expect(props['data-fab-custom']).toBe('true');
    expect((props.style as Record<string, string>)['--fab-spec-3']).toBe(spectrumStops(30)[2]);
  });

  it('maps the inline arc onto the registered arc properties in styles.css', () => {
    // `--fab-arc-*` are `inherits: false`, so the inline pair must be re-read
    // on each element that paints the ring — the host, its pseudo-elements,
    // the run glow and the tab's own arc span.
    const rule = stylesCss.match(/\[data-fab-custom\][^{]*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('--fab-arc-from: var(--fab-custom-arc-from');
    expect(rule).toContain('--fab-arc-to: var(--fab-custom-arc-to');
    for (const selector of ['[data-fab-custom]::before', '.loop-run-glow', '.tab-loop-active-arc[data-fab-custom]']) {
      expect(rule, selector).toContain(selector);
    }
  });
});
