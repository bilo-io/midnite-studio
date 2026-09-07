/**
 * jsdom environment gap-filling for every component test in this package.
 *
 * `document.queryCommandSupported` — a real Chromium renderer (what this app
 * actually ships on) has it; jsdom does not. Monaco's clipboard contribution
 * reads it at its own module-evaluation time the moment anything touches
 * `monaco.typescript` (Phase 70 Theme B's ambient `pm.d.ts` registration,
 * `test-editor.tsx`, is the first thing in this codebase that does), which
 * would otherwise throw during test *collection* — before a single test in
 * the file gets to run — rather than inside the one test that happens to
 * open the Scripts tab. `false` is also the practically correct answer: this
 * environment has no queryCommandSupported-backed clipboard at all.
 */
if (typeof document !== 'undefined' && typeof document.queryCommandSupported !== 'function') {
  document.queryCommandSupported = () => false;
}
