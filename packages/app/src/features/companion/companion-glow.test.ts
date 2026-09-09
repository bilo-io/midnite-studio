import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';

/**
 * Regression coverage for the docked companion panel's glow — the Ad Hoc
 * "companion glow, verified" containment fix, and the "companion glow,
 * states" follow-up that finished it.
 *
 * **Round one (verified).** PR #303 gave the panel `.companion-face`/
 * `.companion-face--panel` so it would pick up Theme H's
 * `[data-companion-state]` rules, but every one of those draws its glow as an
 * OUTWARD `box-shadow` (`0 0 Npx …`) and `app.tsx` docks the panel inside
 * `data-companion-panel-frame`, an `overflow: hidden` box sized in lockstep
 * with the panel's own width. An outward shadow has nowhere to bleed before
 * that ancestor clips it, so nothing painted. Swapping the panel rules to
 * `inset` fixed the geometry, and the first two tests below still hold it.
 *
 * **Round two (states).** The bug report survived that fix, and driving the
 * live panel through every state showed why: the `inset` rules were winning
 * the cascade, `--companion-glow` really was interpolating, `--companion-level`
 * really was arriving from `speaker.ts` — nothing was being clipped or
 * overpainted. What was wrong was AMPLITUDE. The panel rules were copied
 * verbatim from the FAB rules they override, and a glow calibrated to bloom
 * outward around a 32px button is nothing painted inward along a 360×800px
 * panel edge. Sampled a pixel inside the left edge against a (16,16,19)
 * ground, `idle` lifted it to (21,38,49) and `speaking` — whose level sits at
 * 0 for seconds at a time under the local voice engine, which has no word
 * boundaries — lifted it not at all. Only `thinking`, pulsing out to 24px,
 * ever cleared the noise floor, which is exactly what the user reported.
 *
 * So the tests after the first two are about the system that replaced it: one
 * animated angle (`--companion-orbit`, inheriting, so the `::after` band can
 * read it) driving both the arc and its bloom, an idle duration pinned to a
 * fifth of thinking's, a `speaking` floor that reads without any level at
 * all, and both motion gates covering every state rather than only idle.
 *
 * A `getByTestId(...).classList` assertion (see `companion-panel.test.tsx`)
 * cannot catch any of this: jsdom applies no real CSS, so the class being
 * present is not evidence the glow is visible. These parse the actual
 * stylesheet text; the pixels themselves are asserted in
 * `e2e/companion-panel-glow.spec.ts`, which samples the rendered panel edge.
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

  it('keeps the panel idle ring inset-safe, and orbiting on the shared timeline', () => {
    const block = ruleBlock(css, '.companion-face--panel:not([data-companion-state])');
    // The travelling band is the idle glow now, so the host itself carries no
    // outward layer at all — only the loop's own already-inset waiting ring.
    for (const layer of glowLayers(block)) {
      expect(layer.startsWith('inset'), `panel idle layer not inset: "${layer}"`).toBe(true);
    }
    expect(block).toContain('companion-orbit');
    expect(block).not.toContain('companion-spin');
  });

  /**
   * The "matched up" requirement, as a textual invariant.
   *
   * The idle arc and its bloom have to be the SAME object seen twice, not two
   * animations that agree only because they started on the same frame — the
   * failure `.gradient-frame::before`'s own comment records (pause one and
   * they end up tens of degrees apart). One way to guarantee it is for both
   * layers to read one animated angle and one ramp, and for nothing on this
   * panel to animate a second angle.
   */
  it('drives the panel arc and its bloom from one angle and one ramp', () => {
    const band = ruleBlock(css, '.companion-face--panel::after');
    expect(band).toContain('conic-gradient(from var(--companion-orbit), var(--companion-arc-ramp))');
    // The band must not run an animation of its own — the host's inherited
    // angle is the only clock.
    expect(band).not.toMatch(/animation\s*:/);

    // `thinking` and `handoff` each own two blocks — one shared with the
    // other, one of their own — so this asks whether ANY block for the
    // selector lights the ring from the shared angle, not the first one.
    for (const selector of [
      '.companion-face--panel:not([data-companion-state])',
      ".companion-face--panel[data-companion-state='thinking']",
      ".companion-face--panel[data-companion-state='handoff']",
    ]) {
      const lit = ruleBlocksContaining(css, selector).some((block) =>
        block.includes('conic-gradient(from var(--companion-orbit), var(--companion-arc-ramp))'),
      );
      expect(lit, `${selector} should light its ring from the angle the band reads`).toBe(true);
    }
  });

  /** `--companion-orbit` has to inherit, or the `::after` reads its initial 0deg forever. */
  it('registers the orbit angle as an inheriting property', () => {
    const block = ruleBlock(css, '@property --companion-orbit');
    expect(block).toContain('inherits: true');
  });

  /**
   * "One fifth of the thinking speed", read literally — and pinned, so that
   * changing one duration without the other fails here rather than in a
   * screenshot nobody looks at twice.
   */
  it('runs the idle orbit at exactly a fifth of thinking\'s', () => {
    const seconds = (selector: string): number => {
      const block = ruleBlock(css, selector);
      const match = block.match(/--companion-orbit-duration:\s*([\d.]+)s/);
      if (!match) throw new Error(`no --companion-orbit-duration in ${selector}`);
      return Number(match[1]);
    };
    const idle = seconds('.companion-face--panel');
    const thinking = seconds(".companion-face--panel[data-companion-state='thinking']");
    expect(idle).toBeCloseTo(thinking * 5, 5);
  });

  /**
   * `speaking` reads the level and nothing else — and it has to READ as lit
   * with the level at 0, which is most of the time: `speaker.ts` pulses to 1
   * on a boundary and decays over 180ms, and the local voice engine has no
   * word boundaries at all (one `onBoundary` per ~200-character chunk). The
   * previous `calc(8px + …)` floor was the whole reason the state looked dead.
   */
  it('gives speaking a level-reactive glow with a floor that reads on its own', () => {
    const host = ruleBlock(css, ".companion-face--panel[data-companion-state='speaking']");
    expect(host).toContain('var(--companion-level)');
    expect(host).toContain('animation: none');

    const radius = host.match(/inset 0 0 calc\((\d+)px \+ (\d+)px \* var\(--companion-level\)\)/);
    expect(radius, 'speaking should scale one inset radius off the level').not.toBeNull();
    // The floor, not the ceiling: 8px at 0.35 alpha was invisible on a 360px
    // panel edge. Anything at or below that is the old bug coming back.
    expect(Number(radius?.[1])).toBeGreaterThan(8);
    expect(Number(radius?.[2])).toBeGreaterThan(0);
  });

  it('gives the panel-scoped reduced-motion speaking override the same inset treatment as its base rule', () => {
    const block = ruleBlock(
      css,
      "html[data-motion='reduced'] .companion-face--panel[data-companion-state='speaking']",
    );
    for (const layer of glowLayers(block)) {
      expect(layer.startsWith('inset'), `reduced-motion speaking layer not inset: "${layer}"`).toBe(
        true,
      );
    }
    // No dependence on the level at all — a glow that tracked speech would
    // still be motion, just motion driven from JavaScript.
    expect(block).not.toContain('--companion-level');
  });

  /**
   * Both reduced-motion forms stop the orbit AND pin it. Stopping alone
   * freezes the arc wherever the clock left it, which reads as damage rather
   * than as stillness.
   */
  it('stops and pins the orbit under both reduced-motion forms', () => {
    const blocks = ruleBlocksContaining(css, '.companion-face--panel').filter(
      (b) => b.includes('--companion-orbit:') && b.includes('animation: none'),
    );
    // One for the media query, one for the in-app Appearance choice.
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * The focus gate now has to cover every state, not just idle: the orbit
   * runs in `idle`, `thinking` and `handoff`, and an inheriting animated
   * property means an unpaused frame is a style recalc over the whole panel
   * subtree.
   */
  it('pauses the panel orbit on a blurred window, whatever the state', () => {
    const gate = ruleBlocksContaining(css, "html[data-window-focused='false'] .companion-face--panel");
    expect(gate.some((b) => b.includes('animation-play-state: paused'))).toBe(true);
    const headers = css.match(
      /html\[data-window-focused='false'\] \.companion-face--panel[^{]*\{/g,
    );
    // The bare host selector, so a state-less panel is covered too.
    expect(headers?.[0]).toContain("html[data-window-focused='false'] .companion-face--panel,");
  });
});
