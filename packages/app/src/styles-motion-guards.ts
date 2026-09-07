/**
 * The pure checkers behind `styles-motion-guards.test.ts` — Phase 46 Theme H.
 *
 * Extracted from the test file so the Theme F guard proves itself against a
 * fixture instead of asking a human to mutate `styles.css` by hand and watch
 * it fail. The three helpers below were module-local in the test; they close
 * over nothing, so lifting them into their own module and exporting two entry
 * points over a CSS *string* (not the virtual module) is enough to make them
 * independently testable. The stylesheet-backed assertions in the test file
 * are unchanged by this move — this is a refactor beneath them.
 */

/**
 * Every entry needs a reason a human wrote down, not just an entry — that is
 * what makes adding one a visible, reviewed decision rather than a silent
 * skip past the test.
 */
export const MOTION_GUARD_ALLOWLIST: Record<string, string> = {
  shake: 'a single ~0.4s shake on an invalid action (e.g. a wrong passcode), never a loop.',
  // Phase 32 Theme G: no local guard needed because `@bilo-io/shell`'s
  // `appearance.css` already forces `animation-duration: 0.001ms !important`
  // + `animation-fill-mode: forwards !important` on every element under
  // `html[data-motion='reduced']` — this file's own local guards exist for
  // effects THAT reset does not fully cover (see the `code-preview-hit`
  // comment above it), and this one's 100% keyframe is deliberately a fully
  // filled, fully opaque bar, so the pinned final frame IS the required
  // "static filled bar" outcome with nothing extra to add here.
  'browser-loading-sweep':
    'its own 100% keyframe (fully filled, opaque) is already the correct reduced-motion end state, pinned there for free by the shell-wide animation reset.',
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

/** `@keyframes` names declared more than once in `source`. */
export function findDuplicateKeyframes(source: string): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const name of keyframeNames(source)) {
    if (seen.has(name)) dupes.add(name);
    seen.add(name);
  }
  return [...dupes];
}

/**
 * `@keyframes` names that are declared, used by an `animation`/`animation-name`
 * declaration, but whose consuming selector carries no class also guarded by
 * a `@media (prefers-reduced-motion: reduce)` block — and are not listed in
 * `allowlist`.
 *
 * A heuristic, not a full CSS parser: it would miss a guard living on a class
 * *co-applied* to the same element rather than the animated rule's own class.
 */
export function findUnguardedKeyframes(
  source: string,
  allowlist: Record<string, string> = MOTION_GUARD_ALLOWLIST,
): string[] {
  const guardedClasses = classesIn(reducedMotionBlocks(source));
  const unguarded: string[] = [];

  for (const name of new Set(keyframeNames(source))) {
    if (name in allowlist) continue;

    const usageRe = new RegExp(`animation(?:-name)?:\\s*(?:[^;]*?\\b)?${name}\\b`, 'g');
    const uses = [...source.matchAll(usageRe)];
    if (uses.length === 0) {
      unguarded.push(`${name} (declared but never used in an animation)`);
      continue;
    }

    const guarded = uses.some((use) => {
      const selector = enclosingSelector(source, use.index);
      const consumerClasses = classesIn(selector);
      return [...consumerClasses].some((c) => guardedClasses.has(c));
    });
    if (!guarded) unguarded.push(name);
  }

  return unguarded;
}
