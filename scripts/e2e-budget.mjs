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
// This script enforces three invariants in the gate:
// - Functional E2E test ratchet: declared functional tests must not exceed the
//   committed ratchet cap (currently 433). Lowering this cap is a deliberate commit
//   as tests migrate to Vitest; raising it requires an explicit sentence in the
//   commit message explaining why the test cannot run in Vitest or visual regression.
// - Visual baseline budget: baselines must remain under the 100 PNG / 3 MB cap
//   (delegated to `checkVisualBudget` from `visual-budget.mjs`).
// - Timing flake prevention: unit tests must never assert wall-clock duration bounds
//   (`expect(elapsed).toBeLessThan(...)`), which flakes under CI thread contention.

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
// Raised 438 -> 439 for the apps switcher's reveal (`apps-rail-reveal.spec.ts`,
// one test): the switcher's hover region is nested inside `AppFrame`'s own
// hover-expanding rail, so the two hover surfaces overlap and only a real
// pointer can show the composed result — a `page.mouse.move` to a coordinate
// outside the group collapsing it back, and a real `hover()` landing on the
// group rather than being swallowed by the rail around it. jsdom has no
// pointer; it can only be told `mouseenter` fired. Everything else about the
// feature — which icons render for a given `lastOpenedAppId`, when the labels
// appear, the store transitions that set it, the disabled-app fallback — is in
// `apps-rail-row.test.tsx` under vitest, which is why this is one test.
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
export const MAX_DECLARED_E2E = 441;

/**
 * @typedef {{ ok: boolean, message: string }} CheckResult
 * @typedef {{ file: string, line: number, lineContent: string }} TimingViolation
 */

/**
 * Pure check: verifies declared functional tests, visual baseline corpus, and
 * absence of wall-clock timing bounds in unit tests.
 *
 * @param {{
 *   declaredCount: number;
 *   visualSizes?: number[];
 *   unitTimingViolations?: TimingViolation[];
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
        env: {
          ...process.env,
          // Ensure MSTUDIO_SHOTS is unset so screenshot-only specs are skipped/ignored
          MSTUDIO_SHOTS: '',
        },
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

async function main() {
  const declaredCount = collectDeclaredE2eCount(repoRoot);
  const visualSizes = await collectPngSizes(VISUAL_SCREENSHOTS_DIR);
  const timingViolations = await collectUnitTimingViolations(repoRoot);

  const result = checkE2eBudget({
    declaredCount,
    visualSizes,
    unitTimingViolations: timingViolations,
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
