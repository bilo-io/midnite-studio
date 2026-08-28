import { describe, expect, it } from 'vitest';

/**
 * Every reveal-related transition reads its duration from `motionMs()`
 * (Phase 30 Theme A) so a hardcoded Tailwind `duration-200` and the JS
 * constant it used to be "paired by hand" with can no longer drift apart.
 *
 * The one exception is the nav-lock chevron in `app.tsx` — a plain
 * `transition-transform`, not a reveal, so it keeps its own literal. This
 * test is the standing form of the phase doc's own verification note ("grep
 * -rn 'duration-200' packages/app/src prints exactly one line"), so a future
 * reveal added with the old literal fails a test rather than waiting to be
 * caught by someone remembering to run the grep.
 *
 * `import.meta.glob` (Vite's own file-enumeration primitive), not `node:fs`:
 * `packages/app` is the renderer, and no file in it may import a node
 * builtin — see `eslint.config.mjs`'s per-package `no-restricted-imports`.
 */
const sourceFiles = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('duration-200 literal', () => {
  it('appears exactly once in packages/app/src, on the nav-lock chevron', () => {
    const matches = Object.entries(sourceFiles)
      .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
      .flatMap(([path, content]) =>
        content
          .split('\n')
          .flatMap((line, index) =>
            line.includes('duration-200') ? [{ path, line: index + 1, text: line.trim() }] : [],
          ),
      );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.path.endsWith('app.tsx')).toBe(true);
    expect(matches[0]?.text).toContain('transition-transform');
  });
});
