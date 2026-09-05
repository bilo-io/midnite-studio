import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * The entry chunk's size and — more usefully — its *contents* — Phase 36 Theme H.
 *
 * Two different jobs. The size budgets catch drift: a hundred small imports that
 * each look free. The **absence** assertions catch the specific mistake this
 * phase exists because of, which is one static import putting a whole library
 * back on the boot path. Theme C took the entry from 2 481 KB to 1 085 KB by
 * making thirteen views, xterm and the markdown pipeline lazy; every one of those
 * is a single `import` away from being undone, and nothing in a functional test
 * would notice.
 *
 * Reads `dist/`, so it needs a build — `moon run app:perf` declares `app:build`
 * as a dependency for exactly this reason. It does not open a page; it is a
 * Playwright test only because that is where the rest of the perf suite lives and
 * one runner beats two.
 *
 * ## Why `@dnd-kit` and `lucide-react` are NOT in the absence list
 *
 * Both were in the theme's original list and both were removed with a measured
 * reason, recorded in the phase doc:
 *
 *   - `@dnd-kit` (59.9 KB) reaches the entry through four *eager hook* call
 *     sites, and a hook cannot move behind a lazy boundary without changing its
 *     call count. Splitting it is a real refactor that was acquitted on cost, so
 *     asserting its absence would assert a thing that is deliberately false.
 *   - `lucide-react` is in the entry via `@bilo-io/ui` and `@bilo-io/shell`,
 *     which `app.tsx` imports eagerly for the window chrome. Theme D removed all
 *     54 of *our* importers and eslint's `no-restricted-imports` guards our
 *     source exactly — which is the right place for that tripwire, because it
 *     fires on the mistake a human can actually make.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const DIST = join(REPO_ROOT, 'packages', 'app', 'dist');
const budgets = JSON.parse(readFileSync(join(REPO_ROOT, 'scripts', 'perf', 'budgets.json'), 'utf8'));

/** Every emitted `.js`, recursively. `.vite/` holds the manifest, not shipped code. */
function jsFiles(dir: string, acc: { file: string; bytes: number }[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.vite') continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) jsFiles(full, acc);
    else if (name.endsWith('.js')) acc.push({ file: full.slice(DIST.length + 1), bytes: stat.size });
  }
  return acc;
}

/**
 * The entry chunk's emitted filename, per `.vite/manifest.json`.
 *
 * The manifest *names* the entry; globbing `assets/index-*.js` guesses at a hash
 * pattern and, as this phase found out, matches twenty-three other files.
 */
function entryFile(): string {
  const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8')) as Record<
    string,
    { file: string; isEntry?: boolean }
  >;
  const entry = Object.values(manifest).find((e) => e.isEntry);
  if (!entry) throw new Error('no isEntry chunk in .vite/manifest.json');
  return entry.file;
}

const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

test('the entry chunk stays inside its size budget', () => {
  const entry = entryFile();
  const bytes = jsFiles(DIST).find((f) => f.file === entry)?.bytes ?? 0;
  console.log(`[perf] entry chunk: ${kb(bytes)} KB (budget ${budgets.entryKb} KB) — ${entry}`);
  expect(kb(bytes)).toBeLessThan(budgets.entryKb);
});

test('total emitted JS stays inside its budget', () => {
  const total = jsFiles(DIST).reduce((sum, f) => sum + f.bytes, 0);
  console.log(`[perf] total JS: ${kb(total)} KB (budget ${budgets.totalJsKb} KB)`);
  expect(kb(total)).toBeLessThan(budgets.totalJsKb);
});

/**
 * The tripwire. Each of these was pulled out of the entry by Theme C (or, for
 * `@xterm`, out of a terminal panel that opens closed), and each would return
 * silently on one static import.
 *
 * Matched on the license/banner and module-path strings the bundler leaves in the
 * emitted code rather than on a module graph: Vite's manifest records chunk
 * relationships, not which node_modules package each module came from, and a
 * string match is exact enough for a tripwire whose job is to notice a whole
 * library reappearing.
 */
const MUST_BE_ABSENT = [
  { name: '@xterm/xterm', needles: ['@xterm/xterm', 'xterm.js'] },
  { name: 'react-grid-layout', needles: ['react-grid-layout'] },
  { name: 'react-markdown', needles: ['remarkjs/react-markdown'] },
  { name: 'remark-gfm', needles: ['remark-gfm'] },
  // Phase 64 Theme A: Monaco (~2 MB) stays behind the `React.lazy` boundary
  // at `file-preview.tsx` — it should mount only once a file is opened for
  // editing, never on boot.
  //
  // NOT the bare string `'monaco-editor'` — Theme D's `YIELD_ROOTS`
  // (`shared/src/keybindings.ts`) ships a real, always-loaded CSS selector
  // literal, `'.monaco-editor'`, which the entry chunk legitimately contains
  // (the dispatcher needs it at all times, not lazily) and which false-
  // positives on that needle. `MonacoEnvironment` is Monaco's own distinctive
  // global config object name and is not used anywhere else in this repo.
  { name: 'monaco-editor', needles: ['MonacoEnvironment'] },
] as const;

for (const { name, needles } of MUST_BE_ABSENT) {
  test(`${name} does not resolve into the entry chunk`, () => {
    const source = readFileSync(join(DIST, entryFile()), 'utf8');
    const found = needles.filter((needle) => source.includes(needle));
    expect(
      found,
      `${name} is back in the entry chunk (matched: ${found.join(', ')}). ` +
        'Something added a static import on a path reachable from boot — find it and make it lazy, ' +
        'or move the budget deliberately and say why in scripts/perf/README.md.',
    ).toEqual([]);
  });
}
