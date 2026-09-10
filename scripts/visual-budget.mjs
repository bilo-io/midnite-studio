#!/usr/bin/env node
// visual-budget: cap the pixel-diff layer's committed baseline corpus at the
// size Phase 82 Theme D settled on — ~100 PNGs / ~3 MB — so it cannot regrow
// into the same problem `docs/screenshots/` already is (648 images / 66 MB in
// the working tree, roughly two-thirds of the repo's ~178 MB `.git`).
//
// Component-scoped `locator.screenshot()` crops keep each baseline small
// (~10-20 KB against a full page's ~100 KB), but nothing in
// `playwright.visual.config.ts` itself stops someone adding the 101st baseline,
// or a full-page one, six months from now with no reviewer left who remembers
// why the cap exists. This script is that memory, the same role
// `gate-projects-check.mjs` plays for the gate-node/gate-native split: a pure,
// testable check plus a thin disk-reading `main()`, wired into CI as its own
// step rather than folded into the `visual` job's own pass/fail (a budget
// breach and a real pixel regression are different failures with different
// fixes, and conflating them would make a CI log harder to read, not easier).
//
// Deliberately its own file rather than living inside `e2e-budget.mjs`
// (Phase 82 Theme F, not yet landed): Theme F's item explicitly asks for this
// shape — "keep it in its own script or a clearly separable function so
// Theme F can fold it in without a conflict" — because Theme D and Theme F
// are sibling PRs and a shared file would race. Theme F is free to import
// `checkVisualBudget` from here, or move this file's contents into its own
// budget script wholesale, once both have landed.
//
// Self-contained, no @midnite/* imports — same rationale as
// `gate-projects-check.mjs`/`version-check.mjs`: this has to run before any
// build, against nothing but the filesystem.

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The cap Phase 82 Theme D settled on (see the phase doc's own Deliverables §D
// and the file header above). Lowering it is a deliberate commit; raising it
// needs a sentence here explaining why — the same ratchet discipline
// `KNOWN_RED` used in Phase 38, and the one `e2e-budget.mjs` (Theme F) will
// apply to the functional suite's own declared-test count.
export const MAX_BASELINES = 100;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // 3 MB

export const VISUAL_SCREENSHOTS_DIR = path.join(
  repoRoot,
  'packages/app/e2e/visual/__screenshots__',
);

/**
 * @typedef {{ ok: boolean, message: string }} CheckResult
 */

/**
 * Pure check: given the byte size of every committed baseline PNG, assert the
 * corpus stays under both the count and total-size caps. No fs, so this is
 * testable without touching disk — same shape as `checkGateCoverage` in
 * `gate-projects-check.mjs`.
 *
 * @param {number[]} fileSizes — byte size of every `*.png` under the visual
 *   baselines directory, in any order.
 * @param {{ maxCount?: number, maxTotalBytes?: number }} [limits]
 * @returns {CheckResult}
 */
export function checkVisualBudget(fileSizes, limits = {}) {
  const maxCount = limits.maxCount ?? MAX_BASELINES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_TOTAL_BYTES;

  const count = fileSizes.length;
  const totalBytes = fileSizes.reduce((sum, size) => sum + size, 0);
  const issues = [];

  if (count > maxCount) {
    issues.push(
      `  ${count} baseline PNG(s) committed, over the cap of ${maxCount}. Either the new` +
        ` spec(s) are legitimate growth (raise MAX_BASELINES here with a sentence saying why) or` +
        ` this is the corpus quietly re-growing into the ${'docs/screenshots/'} problem the cap` +
        ` exists to prevent.`,
    );
  }

  if (totalBytes > maxTotalBytes) {
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
    const maxMb = (maxTotalBytes / (1024 * 1024)).toFixed(2);
    issues.push(
      `  ${totalMb} MB of baselines committed, over the cap of ${maxMb} MB. A full-page` +
        ` screenshot instead of a component crop is the usual cause — see` +
        ` playwright.visual.config.ts's own header comment on why every spec here must call` +
        ` .screenshot()/toHaveScreenshot() on a Locator, never on \`page\`.`,
    );
  }

  if (issues.length > 0) {
    return {
      ok: false,
      message: [
        'visual-budget FAILED: the pixel-diff baseline corpus is over its committed cap.',
        ...issues,
      ].join('\n'),
    };
  }

  return {
    ok: true,
    message: `visual-budget OK: ${count} baseline(s), ${(totalBytes / 1024).toFixed(1)} KB (caps: ${maxCount} / ${(maxTotalBytes / (1024 * 1024)).toFixed(0)} MB).`,
  };
}

/** Every `*.png` byte size under `dir`, recursively. Missing dir → empty array — a fresh checkout before the first baseline ever lands is not a failure. */
async function collectPngSizes(dir) {
  /** @type {number[]} */
  const sizes = [];

  /** @param {string} current */
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.png')) {
        const { size } = await stat(full);
        sizes.push(size);
      }
    }
  }

  await walk(dir);
  return sizes;
}

async function main() {
  const sizes = await collectPngSizes(VISUAL_SCREENSHOTS_DIR);
  const result = checkVisualBudget(sizes);
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exitCode = 1;
  }
}

// Run only when invoked directly, so tests can import checkVisualBudget
// without executing the checker (which would read the repo and set exit
// codes) — same guard `gate-projects-check.mjs` uses.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`visual-budget errored: ${err.message}`);
    process.exit(1);
  });
}
