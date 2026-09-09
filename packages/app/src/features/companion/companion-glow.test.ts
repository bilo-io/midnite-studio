import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';

/**
 * Regression coverage for the Ad Hoc "companion glow, verified" fix.
 *
 * PR #303 gave the docked companion panel `.companion-face`/
 * `.companion-face--panel` so it would pick up Theme H's `[data-companion-
 * state]` rules — but every one of those rules draws its glow as an OUTWARD
 * `box-shadow` (`0 0 Npx …`, no `inset`), and `app.tsx` docks the panel
 * inside `data-companion-panel-frame`, an `overflow: hidden` box sized in
 * lockstep with the panel's own width (`useRevealSize`'s open/close and
 * drag-resize tween). An outward shadow has nowhere to bleed before that
 * ancestor clips it, so nothing painted — `speaking` (no ring at all, only a
 * box-shadow) went fully invisible, which is exactly the state the bug
 * report's own screenshot caught ("Saying hello…" maps to `speaking` via
 * `fabCompanionState`).
 *
 * A `getByTestId(...).classList` assertion (see `companion-panel.test.tsx`)
 * cannot catch this: jsdom applies no real CSS, so the class being present is
 * not evidence the glow is visible. This test instead parses the actual
 * stylesheet `styles.css` compiles to and asserts, textually, that every
 * panel-scoped state rule keeps its glow `inset` — the one property that
 * makes it survive the ancestor's `overflow: hidden` — while the FAB/mini-FAB
 * rules those panel rules override stay untouched (an outward halo is
 * correct there; nothing clips it).
 *
 * A heuristic over the raw text, in the same spirit as
 * `styles-motion-guards.ts`: it finds each selector's own declaration block
 * by brace-matching from the selector's `{`, not a full CSS parser.
 */

/** The `{ ... }` block belonging to the first exact-text match of `selector`, brace-matched. */
function ruleBlock(source: string, selector: string): string {
  const marker = `${selector} {`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`no rule found for selector: ${selector}`);
  }
  let i = start + marker.length;
  let depth = 1;
  const bodyStart = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(bodyStart, i - 1);
}

/**
 * Every `{ ... }` block whose selector LIST (the comma-separated text before
 * the `{`) contains `fragment` as one of its selectors — `thinking` and
 * `handoff` share a box-shadow declared against a two-selector list
 * (`.companion-face[data-companion-state='thinking'],\n.companion-face[...
 * ='handoff'] { ... }`), so a plain substring-plus-space-brace `ruleBlock`
 * lookup for `thinking` alone finds thinking's *own*, later, single-selector
 * rule (background-image/animation only) instead — this walks every block in
 * source order and keeps the ones whose header actually names the fragment.
 */
function ruleBlocksContaining(source: string, fragment: string): string[] {
  const blocks: string[] = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const [, header, body] = m;
    if (header?.includes(fragment)) blocks.push(body ?? '');
  }
  return blocks;
}

describe('companion panel glow — containment', () => {
  const panelStates = ['listening', 'thinking', 'handoff', 'speaking'] as const;

  /** Split on top-level commas only — `rgba(45, 212, 191, 0.6)` has three that are not layer separators. */
  function splitTopLevel(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current);
    return parts;
  }

  /** Every real glow layer (i.e. not the shared `--companion-waiting-inset`, itself already inset) in a `box-shadow:` declaration. */
  function glowLayers(block: string): string[] {
    const boxShadow = block.match(/box-shadow:\s*([^;]+;(?:\s*[^;]+;)*)/)?.[1] ?? '';
    return splitTopLevel(boxShadow)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.includes('--companion-waiting-inset'));
  }

  it('draws every panel-scoped state glow inset, so overflow:hidden on data-companion-panel-frame cannot clip it', () => {
    // `thinking`/`handoff` share one box-shadow declared against a
    // two-selector list, same as the shared FAB rule below — found by
    // selector-list membership rather than an exact single-selector marker.
    for (const state of panelStates) {
      const blocks = ruleBlocksContaining(css, `.companion-face--panel[data-companion-state='${state}']`);
      const layers = blocks.map(glowLayers).find((l) => l.length > 0) ?? [];
      expect(layers.length, `expected at least one real glow layer for panel ${state}`).toBeGreaterThan(0);
      // A bare `0 0` layer is exactly the geometry `overflow: hidden` clips
      // away — every layer here has to open with `inset` to survive it.
      for (const layer of layers) {
        expect(layer.startsWith('inset'), `panel ${state} layer not inset: "${layer}"`).toBe(true);
      }
    }
  });

  it('leaves the shared FAB/mini-FAB rules those panel rules override drawing an outward halo', () => {
    // The FAB is a bare `absolute` button with no `overflow: hidden` ancestor
    // sized to match it — an outward bleed is correct there, and changing it
    // would be an unrelated visual regression this fix has no reason to make.
    // (`listening`'s own FAB rule already mixes one outward "breathing" layer
    // with one decorative inset layer by original Theme H design — so the
    // assertion is "at least one layer stays outward", not "every layer is".)
    // `thinking`/`handoff` share one box-shadow declared against a two-
    // selector list, so their block has to be found by selector-list
    // membership rather than an exact single-selector marker.
    for (const state of panelStates) {
      const blocks = ruleBlocksContaining(css, `.companion-face[data-companion-state='${state}']`);
      const withGlow = blocks.map(glowLayers).find((layers) => layers.length > 0);
      expect(withGlow, `expected an outward glow layer for the shared ${state} rule`).toBeDefined();
      expect(withGlow?.some((layer) => !layer.startsWith('inset'))).toBe(true);
    }
  });

  it('keeps the panel idle ring inset too, and still orbiting', () => {
    const block = ruleBlock(css, ".companion-face--panel:not([data-companion-state])");
    expect(block).toContain('inset 0 0');
    expect(block).toContain('companion-spin');
  });

  it('gives the panel-scoped reduced-motion speaking override the same inset treatment as its base rule', () => {
    const block = ruleBlock(
      css,
      "html[data-motion='reduced'] .companion-face--panel[data-companion-state='speaking']",
    );
    expect(block).toContain('inset 0 0 14px');
  });
});
