#!/usr/bin/env node
// e2e-budget: enforces the righted test pyramid (Phase 82 Theme F).
//
// CI on this repo was historically gated by its slowest job — the Playwright
// functional suite at 8m31s wall, ~46 runner-minutes per PR. Phase 82 established
// the righted test pyramid:
// 1. Vitest / jsdom carries all logic, store transitions, and views (~18ms/test).
// 2. Playwright visual regression (`moon run app:visual`) carries component
//    appearance via locator crops, capped at ~100 baselines / 3 MB.
// 3. Playwright functional e2e (`moon run app:e2e`) is reserved strictly for flows
//    that genuinely require a real browser (real layout/geometry, real CSS,
//    pointer drag, xterm, canvas, or focus order).
//
// This script enforces these invariants in the gate (the last three are Phase 116 Theme E):
// - Functional E2E test ratchet: declared functional tests must not exceed the
//   committed ratchet cap (currently 433). Lowering this cap is a deliberate commit
//   as tests migrate to Vitest; raising it requires an explicit sentence in the
//   commit message explaining why the test cannot run in Vitest or visual regression.
// - Visual baseline budget: baselines must remain under the 100 PNG / 3 MB cap
//   (delegated to `checkVisualBudget` from `visual-budget.mjs`).
// - Timing flake prevention: unit tests must never assert wall-clock duration bounds
//   (`expect(elapsed).toBeLessThan(...)`), which flakes under CI thread contention.
// - No disk screenshots from functional E2E: no `*-shots.spec.ts`, and no
//   `.screenshot({ path })` / `.screenshot(path)` in `packages/app/e2e/*.spec.ts`.
//   PR verification shots live in the session scratchpad, never in git.
// - No orphaned images under `docs/screenshots/`: each must be referenced from
//   `README.md`, `docs/*.md` or `packages/website/`.
// - No un-allowlisted `waitForTimeout(` in functional E2E specs: a call must be
//   polled instead, routed through `settle()` in `shots-helper.ts`, or carry an
//   `// allow-timeout: <reason>` comment on the same or the preceding line.

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkVisualBudget,
  collectPngSizes,
  MAX_BASELINES,
  MAX_TOTAL_BYTES,
  VISUAL_SCREENSHOTS_DIR,
} from './visual-budget.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Committed ratchet cap on declared functional E2E tests (Phase 82 Theme F).
// Lowering is routine as tests move to Vitest; raising requires justification.
//
// Raised 433 -> 436 for Phase 87 Theme G's `knowledge-canvas.spec.ts` (3
// tests): the Knowledge view's sigma/WebGL canvas is exactly the class of
// thing this ratchet exists to let through rather than block — real WebGL
// context acquisition, real `getBoundingClientRect` hit-testing against
// WebGL-rendered geometry, and a real pointer drag to pan the camera, none
// of which jsdom can do at all (see `docs/TESTING.md`'s own decision rule).
// Every OTHER Knowledge behaviour (filters, search matching, state
// transitions, the empty/stale/malformed states) already has its own vitest
// suite with the canvas mocked out.
//
// Raised 436 -> 438 for the Knowledge canvas's interactivity pass (PR #428,
// two more cases in the same `knowledge-canvas.spec.ts`): a real double-click
// hit-tested by sigma's WebGL picking layer (collapsing a community and
// putting the node back under the same pixel), and a camera fly proven by a
// subsequent real click landing on the flown-to node. The decisions behind
// both — which edges a collapsed community folds into, what lights up, the
// tree rows, the bounce curve — are pure functions with their own vitest
// suites; only the pixel-level outcome needs the browser.
// Raised 438 -> 439 for the apps switcher's reveal (`web-apps-rail-reveal.spec.ts`,
// one test): the switcher's hover region is nested inside `AppFrame`'s own
// hover-expanding rail, so the two hover surfaces overlap and only a real
// pointer can show the composed result — a `page.mouse.move` to a coordinate
// outside the group collapsing it back, and a real `hover()` landing on the
// group rather than being swallowed by the rail around it. jsdom has no
// pointer; it can only be told `mouseenter` fired. Everything else about the
// feature — which icons render for a given `lastOpenedWebAppId`, when the labels
// appear, the store transitions that set it, the disabled-app fallback — is in
// `web-apps-rail-row.test.tsx` under vitest, which is why this is one test.
// Raised 439 -> 440 for the rail's overflow row height (`nav-shell.spec.ts`,
// one test): flex-shrink against a column taller than the window is pure
// layout, and jsdom reports every box as 0x0, so the only way to see a row
// collapse from 36px to a single line box is to measure
// `getBoundingClientRect` in a real engine. Nothing else about the rail needs
// the browser — which rows render, their order and the pinned slot are all
// already asserted in this same file without geometry.
// Raised 440 -> 441 for Phase 86 Theme H's `sessions-live-terminal.spec.ts`
// (one test): the Sessions manager's live pane (`live-session-terminal.tsx`)
// attaches a REAL `@xterm/xterm` instance to an already-running pty — no
// WebGL/Canvas addon, so xterm v6's own DOM renderer is what's under test —
// and only a real browser can prove a click focuses it, a real keystroke
// round-trips through `sendInput` → the mock pty → `pty:data`, and the
// result lands as actual DOM text. `live-session-terminal.test.tsx` already
// covers the component's wiring (mount/unmount, which store calls fire, the
// mutual-exclusion claim) against a fake `Terminal`; this is the one place
// that needed the genuine thing.
// Raised 441 -> 445 for Phase 92 Theme E's Play-button fork, one case per
// surface plus one for each surface's "skill already set" branch
// (`kanban.spec.ts`, `project-graph.spec.ts`; two tests each): the fork
// (Theme D) opens a real pointer-anchored `ContextMenu` through
// `useDialogs().openMenu` — a portal rendered at a real click coordinate, not
// a jsdom synthetic click — and a picked entry's launch is only observable
// through the real pty bridge (`initialInput` on `pty:create`), which
// `use-card-play.test.tsx`'s isolated hook render cannot prove reaches the
// assembled `DialogHost`/`TerminalPanel` tree at all. Everything about which
// three entries the menu offers, what each composes, and that a pick both
// launches and persists is already covered under vitest in
// `use-card-play.test.tsx`; these four prove the same fork survives contact
// with the real board and graph surfaces it is mounted on.
// Raised 445 -> 446 for Phase 76 Theme D's `privacy-network.spec.ts` (one
// test): the phase acceptance criterion is zero third-party network requests
// on a fresh profile before the user sets a location or flips the IP switch —
// only a real `page.on('request')` over a full page load can observe that;
// vitest cannot intercept renderer network at all.
// Raised 446 -> 448 for Phase 76 Theme C's `csp.spec.ts` (two tests): CSP
// enforcement and the external-link contract need real `securitypolicyviolation`
// events and a live document URL — vitest cannot supply either.
// Raised 448 -> 449 for Phase 90 Theme K's `onboarding-wizard.spec.ts` (now
// `setup-overlay.spec.ts`, rewritten in place by Phase 98 Theme A; still one
// test): `OnboardingModal` and `FirstRunModal` are both fixed full-screen
// overlays that mount simultaneously on a fresh profile, and which one is
// interactive depends on real DOM paint order plus two independent
// `useFocusTrap` instances — neither is observable under jsdom. Every other
// onboarding behaviour (step content, the skip-records-itself store
// transition) already has its own vitest coverage.
// Raised 449 -> 454 for Phase 95 Theme G's drag-to-skill (`kanban.spec.ts`,
// five new cases): `decideColumnSkillAction`'s own decision logic (unmapped/
// mapped/existing-session/draft, and the "In review" PR-fallback flag) is
// already a full vitest suite in `board-derive.test.ts` — what only the
// assembled app can show is a real pointer drag reaching the real
// `DndContext`, the real Undo toast landing at the right text, and the real
// 5s timer either cancelling (Undo, reverted) or reaching `startAgent` with
// `autoSend: true` (the trailing `\r` on `pty:create`'s own `initialInput`).
// One case per: Undo cancels and reverts; the timer elapses and launches,
// sent not typed; an existing live session reveals instead of double-
// launching; an unmapped column stays plain. The fifth is the card's own
// `>_` toggle (the Start/Stop/`>_` split this theme also makes) hiding and
// re-showing its embedded terminal — `IntersectionObserver`-driven mount
// policy that `task-card.test.tsx`'s jsdom suite already documents it cannot
// observe for the identical reason (see that file's own "the in-card
// terminal" describe block).
// Raised 454 -> 456 for Phase 95 Theme I's workflow editor port onto React
// Flow (`workflows.spec.ts`, two tests, exactly the phase doc's own named
// exception — "e2e only for drag-from-palette and panel-resize"): a real
// HTML5 drag-and-drop gesture from `NodePalette`'s `draggable` row through
// `WorkflowCanvas`'s `onDrop`/`screenToFlowPosition`, and a real pointer drag
// on `useResizable`'s handle reading actual `getBoundingClientRect()`/
// `clientX` values (always `{0,0,0,0}`/0 under jsdom — the same reason
// `nav-shell.spec.ts`'s overflow-row case above needed the browser).
// Everything else about the port — node kinds, palette search/filter, the
// bottom run panel's tabs, dagre layout, the position-migration adapter —
// has its own vitest coverage; `workflows.spec.ts`'s pre-existing cases were
// only adapted to the new DOM, not multiplied.
// Raised 456 -> 457 for Phase 98 Theme C's `setup-fab-handoff.spec.ts` (one
// test): the arrow the setup overlay leaves after Skip is placed from the
// FAB's live `getBoundingClientRect()` — all zeros under jsdom — and the
// claim is that it lands aimed at the real FAB in the assembled app, then
// clears out so that FAB can be clicked to resume. The handoff's phases, the
// hidden-FAB wording and the resume-page rule are all vitest.
// Raised 457 -> 458 for the ad hoc Workflows canvas styling pass
// (`workflows.spec.ts`, one test): collapsing a side panel keeps the graph
// still on screen, which the canvas does by shifting React Flow's viewport by
// its container's measured left-edge movement — real layout and
// `getBoundingClientRect()`, zeros under jsdom. The toggles, the zero-width
// state and the inspector's auto-collapse/Escape rules are all vitest.
// Raised 458 -> 459 for the graph's CI column (`graph-ci-column.spec.ts`, 1
// test): the claim is that a branch's connector line runs UNDER the CI mark,
// unbroken from the ref chip to the lane gutter, and that the mark paints on
// top — real `getBoundingClientRect` geometry across three elements and a real
// `elementFromPoint` stacking check, neither of which jsdom lays out. The DOM
// structure, aggregation, batching and modal behaviour are all vitest.
// Raised 459 -> 461 for the git graph's inline expand-in-place panels
// (`graph-inline-panels.spec.ts`, two tests): the panel's height animates
// through the Web Animations API (absent from jsdom), the virtualizer's
// variable-height slot is only as right as the geometry it measures, and the
// lanes running under the card line up with the next row's only in real
// layout. One test covers the open/close animation, the rows following it
// and the lane alignment; the other a far scroll away and back keeping the
// expansion settled. Which panel is open, Escape, commit-from-panel and the
// shared working-tree parts in both hosts are all vitest.
// Raised 461 -> 463 for Media ▸ Images (`media-images.spec.ts`, Phase 99
// Theme C, two tests): CSS `columns` masonry only flows into columns under
// real layout, the lightbox's fixed overlay is checked against the real
// viewport, and the "+" tile's hover glow is a computed `box-shadow` /
// `-webkit-text-stroke` jsdom never resolves. Stepping, wrap-around, Escape,
// the reducer, catalogue and sidecar parsing are all vitest.
// Lowered 463 -> 461 with the standalone Changes view: its workbench tab
// strip's two specs ("the all-changes tab carries its own totals in the tab
// bar", "the working-tree tab cannot be closed") went with it.
//
// Raised 461 -> 462 for `terminal-dock.spec.ts` (1 test): a right-docked
// terminal is a layout claim (the frame's `getBoundingClientRect` sits beside
// the view, and a real pointer drag on its left-edge handle resizes it), which
// jsdom cannot measure. The store and button logic are vitest.
//
// Raised 462 -> 464 for `content-modal-bounds.spec.ts` (2 tests): a content-scoped
// dialog must sit inside the view box, clear of the terminal frame, and win
// `elementFromPoint` over it. That is real layout and hit-testing; the bounds
// maths and the Modal scope prop are vitest.
//
// Raised 464 -> 466 for `diff-header-alignment.spec.ts` (2 tests): header bars
// across the divider of the working-copy panel and the commit split layout must
// share top/height/bottom, which is only measurable with real layout
// (getBoundingClientRect) — jsdom has none.
// Raised 466 -> 469 for Media ▸ Models' `model-editor.spec.ts` (3 tests): the
// 3D editor is a react-three-fiber WebGL canvas, which jsdom cannot create at
// all. The tests prove what only a real browser can — pixels that change with
// selection and view mode, a real pointer click ray-cast against the meshes,
// and a real drag orbiting the camera. Reducer, undo/redo, the inspector and
// the save/export bridge calls are all vitest.
//
// Raised 469 -> 470 for the Finance dashboard's `finance-dashboard.spec.ts` (1
// test): a card resized by a real pointer drag on its react-grid-layout handle
// (real getBoundingClientRect, real pointer capture), the new footprint landing
// in the persisted board, and the Insights button's hover fill — a CSS ::before
// opacity that only a real style engine computes. Every other Finance
// behaviour (cards, portfolio rules, sorting, summary, modals) is vitest.
//
// Raised 470 -> 472 for the Chats page's `chats-layout.spec.ts` (2 tests): the composer's centring and
// pinning (real getBoundingClientRect, and "the document itself never scrolls") and the thread's
// stick-to-bottom behaviour against real scrollHeight/clientHeight and a real wheel, all of which
// jsdom reports as 0. The scroll decisions are vitest against faked geometry; everything else on the
// page (filters, streaming, markdown, Stop, the review card and modal) is vitest too.
//
// Raised 472 -> 474 for `diff-blank-rows.spec.ts` (2 tests): a diff virtualizer's window offset only
// goes wrong against real layout and a real scroll (elementFromPoint down the scroller after each
// scroll step, collapse and file switch); jsdom has no geometry, so the vitest twin only proves rows mount.
//
// Raised 474 -> 475 for Media > Models' `model-explorer.spec.ts` (1 test): the explorer's drag-and-drop
// move rides a native DataTransfer drag, which jsdom cannot fire; everything else is vitest.
//
// Raised 475 -> 476 for Media > Sprites' `sprite-render.spec.ts` (1 test, Phase 106 Theme E): rendering a
// rigged model into sprite frames needs real WebGL and OffscreenCanvas, which jsdom has neither of; the
// camera maths, clip sampling and the main-side render relay are all vitest.
// Raised 476 -> 478 for Phase 101 Theme E's `piano-roll.spec.ts` (2 tests): drawing, moving, resizing and
// deleting notes by real pointer drag on the piano roll's canvas, which has no DOM to hit-test in jsdom. The edit
// maths, history, keymap and track controls all have vitest suites.
//
// Raised 478 -> 479 for Phase 112 Theme C's `reveal-commit.spec.ts` (1 test): revealing a commit 450 rows
// down must scroll the virtualizer for real and land the row inside the scroller's box, which needs layout
// (`getBoundingClientRect`); jsdom has none. The store transitions around it are vitest.
// Raised 479 -> 480 for Phase 112 Theme H's one companion-panel spec: typing "open my chat about auth"
// with two seeded matches posts real numbered chips in the panel, and "two" opens the second chat in a
// real Chats view across a view switch — the chip bar's layout and the focus staying in the input are
// browser behaviour. Chip resolution, expiry and replacement are `handoff-resource.test.ts` (vitest).
// Raised 480 -> 482 for Phase 84 Themes E.6 and K.7 (one test each): counting the xterms a real terminal
// panel mounts with ten sessions open, and reading a cascade's end time off the browser's own animation
// timeline (`getAnimations`), both need a real browser. The policy and the cascade arithmetic are vitest.
//
// Raised 482 -> 483 for Phase 125 Themes A–C's `animations-shots.spec.ts` (1 test): the Animations
// tab's filters, list and detail are three flex panes, and jsdom reports every box as 0×0. The RTL
// suite stubs `MediaLayout` into stacked divs, so only a real `getBoundingClientRect` shows the panes
// side by side, and the three review screenshots are of that shell. Search, tag maths, rename and
// import are vitest (`animation-model.test.ts`, `animation-tab.test.tsx`).
// Raised 483 -> 486 for Phase 130 Theme G's `suite-shell/startup.spec.ts` (3 tests): the roadmap timeline's
// dependency arrows must land on their bars' edges, which only a real `getBoundingClientRect` over an SVG with
// `preserveAspectRatio="none"` can show, and the first-run form and the Overview, Runway and invoice-draft shots
// are of the real layout.
//
// Lowered 486 -> 483 for Phase 116 Theme E, to the count after Theme C deleted the five
// `*-shots.spec.ts` files that had crept back. The phase's <= 200 target waits on Theme C's
// Vitest migration waves, which need Playwright runs; each one lowers this number.
//
// Raised 483 -> 485 for Phase 115 Theme A's two `privacy-network.spec.ts` tests: with the master "Turn off
// all automatic network" on, an idle dashboard must put no request on the wire, and a control with it off
// must see the forecast request go out. Both read the browser's own request stream (`page.on('request')`)
// over a real page load; nothing in jsdom issues or intercepts a real network request.
export const MAX_DECLARED_E2E = 485;

// Visual baselines are capped by `visual-budget.mjs` (100 PNGs / 3 MB), not
// here. Phase 90 Theme L's `e2e/visual/account-switcher.spec.ts` adds four
// (10 -> 14): the open menu at titlebar-right, the closed switcher at
// titlebar-left and rail-bottom, and the zero-account placeholder. Its
// `account-switcher-shots.spec.ts` is PR-body screenshots only and, like
// every `-shots.spec.ts`, is not counted.

/**
 * @typedef {{ ok: boolean, message: string }} CheckResult
 * @typedef {{ file: string, line: number, lineContent: string }} TimingViolation
 * @typedef {{ file: string, line: number, lineContent: string }} SpecViolation
 */

/**
 * Pure check: verifies declared functional tests, visual baseline corpus, and
 * absence of wall-clock timing bounds in unit tests.
 *
 * @param {{
 *   declaredCount: number;
 *   visualSizes?: number[];
 *   unitTimingViolations?: TimingViolation[];
 *   diskScreenshotViolations?: SpecViolation[];
 *   orphanedScreenshots?: string[];
 *   timeoutViolations?: SpecViolation[];
 * }} input
 * @param {{
 *   maxDeclaredE2e?: number;
 *   maxBaselines?: number;
 *   maxVisualBytes?: number;
 * }} [limits]
 * @returns {CheckResult}
 */
export function checkE2eBudget(input, limits = {}) {
  const maxDeclared = limits.maxDeclaredE2e ?? MAX_DECLARED_E2E;
  const issues = [];

  if (input.declaredCount > maxDeclared) {
    issues.push(
      `  ${input.declaredCount} functional E2E tests declared, over the committed ratchet cap of ${maxDeclared}.` +
        ` A new test belongs in Vitest unless it requires a real browser capability (see docs/TESTING.md).` +
        ` Raising this ratchet cap requires a committed justification.`,
    );
  }

  if (input.visualSizes !== undefined) {
    const visualResult = checkVisualBudget(input.visualSizes, {
      maxCount: limits.maxBaselines ?? MAX_BASELINES,
      maxTotalBytes: limits.maxVisualBytes ?? MAX_TOTAL_BYTES,
    });
    if (!visualResult.ok) {
      issues.push(visualResult.message);
    }
  }

  if (input.unitTimingViolations && input.unitTimingViolations.length > 0) {
    issues.push(
      `  Found ${input.unitTimingViolations.length} wall-clock duration assertion(s) in unit tests:` +
        '\n' +
        input.unitTimingViolations
          .map((v) => `    ${v.file}:${v.line} -> ${v.lineContent.trim()}`)
          .join('\n') +
        `\n  Unit tests must not assert wall-clock durations (e.g. expect(elapsed).toBeLessThan(...)).` +
        ` Use vi.useFakeTimers() or event-driven polling instead (see docs/TESTING.md).`,
    );
  }

  if (input.diskScreenshotViolations && input.diskScreenshotViolations.length > 0) {
    issues.push(
      `  Found ${input.diskScreenshotViolations.length} disk screenshot(s) in functional E2E:` +
        '\n' +
        input.diskScreenshotViolations
          .map((v) => `    ${v.file}${v.line ? `:${v.line}` : ''} -> ${v.lineContent.trim()}`)
          .join('\n') +
        `\n  Functional specs assert; they never write images. PR shots go in the session scratchpad,` +
        ` and appearance belongs to \`app:visual\` (see docs/TESTING.md).`,
    );
  }

  if (input.orphanedScreenshots && input.orphanedScreenshots.length > 0) {
    const shown = input.orphanedScreenshots.slice(0, 20).map((f) => `    ${f}`);
    const more = input.orphanedScreenshots.length - shown.length;
    issues.push(
      `  Found ${input.orphanedScreenshots.length} image(s) under docs/screenshots/ that nothing references:` +
        '\n' +
        shown.join('\n') +
        (more > 0 ? `\n    ...and ${more} more` : '') +
        `\n  Reference each from README.md, docs/*.md or packages/website/, or delete it.`,
    );
  }

  if (input.timeoutViolations && input.timeoutViolations.length > 0) {
    issues.push(
      `  Found ${input.timeoutViolations.length} un-allowlisted waitForTimeout call(s) in functional E2E:` +
        '\n' +
        input.timeoutViolations
          .map((v) => `    ${v.file}:${v.line} -> ${v.lineContent.trim()}`)
          .join('\n') +
        `\n  Use a web-first assertion (expect.poll / expect(locator)...), call settle(page) from shots-helper,` +
        ` or justify a deliberate sleep with an \`// allow-timeout: <reason>\` comment.`,
    );
  }

  if (issues.length > 0) {
    return {
      ok: false,
      message: ['e2e-budget FAILED: testing budget or invariants breached.', ...issues].join('\n'),
    };
  }

  const visualMsg =
    input.visualSizes !== undefined
      ? `, visual: ${input.visualSizes.length} baseline(s)`
      : '';
  return {
    ok: true,
    message: `e2e-budget OK: ${input.declaredCount} declared E2E test(s) (cap: ${maxDeclared}${visualMsg}).`,
  };
}

/**
 * Collect declared functional E2E tests by querying Playwright's test list.
 *
 * @param {string} root
 * @returns {number}
 */
export function collectDeclaredE2eCount(root = repoRoot) {
  const pwBinary = path.join(root, 'packages/app/node_modules/.bin/playwright');
  const configPath = path.join(root, 'packages/app/playwright.config.ts');

  try {
    const stdout = execFileSync(
      pwBinary,
      ['test', '--list', '--reporter=json', '--config', configPath],
      {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const parsed = JSON.parse(stdout);
    if (parsed.stats && typeof parsed.stats.skipped === 'number' && parsed.stats.skipped > 0) {
      return parsed.stats.skipped;
    }

    let count = 0;
    function walk(suite) {
      if (suite.specs) count += suite.specs.length;
      for (const s of suite.suites || []) walk(s);
    }
    for (const s of parsed.suites || []) walk(s);
    return count;
  } catch (err) {
    // If the binary failed, log a warning and fall back to spec inspection
    console.warn(`e2e-budget: Playwright --list failed (${err.message}), falling back to spec parse`);
    return fallbackDeclaredCount(root);
  }
}

/**
 * Fallback parser when Playwright binary cannot be executed directly.
 * @param {string} root
 * @returns {Promise<number>}
 */
async function fallbackDeclaredCount(root) {
  const e2eDir = path.join(root, 'packages/app/e2e');
  let count = 0;
  const entries = await readdir(e2eDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.spec.ts') || entry.name.endsWith('-shots.spec.ts')) {
      continue;
    }
    const content = await readFile(path.join(e2eDir, entry.name), 'utf8');
    const matches = content.match(/(?:^|[^a-zA-Z0-9_.])test(?:\.(?:skip|only|fixme))?\s*\(/g) || [];
    count += matches.length;
  }
  return count;
}

const TIMING_ASSERTION_RE =
  /expect\s*\(\s*(?:elapsed|duration|latency|took|diff|delta|timeTaken|Date\.now\(\)\s*-\s*\w+|performance\.now\(\)\s*-\s*\w+)\s*\)\s*\.toBeLessThan/i;

/**
 * Scan unit tests across packages for wall-clock timing assertions.
 *
 * @param {string} root
 * @returns {Promise<TimingViolation[]>}
 */
export async function collectUnitTimingViolations(root = repoRoot) {
  /** @type {TimingViolation[]} */
  const violations = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'e2e') {
          continue;
        }
        await walk(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))
      ) {
        const content = await readFile(fullPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (TIMING_ASSERTION_RE.test(line)) {
            violations.push({
              file: path.relative(root, fullPath),
              line: i + 1,
              lineContent: line,
            });
          }
        }
      }
    }
  }

  await walk(path.join(root, 'packages'));
  return violations;
}

const E2E_DIR = 'packages/app/e2e';
const SCREENSHOT_PATH_RE = /\.screenshot\(\s*(?:\{[^}]*\bpath\s*:|['"`])/;
const ALLOW_TIMEOUT_RE = /allow-timeout\s*:\s*\S/;

/**
 * Pure: scan one functional spec's source for disk screenshots and un-allowlisted sleeps.
 *
 * @param {string} file repo-relative path, reported in violations
 * @param {string} content
 * @returns {{ disk: SpecViolation[], timeouts: SpecViolation[] }}
 */
export function scanSpecSource(file, content) {
  const disk = [];
  const timeouts = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SCREENSHOT_PATH_RE.test(line)) {
      disk.push({ file, line: i + 1, lineContent: line });
    }
    if (/\bwaitForTimeout\s*\(/.test(line) && !line.trim().startsWith('//')) {
      const allowed = ALLOW_TIMEOUT_RE.test(line) || (i > 0 && ALLOW_TIMEOUT_RE.test(lines[i - 1]));
      if (!allowed) timeouts.push({ file, line: i + 1, lineContent: line });
    }
  }
  return { disk, timeouts };
}

/**
 * Scan `packages/app/e2e/*.spec.ts` (shots specs included, so a reintroduced one fails twice over).
 *
 * @param {string} root
 */
export async function collectSpecViolations(root = repoRoot) {
  const dir = path.join(root, E2E_DIR);
  /** @type {SpecViolation[]} */
  const disk = [];
  /** @type {SpecViolation[]} */
  const timeouts = [];
  // Functional specs live at the top level and in feature folders (e.g. `suite-shell/`). `visual/` is
  // the screenshot-comparison layer and `perf/` measures wall-clock by design, so both are exempt.
  const files = (await listFiles(dir, new Set(['node_modules', 'dist', 'visual', 'perf', '__screenshots__']))).filter(
    (f) => f.endsWith('.spec.ts'),
  );
  for (const full of files) {
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (full.endsWith('-shots.spec.ts')) {
      disk.push({ file: rel, line: 0, lineContent: '*-shots.spec.ts files are retired' });
    }
    const found = scanSpecSource(rel, await readFile(full, 'utf8'));
    disk.push(...found.disk);
    timeouts.push(...found.timeouts);
  }
  return { disk, timeouts };
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const TEXT_RE = /\.(md|mdx|ts|tsx|js|jsx|mjs|html|css|json)$/i;

/** @param {string} dir @param {Set<string>} [skip] directory names to skip @returns {Promise<string[]>} absolute file paths, recursively */
async function listFiles(dir, skip = new Set(['node_modules', 'dist'])) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      out.push(...(await listFiles(full, skip)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Pure: an image is referenced when some doc text mentions `screenshots/<its path under docs/screenshots>`.
 *
 * @param {string[]} images paths relative to docs/screenshots, forward slashes
 * @param {string} corpus concatenated text of every referencing file
 * @returns {string[]} the unreferenced images
 */
export function findOrphans(images, corpus) {
  return images.filter((rel) => !corpus.includes(`screenshots/${rel}`));
}

/** @param {string} root */
export async function collectOrphanedScreenshots(root = repoRoot) {
  const base = path.join(root, 'docs/screenshots');
  const images = (await listFiles(base))
    .filter((f) => IMAGE_RE.test(f))
    .map((f) => path.relative(base, f).split(path.sep).join('/'));
  if (images.length === 0) return [];
  const docFiles = (await readdir(path.join(root, 'docs'), { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(root, 'docs', e.name));
  const sources = [path.join(root, 'README.md'), ...docFiles, ...(await listFiles(path.join(root, 'packages/website')))].filter(
    (f) => TEXT_RE.test(f),
  );
  const chunks = [];
  for (const f of sources) {
    try {
      chunks.push(await readFile(f, 'utf8'));
    } catch {
      /* a missing README is not an orphan */
    }
  }
  return findOrphans(images, chunks.join('\n')).map((rel) => `docs/screenshots/${rel}`);
}

async function main() {
  const declaredCount = await collectDeclaredE2eCount(repoRoot);
  const visualSizes = await collectPngSizes(VISUAL_SCREENSHOTS_DIR);
  const timingViolations = await collectUnitTimingViolations(repoRoot);

  const specViolations = await collectSpecViolations(repoRoot);
  const orphanedScreenshots = await collectOrphanedScreenshots(repoRoot);

  const result = checkE2eBudget({
    declaredCount,
    visualSizes,
    unitTimingViolations: timingViolations,
    diskScreenshotViolations: specViolations.disk,
    orphanedScreenshots,
    timeoutViolations: specViolations.timeouts,
  });

  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`e2e-budget errored: ${err.message}`);
    process.exit(1);
  });
}
