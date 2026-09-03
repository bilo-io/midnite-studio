import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';

/**
 * Every `@keyframes` in `styles.css` is either referenced by a
 * reduced-motion-guarded rule, or explicitly allowlisted with a reason —
 * Phase 46 Theme F.
 *
 * Modelled on `components/icons/icon-names.test.ts`: a convention with a test
 * behind it, in the unit suite (not e2e, which is under repair in Phase 38
 * and reads no CSS anyway). Three phases in a row ([37 F], [39 G], [42 F])
 * ended with an unfinished motion item because nothing failed when they did
 * — this is the guard that can't be forgotten. Reads the stylesheet through
 * the existing `virtual:midnite-styles-raw` module (`vitest.config.ts`) —
 * `loop-spectrum.test.ts`'s own seam for the same problem: Vitest stubs every
 * CSS import to an empty string regardless of a `?raw` query, since it
 * matches on the extension, not the query string.
 *
 * The check is a heuristic, not a full CSS parser: for each keyframe, find
 * every `animation`/`animation-name` declaration that names it, resolve the
 * *enclosing selector*, and confirm at least one of that selector's classes
 * also appears inside a `@media (prefers-reduced-motion: reduce)` block
 * somewhere in the file. That would miss a guard living on a class
 * *co-applied* to the same element rather than the animated rule's own class
 * — worth naming because it is the shape `fab-panel-spin`/`fab-glow-pulse`
 * looked like at a glance (both fire on `.fab-panel-gradient`/
 * `.landing-panel-gradient`) before checking where the `animation` shorthand
 * actually lives: `.gradient-frame::before`, the class every host adds
 * *alongside* its own, and the same class the guard targets. No allowlist
 * entry needed there; `shake` below is the one animation this file has that
 * genuinely has no guard, on purpose.
 */

/**
 * Every entry needs a reason a human wrote down, not just an entry — that is
 * what makes adding one a visible, reviewed decision rather than a silent
 * skip past the test.
 */
const ALLOWLIST: Record<string, string> = {
  shake: 'a single ~0.4s shake on an invalid action (e.g. a wrong passcode), never a loop.',
};

function keyframeNames(source: string): string[] {
  const names: string[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[1]) names.push(m[1]);
  }
  return names;
}

function classesIn(selectorOrBlock: string): Set<string> {
  const classes = new Set<string>();
  const re = /\.([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selectorOrBlock))) {
    if (m[1]) classes.add(m[1]);
  }
  return classes;
}

/** The selector text immediately before the `{` that opens the block containing `index`. */
function enclosingSelector(source: string, index: number): string {
  const openBrace = source.lastIndexOf('{', index);
  const closeBraceBefore = source.lastIndexOf('}', openBrace - 1);
  return source.slice(closeBraceBefore + 1, openBrace).trim();
}

/** Every `@media (prefers-reduced-motion: reduce) { ... }` block's inner content, brace-matched. */
function reducedMotionBlocks(source: string): string {
  const out: string[] = [];
  const marker = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(source))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    out.push(source.slice(start, i - 1));
  }
  return out.join('\n');
}

describe('styles.css motion guards (Phase 46 Theme F)', () => {
  it('finds keyframes in the stylesheet — a guard on the guard', () => {
    // If the glob or the regex below ever stops matching, every per-name
    // assertion would vacuously pass.
    expect(keyframeNames(css).length).toBeGreaterThan(10);
  });

  it('declares no @keyframes name twice', () => {
    // The bug this phase found by reading: `pill-shimmer` was declared twice,
    // byte-identical, with two different guards — later one wins, so the
    // first was dead code nobody noticed.
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const name of keyframeNames(css)) {
      if (seen.has(name)) dupes.add(name);
      seen.add(name);
    }
    expect([...dupes]).toEqual([]);
  });

  it('every keyframe is guarded by a reduced-motion rule, or explicitly allowlisted', () => {
    const guardedClasses = classesIn(reducedMotionBlocks(css));
    const unguarded: string[] = [];

    for (const name of new Set(keyframeNames(css))) {
      if (name in ALLOWLIST) continue;

      const usageRe = new RegExp(`animation(?:-name)?:\\s*(?:[^;]*?\\b)?${name}\\b`, 'g');
      const uses = [...css.matchAll(usageRe)];
      if (uses.length === 0) {
        unguarded.push(`${name} (declared but never used in an animation)`);
        continue;
      }

      const guarded = uses.some((use) => {
        const selector = enclosingSelector(css, use.index);
        const consumerClasses = classesIn(selector);
        return [...consumerClasses].some((c) => guardedClasses.has(c));
      });
      if (!guarded) unguarded.push(name);
    }

    expect(unguarded).toEqual([]);
  });
});
