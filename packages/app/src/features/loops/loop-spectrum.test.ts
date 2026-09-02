import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

// Not `node:fs`: the renderer's eslint boundary denies node builtins under
// `src/`, so the reading happens in `vitest.config.ts` and arrives here as a
// virtual module. See that file for why it is not a `?raw` CSS import.
import stylesCss from 'virtual:midnite-styles-raw';

/**
 * The tab sub-spectrum is declared twice in `styles.css` and the two halves
 * have to agree.
 *
 * `--fab-arc-from`/`--fab-arc-to` narrow the panel's conic ring to the tab's
 * slice; `--fab-spec-1…5` are that same slice sampled as five colours, because
 * a form field's border is a rectangle and cannot be a sector of a conic. A
 * tab that has one and not the other silently falls back — to a full-spectrum
 * ring, or to the emerald default in `.loop-composer-surface`'s `var()` — and
 * neither failure looks like a bug on screen, which is exactly why it needs a
 * test rather than an eye.
 */
const SPEC_STOPS = [1, 2, 3, 4, 5] as const;

function declaresVar(tabId: string, name: string): boolean {
  // The declaration blocks are one selector (or two, for the arc pair) then
  // the property — matching the property inside the block the selector opens
  // is enough, since nothing else in the file opens a block for these tabs.
  const block = stylesCss.match(
    new RegExp(`\\[data-fab-tab='${tabId}'\\][^{]*\\{([^}]*)\\}`, 'g'),
  );
  return (block ?? []).some((chunk) => chunk.includes(`${name}:`));
}

describe('tab sub-spectrum', () => {
  it('samples all five stops for every loop the FAB ships', () => {
    for (const loop of DEFAULT_LOOPS) {
      for (const stop of SPEC_STOPS) {
        expect(declaresVar(loop.id, `--fab-spec-${stop}`), `${loop.id} --fab-spec-${stop}`).toBe(
          true,
        );
      }
    }
  });

  it('gives every loop with an arc a sampled ramp, and the other way round', () => {
    for (const loop of DEFAULT_LOOPS) {
      expect(declaresVar(loop.id, '--fab-arc-from'), `${loop.id} arc`).toBe(true);
      expect(declaresVar(loop.id, '--fab-arc-to'), `${loop.id} arc`).toBe(true);
    }
  });

  it('centres each tab on its own stop 3, so the ramp matches the tab glyph', () => {
    // `DEFAULT_LOOPS` already carries a Tailwind colour class per tab; stop 3
    // is the arc's midpoint and must be the same hue, or the composer and the
    // tab strip disagree about what colour the tab is.
    const centres: Record<string, { colour: string; rgb: string }> = {
      medic: { colour: 'text-red-500', rgb: '244 63 94' },
      watchdog: { colour: 'text-yellow-500', rgb: '245 158 11' },
      automate: { colour: 'text-green-500', rgb: '16 185 129' },
      innovate: { colour: 'text-blue-500', rgb: '59 130 246' },
    };
    for (const loop of DEFAULT_LOOPS) {
      const centre = centres[loop.id];
      expect(centre, `no expected centre recorded for ${loop.id}`).toBeDefined();
      expect(loop.color).toBe(centre!.colour);
      expect(stylesCss).toContain(`--fab-spec-3: ${centre!.rgb};`);
    }
  });
});
