import { describe, expect, it } from 'vitest';
import css from 'virtual:midnite-styles-raw';
import { findDuplicateKeyframes, findUnguardedKeyframes } from './styles-motion-guards';

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
 *
 * **Phase 46 Theme H:** the checkers themselves used to be module-local here,
 * closing over nothing but unexported, so the "prove it by adding an
 * unguarded `@keyframes`, watching it fail, then reverting" verification line
 * was a manual mutation test nobody would re-run. They now live in
 * `./styles-motion-guards`, exported over a CSS *string*, so the fixture
 * cases below exercise the negative case directly instead of asking a human
 * to mutate `styles.css` by hand.
 */

describe('styles.css motion guards (Phase 46 Theme F)', () => {
  it('finds keyframes in the stylesheet — a guard on the guard', () => {
    // If the glob or the regex below ever stops matching, every per-name
    // assertion would vacuously pass.
    expect(css.match(/@keyframes\s+[\w-]+\s*\{/g)?.length ?? 0).toBeGreaterThan(10);
  });

  it('declares no @keyframes name twice', () => {
    // The bug this phase found by reading: `pill-shimmer` was declared twice,
    // byte-identical, with two different guards — later one wins, so the
    // first was dead code nobody noticed.
    expect(findDuplicateKeyframes(css)).toEqual([]);
  });

  it('every keyframe is guarded by a reduced-motion rule, or explicitly allowlisted', () => {
    expect(findUnguardedKeyframes(css)).toEqual([]);
  });
});

describe('styles-motion-guards fixtures (Phase 46 Theme H)', () => {
  it('findUnguardedKeyframes flags a keyframe with no guard at all', () => {
    expect(findUnguardedKeyframes('@keyframes ghost{}\n.x{animation: ghost 1s;}')).toEqual([
      'ghost',
    ]);
  });

  it('findUnguardedKeyframes clears a keyframe once its consuming class is guarded', () => {
    expect(
      findUnguardedKeyframes(
        '@keyframes ghost{}\n.x{animation: ghost 1s;}\n@media (prefers-reduced-motion: reduce){ .x{animation:none} }',
      ),
    ).toEqual([]);
  });

  it('findDuplicateKeyframes flags a name declared twice', () => {
    expect(findDuplicateKeyframes('@keyframes a{}@keyframes a{}')).toEqual(['a']);
  });
});
