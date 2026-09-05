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
});

/**
 * The `--rainbow-*` conic at 30deg resolution — the ramp's own six stops and
 * the five midpoints between them, each written exactly as `styles.css`
 * writes it. The sub-spectrum is a *sample* of this, so this table is what
 * makes "re-sampled with the arc" checkable rather than a comment.
 */
const RAMP: Record<number, string> = {
  0: '244 63 94',
  30: '244 110 52',
  60: '245 158 11',
  90: '130 171 70',
  120: '16 185 129',
  150: '37 157 187',
  180: '59 130 246',
  210: '99 111 246',
  240: '139 92 246',
  270: '187 82 200',
  300: '236 72 153',
  330: '240 67 123',
};

function readVar(tabId: string, name: string): string | undefined {
  const blocks = stylesCss.match(
    new RegExp(`\\[data-fab-tab='${tabId}'\\][^{]*\\{([^}]*)\\}`, 'g'),
  );
  for (const block of blocks ?? []) {
    const hit = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (hit?.[1]) return hit[1].trim();
  }
  return undefined;
}

function arcSpan(tabId: string): { from: number; to: number } {
  const from = Number(readVar(tabId, '--fab-arc-from')?.replace('deg', ''));
  const to = Number(readVar(tabId, '--fab-arc-to')?.replace('deg', ''));
  return { from, to };
}

describe('tab arc width', () => {
  it('gives every tab the same 120deg span, centred on its own anchor', () => {
    for (const loop of DEFAULT_LOOPS) {
      const { from, to } = arcSpan(loop.id);
      expect(to - from, `${loop.id} span`).toBe(120);
    }
  });
});

describe('tab sub-spectrum tracks the arc', () => {
  it('samples the five stops at the arc’s own edges and midpoints', () => {
    // The file says these are "two expressions of one decision" — narrow the
    // arc and the sampled ramp has to move with it, or the composer's border
    // shows a wider slice of the spectrum than the ring it is meant to echo.
    // This is the assertion that makes that non-optional.
    for (const loop of DEFAULT_LOOPS) {
      const { from, to } = arcSpan(loop.id);
      const step = (to - from) / 4;

      for (const [index, stop] of SPEC_STOPS.entries()) {
        const angle = ((from + step * index) % 360 + 360) % 360;
        expect(RAMP[angle], `${loop.id} stop ${stop} at ${angle}deg is not a ramp stop`).toBeDefined();
        expect(readVar(loop.id, `--fab-spec-${stop}`), `${loop.id} --fab-spec-${stop}`).toBe(
          RAMP[angle],
        );
      }
    }
  });
});

describe('tab sub-spectrum centres', () => {
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

describe('tab container button styling & theme colors', () => {
  it('styles .tab-loop-button with hover and selected backgrounds using --fab-spec-3', () => {
    expect(stylesCss).toContain('.tab-loop-button:hover');
    expect(stylesCss).toContain('background-color: rgb(var(--fab-spec-3) / 0.12);');
    expect(stylesCss).toContain('.tab-loop-button.is-selected');
    expect(stylesCss).toContain('background-color: rgb(var(--fab-spec-3) / 0.22);');
  });

  it('assigns arc angles to .tab-loop-active-arc for every loop', () => {
    for (const loop of DEFAULT_LOOPS) {
      const block = stylesCss.match(
        new RegExp(`\\[data-fab-tab='${loop.id}'\\][^{]*\\{([^}]*)\\}`, 'g'),
      );
      const arcSelectors = (block ?? []).filter((chunk) => chunk.includes('.tab-loop-active-arc'));
      expect(arcSelectors.length, `active arc selectors for ${loop.id}`).toBeGreaterThan(0);
    }
  });

  it('configures .tab-loop-active-arc with rotating border and glow', () => {
    expect(stylesCss).toContain('.tab-loop-active-arc::before');
    expect(stylesCss).toContain('.tab-loop-active-arc::after');
    expect(stylesCss).toMatch(/\.tab-loop-active-arc::before[^{]*\{[^}]*animation:\s*loop-glow-spin 4s linear infinite/);
    expect(stylesCss).toMatch(/\.tab-loop-active-arc::after[^{]*\{[^}]*animation:\s*loop-glow-spin 4s linear infinite/);
  });

  it('configures .tab-loop-shimmer at half frequency (4.8s) and half speed', () => {
    expect(stylesCss).toMatch(/\.tab-loop-shimmer[^{]*\{[^}]*animation:\s*pill-shimmer 4\.8s ease-in-out infinite/);
    expect(stylesCss).toMatch(/animation-delay:\s*calc\(var\(--tab-i, 0\) \* 0\.6s\)/);
  });
});
