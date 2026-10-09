# `test-support/` — the unit layer's harness

`render.tsx` (`renderView`), `mock-bridge.ts` (`buildMockBridge`, `makeFixtures`),
`fixtures.ts`, `module-mocks.ts` (Monaco + xterm `vi.mock` factories) and
`csp-console-guard.ts`. [`docs/TESTING.md`](../../../docs/TESTING.md) says *which* layer a test
belongs in; this file is about writing it once it is here.

## Porting an e2e spec to Vitest — six traps

Phase 82 Theme C moved Playwright tests into this layer in five waves. Every trap below
was hit at least once, and **every one of them fails as a false negative that reads like a render
or timing bug** — so check this list before debugging the component. The jsdom/Testing Library
behaviour traps 1, 2, 3 and 5 rest on is pinned by
[`src/test-support-premises.test.tsx`](../src/test-support-premises.test.tsx); if a dependency
bump flips one, that test goes red and this list gets revisited.

1. **Check the matcher before the render.** `getByRole`/`getByText` match the **whole string**
   by default; Playwright's `getByText` and `name:` match a **substring**. An assertion ported
   verbatim fails with "unable to find an element". Use a regex or `{ exact: false }` (on
   `getByText` — see 2).

2. **`getByRole` has no `exact` option.** Playwright's `{ name, exact: true }` ported onto
   `getByRole` is a **typecheck** error, not a runtime one — `ByRoleOptions` has no `exact`,
   that is `getByText`'s. `vitest run` alone passes; only `moon run app:typecheck` catches it.
   Wave 5 hit it in seven files. Drop `exact` — a string `name` is already exact.

3. **A component that only mounts on an interaction: `await` what it renders.**
   `vitest-setup.ts`'s `FiringResizeObserver` fires from a `queueMicrotask`, not synchronously.
   A virtualised list (`@tanstack/react-virtual`) that only mounts when the interaction under
   test opens it — the palette's rows after `Meta+k` — has no rows on the tick after the
   keypress. Use `await findByRole(…)` / `waitFor(…)` for anything the interaction itself
   mounted, never a synchronous `getBy*`.

4. **A `React.lazy` chunk is a compile, not a render — warm it in `beforeAll`.** A component
   behind its own `lazy()` boundary whose chunk pulls a heavy ESM dependency (`commit-message`
   → `react-markdown` + `remark-gfm`) makes the first test await Vite's transform. It passes
   when `app:test` runs alone and fails under the full `moon run :typecheck :lint :test`, where
   every package's suite runs in parallel — it looks like load flake and is not. Raising a
   timeout only moves the race. Resolve the chunk into vitest's module cache first, which
   weakens no assertion:

   ```ts
   beforeAll(async () => {
     await import('../commit/commit-message');
   });
   ```

   Only the component's **own** `lazy()` counts. Mounting a view directly bypasses the view
   registry's lazy boundary, so most views need no warm-up — check rather than add it by habit.

5. **Disjoint `<mark>` highlights split the accessible name.** Fuzzy highlighting wraps each
   matched run in its own `<mark>`. jsdom loads no stylesheet, so accname cannot tell `<mark>`
   is inline and pads each one with spaces: "tt" over "Toggle Terminal" names the row
   `"T oggle T erminal"`, while `textContent` stays `"Toggle Terminal"`. Find the row by
   `textContent` rather than weakening the query:

   ```ts
   const rows = await screen.findAllByRole('option');
   const row = rows.find((r) => /Toggle Terminal/.test(r.textContent ?? ''));
   ```

6. **Stub `MonacoField` in any test that imports the API Client.**
   `features/api-client/monaco-field.tsx` calls the real `getMonaco()` at **module scope** —
   not when its tab mounts. Importing `ApiClientView` for an unrelated tab still loads Monaco
   for real, and the resulting unhandled rejection surfaces as noise attributed to whichever
   *other* file vitest is running when the import settles. `vi.mock('./monaco-field', …)`
   with a plain stub; every API Client test already does.
