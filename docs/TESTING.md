# Testing Strategy & Conventions

Midnite Studio enforces a righted test pyramid across three explicit layers. Logic is kept in
unit tests that run in milliseconds; visual presentation is kept in a capped pixel-diff layer;
and Playwright is reserved strictly for flows that genuinely require a real browser engine.

This strategy ensures CI remains fast, trustworthy, and bounded against silent suite inversion.

---

## 1. The Three Layers

| Layer | Runner / Tool | Target Location | Speed | What It Covers |
|---|---|---|---|---|
| **Unit & Component** | Vitest (`jsdom` / Node) | `packages/*/src/**/*.test.{ts,tsx}` | ~18ms / test | Domain models, parsers, store state transitions, UI component rendering, text, roles, accessibility attributes, mock-bridge interactions. |
| **Visual Regression** | Playwright (`toHaveScreenshot`) | `packages/app/e2e/visual/*.spec.ts` | ~1s / test | Component visual appearance ("does it look right"), theme tokens, color swatches, status pill gradients, indicator glow states. Component locator crops only. |
| **Functional E2E** | Playwright (Chromium) | `packages/app/e2e/*.spec.ts` | ~3.5s / test | Real browser flows: layout geometry, computed CSS, pointer drag-and-drop, xterm ANSI terminal, canvas / WebGL, paint/z-order, and multi-view navigation. |

---

## 2. The Decision Rule

> **A new test is a Vitest test unless it needs real layout, real CSS, pointer coordinates,
> xterm, canvas, focus order, or paint order — name which, in the spec's own header comment.**

When writing a new test:
1. **Default to Vitest:** If you are asserting text content, DOM structure, accessible roles/attributes, or store state changes, it belongs in Vitest under `packages/app/src/` using the ergonomics provided in `packages/app/test-support/render.tsx` (`renderView`) and `test-support/mock-bridge.ts` (`buildMockBridge`, `makeFixtures`).
2. **Visual Appearance:** If you are verifying that styling, tokens, or theme palettes look correct, add a component crop test under `packages/app/e2e/visual/`. Never write slow DOM assertions against computed CSS in functional specs for visual-only checks.
3. **Functional E2E:** If and only if the test exercises real browser primitives that jsdom cannot emulate (e.g., `getBoundingClientRect`, CSS transitions/animations, xterm.js rendering, mouse drag interactions, `<canvas>` manipulations, or focus-trapping overlays), write it as a Playwright functional spec under `packages/app/e2e/`. State explicitly in the file's header comment which browser capability justifies its presence.

---

## 3. How to Run Each Layer

### Unit & Component Tests
```bash
moon run :test                    # Run tests across all workspace packages
moon run app:test                 # Run renderer unit tests only
pnpm --filter @midnite/studio-app test   # Vitest watch or CLI
```

### Visual Regression Tests
```bash
moon run app:visual               # Run Playwright visual regression suite against committed baselines
```

### Functional E2E Tests
```bash
moon run app:e2e                  # Run Playwright functional suite
pnpm --filter @midnite/studio-app e2e    # Direct Playwright runner
```

### Budget & Guard Checks
```bash
moon run root:e2e-budget          # Verify declared functional E2E test count and visual caps
moon run root:visual-budget       # Verify visual baseline PNG count and size caps
```

---

## 4. Visual Baselines & Regeneration

Committed visual baselines are strictly **Linux-only** to avoid cross-platform font rendering drift
(e.g., macOS CoreText vs Linux FreeType/HarfBuzz). Baselines live under
`packages/app/e2e/visual/__screenshots__/linux/`.

### Hard Budget Caps
- **Max baselines:** 100 PNGs
- **Max total size:** 3 MB
- **Crop rule:** Every visual test **must** call `.toHaveScreenshot()` on a component `Locator`,
  **never** on a full `Page`. A locator crop is 10–20 KB; a full-page capture is 100+ KB.

### Regenerating Baselines

**This is the only thing in the repo that starts a container, and it is opt-in.** macOS (arm64)
is the only officially supported platform for now (see the README's *Supported platform*); Linux
and Windows are deferred, so the Linux baselines — and the `visual` CI lane that asserts against
them — are deferred scope too. The default local loop (`moon run :typecheck :lint :test`) has
never started a container and does not now.

To regenerate baselines consistently without OS font divergence, from the repo root:

```bash
MSTUDIO_CROSS_PLATFORM=1 moon run root:visual-regen
```

`scripts/visual-regen.mjs` refuses without that variable, and runs the exact `docker run` recipe
documented in `packages/app/playwright.visual.config.ts`'s header — the official
`mcr.microsoft.com/playwright:v1.62.1-noble` image, `--ignore-scripts` on the install, and
`pnpm exec` from `packages/app` rather than `npx` or `moon`. All three of those are load-bearing;
that header explains why.

The `visual` job in CI is gated behind the `cross-platform` PR label or the `cross_platform`
`workflow_dispatch` input, so regenerated baselines need one of those to be verified. The
baseline **budget** (`root:e2e-budget`) still runs on every PR, so the corpus cannot regrow while
the lane is idle.

---

## 5. The Ratchet Discipline (`scripts/e2e-budget.mjs`)

The functional E2E suite is governed by a committed ratchet in `scripts/e2e-budget.mjs`:
- The script checks the total number of declared functional tests.
- **Lowering the ratchet count** is a routine commit when tests are migrated to Vitest.
- **Raising the ratchet count** requires an explicit sentence in the commit message and PR description explaining why the addition cannot run in Vitest or the visual layer.
- CI runs `scripts/e2e-budget.mjs` in the `gate-node` job before tests run, failing fast if the budget is breached.

---

## 6. Flake Register & Timing Hygiene

CI trust depends on determinism. Common flake patterns and their mitigations:

1. **No Wall-Clock Duration Assertions in Unit Tests:**
   Never write assertions like `expect(elapsed).toBeLessThan(100)` in unit tests. Under contended CI
   runners, thread scheduling and process startup fluctuate widely. Use `vi.useFakeTimers()` for timer
   logic, or event-driven synchronization (`await expect.poll(...)` / `waitFor(...)`).
2. **Phantom Tooltips on Modal Unmount:**
   When a full-screen modal or popup closes, Chrome synthesizes a `mouseenter` event on whichever
   element lands under the stationary pointer. If that element has a `Tooltip`, it arms and opens
   unexpectedly, creating an occluder layer. In E2E tests that close overlays, park the pointer in an
   inert area (`page.mouse.move(0, 0)`) if subsequent steps are keyboard-driven.
3. **Microtask-Driven Observers:**
   `ResizeObserver` stubs fire callbacks via `queueMicrotask`, not synchronously. When asserting
   content whose rendering depends on an observer callback, use `await findByRole(...)` or
   `waitFor(...)` rather than synchronous queries.
