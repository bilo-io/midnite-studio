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
  // Phase 84 Theme K.6 taught this guard to also see `tailwind.config.ts`'s
  // `keyframes` — Tailwind-authored animations that never appear in
  // `styles.css` as a literal `@keyframes` block, and so were invisible
  // here before (`tailwindKeyframeNames` below). `fade-in`/`fade-in-up` are
  // the two that DID get an app-owned guard, right beside `pill-shimmer`'s
  // in `styles.css` — these five did not need one added, because each is
  // already an ambient loop stopped by the same shell-wide
  // `html[data-motion='reduced'] *` reset `browser-loading-sweep` above
  // leans on, with nothing static to allowlist a single pinned frame for.
  'halo-breathe':
    "the branch-status dot's breathing halo — an ambient loop stopped by the shell-wide reduced-motion reset, same precedent as browser-loading-sweep.",
  'lane-sweep':
    "the checked-out branch chip's gradient sweep — ambient, stopped by the shell-wide reset.",
  'dot-pulse': 'a live terminal session dot — ambient, stopped by the shell-wide reset.',
  'dot-wave': 'the "waiting on you" ellipsis — ambient, stopped by the shell-wide reset.',
  'caret-blink': 'the idle terminal caret — ambient, stopped by the shell-wide reset.',
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

/**
 * Classes in a selector or block, plus a synthetic `:root` token when the
 * selector carries that pseudo-class — the one guard target in this file
 * with no class of its own (the browser search-bar clock's shared timeline
 * animates `:root` directly, precisely so no individual element owns a
 * separate animation instance to fall out of phase with the others).
 */
function classesIn(selectorOrBlock: string): Set<string> {
  const classes = new Set<string>();
  const re = /\.([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selectorOrBlock))) {
    if (m[1]) classes.add(m[1]);
  }
  if (/(?:^|[\s,>+~]):root\b/.test(selectorOrBlock)) classes.add(':root');
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

/**
 * Top-level object keys directly inside `block` — one rung, ignoring
 * anything nested deeper (a keyframe's own `0%`/`50%`/`100%` steps).
 *
 * Not a JSON/JS parser: it tracks brace depth and, each time depth returns
 * to 0 right before a `{`, takes the trailing `key:`-shaped text since the
 * previous top-level close as that key's name. Good enough for a config
 * object literal, which is all `tailwindKeyframeNames` below ever hands it.
 */
function topLevelObjectKeys(block: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let boundary = 0;
  const keyRe = /['"]?([\w-]+)['"]?\s*:\s*$/;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === '{') {
      if (depth === 0) {
        const m = keyRe.exec(block.slice(boundary, i));
        if (m?.[1]) keys.push(m[1]);
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) boundary = i + 1;
    }
  }
  return keys;
}

/** The brace-matched value of `key: { … }` in `source`, or `null` if `key` never opens an object there. */
function bracedValue(source: string, key: string): string | null {
  const marker = new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*\\{`);
  const m = marker.exec(source);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

/**
 * `@keyframes`-equivalent names declared in a Tailwind config's
 * `theme.extend.keyframes` block — Theme K.6. Tailwind generates the actual
 * `@keyframes` rule (and the `animate-<name>` utility that plays it) at
 * build time, so none of this ever appears in `styles.css` as literal CSS
 * for `keyframeNames` above to find; reading `tailwind.config.ts`'s own
 * source is the only way this guard can see them at all.
 */
export function tailwindKeyframeNames(source: string): string[] {
  const block = bracedValue(source, 'keyframes');
  return block ? topLevelObjectKeys(block) : [];
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
 *
 * `tailwindSource`, when given (Theme K.6), is `tailwind.config.ts`'s own
 * text — read for its `keyframes` block so this can also see the animations
 * Tailwind generates at build time rather than only what `source` spells out
 * as literal `@keyframes`. A Tailwind-sourced name's consumer is never a
 * literal `animation:` declaration to search for the way `source`'s own
 * keyframes are — Tailwind wires the keyframe to an `animate-<name>` utility
 * class instead — so "guarded" for one of these means that class name itself
 * turns up inside `source`'s own `@media (prefers-reduced-motion: reduce)`
 * blocks. Every entry in this codebase's `tailwind.config.ts` gives its
 * animation the SAME key as the keyframe it plays (`'fade-in': 'fade-in …'`),
 * which is what makes deriving the class name from the keyframe name alone a
 * safe heuristic here rather than a guess at Tailwind's general config shape.
 */
export function findUnguardedKeyframes(
  source: string,
  allowlist: Record<string, string> = MOTION_GUARD_ALLOWLIST,
  tailwindSource = '',
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

  for (const name of new Set(tailwindKeyframeNames(tailwindSource))) {
    if (name in allowlist) continue;
    if (!guardedClasses.has(`animate-${name}`)) unguarded.push(name);
  }

  return unguarded;
}
