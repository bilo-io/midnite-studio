import { describe, expect, it } from 'vitest';

/**
 * Phase 66 Theme H — the one rule `eslint`'s `no-restricted-imports` cannot
 * express, because `fetch` is a global, not an import: nothing under
 * `features/api-client/` may call it directly.
 *
 * All HTTP goes through `window.midniteStudio.apiClient.sendRequest`, which
 * crosses into main process code (`main/api-client/send.ts`) that applies the
 * response cap, the timeout, `{{var}}` interpolation, and the cancel map. A
 * stray `fetch(` in the renderer would run outside every one of those, and it
 * is the mistake an executor is likeliest to make precisely because `fetch`
 * is ambient under jsdom — a renderer test calling it directly would not even
 * fail on its own.
 *
 * `import.meta.glob` with `?raw` reads every source file as text at
 * transform time (the same technique `icon-names.test.ts` uses) rather than
 * `node:fs`, which the renderer's own eslint boundary forbids under `src/`.
 * This file itself is excluded by the glob pattern (it lives one directory
 * up from where the glob starts reading, and Vite excludes the globbing
 * file from its own glob besides), so the several `fetch(` mentions in this
 * doc comment cannot make the assertion vacuous — see the "guard on the
 * guard" test below, which fails loudly if the glob ever stops matching
 * anything at all.
 */
const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Matches a call — `fetch(...)` — never a bare mention of the identifier. */
const FETCH_CALL = /\bfetch\s*\(/;

describe('features/api-client/ never calls fetch() directly', () => {
  it('finds source files to scan (a guard on the guard)', () => {
    // If this ever drops to zero the glob pattern broke, and every assertion
    // below would pass vacuously rather than actually scanning anything.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10);
  });

  it('contains zero fetch( call sites', () => {
    const hits = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith('/no-fetch.test.ts'))
      .filter(([, source]) => FETCH_CALL.test(source))
      .map(([path]) => path);
    expect(hits).toEqual([]);
  });
});
