#!/usr/bin/env node
// gate-projects-check: assert every packages/* directory is claimed by exactly
// one of the two split `gate` jobs in .github/workflows/ci.yml (Phase 82 Theme
// E) — `gate-node` (ubuntu-24.04, 1x billing) or `gate-native` (macos-14, 10x
// billing, reserved for the two packages that genuinely need it: git-engine's
// bundled dugite and desktop's node-pty).
//
// Before the split, `moon run :typecheck :lint :test` walked every project
// automatically — a new packages/<x> directory was covered for free. The split
// replaces that with two explicit target lists in ci.yml, and an explicit list
// does not grow itself: a new package lands in neither job's target list unless
// someone remembers to add it, and the failure mode is silent (moon happily
// runs the targets it was given; it has no opinion on what was left out). This
// script is that opinion — it reads packages/* off disk, the same way
// version-check.mjs does, and fails loudly if the two hardcoded lists below
// stop covering that set exactly.
//
// Self-contained on purpose, no @midnite/* imports, so it runs before any
// build — same rationale as version-check.mjs and tracker-check.mjs.

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep these two arrays the source of truth for what each `.github/workflows/ci.yml`
// gate job actually runs. If you add a target to one of the jobs' moon
// invocations, add its project id here too — that symmetry is what this script
// checks.
export const NODE_PROJECTS = ['shared', 'app', 'website', 'db-engine'];
export const NATIVE_PROJECTS = ['git-engine', 'desktop'];

/**
 * @typedef {{ ok: boolean, message: string }} CheckResult
 */

/**
 * Pure check: every id in `discovered` must appear in exactly one of
 * `nodeProjects` / `nativeProjects`, and every id named in those two lists
 * must actually exist in `discovered` (catches a typo or a removed package
 * left stale in the list). No fs, so this is testable without touching disk.
 *
 * @param {string[]} discovered — packages/* directory names that are workspace packages
 * @param {string[]} nodeProjects
 * @param {string[]} nativeProjects
 * @returns {CheckResult}
 */
export function checkGateCoverage(discovered, nodeProjects, nativeProjects) {
  const issues = [];
  const nodeSet = new Set(nodeProjects);
  const nativeSet = new Set(nativeProjects);

  const overlap = nodeProjects.filter((p) => nativeSet.has(p));
  if (overlap.length > 0) {
    issues.push(
      `  ${overlap.join(', ')}: claimed by BOTH gate-node and gate-native — a project runs its suite twice, on two runners.`,
    );
  }

  for (const id of discovered) {
    const inNode = nodeSet.has(id);
    const inNative = nativeSet.has(id);
    if (!inNode && !inNative) {
      issues.push(
        `  ${id}: in packages/ but not in NODE_PROJECTS or NATIVE_PROJECTS (scripts/gate-projects-check.mjs) — ` +
          `add it to whichever of gate-node/gate-native it belongs on in .github/workflows/ci.yml, and to the matching list here.`,
      );
    }
  }

  const discoveredSet = new Set(discovered);
  for (const id of [...nodeProjects, ...nativeProjects]) {
    if (!discoveredSet.has(id)) {
      issues.push(
        `  ${id}: listed in scripts/gate-projects-check.mjs but no packages/${id} directory exists — stale entry, or a typo.`,
      );
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      message: ['gate-projects-check FAILED: the gate-node/gate-native split does not cover every package.', ...issues].join(
        '\n',
      ),
    };
  }

  return {
    ok: true,
    message: `gate-projects-check OK: ${discovered.length} package(s) covered exactly once (${nodeProjects.length} gate-node, ${nativeProjects.length} gate-native).`,
  };
}

async function main() {
  const packagesDir = path.join(repoRoot, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const discovered = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const result = checkGateCoverage(discovered, NODE_PROJECTS, NATIVE_PROJECTS);
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exitCode = 1;
  }
}

// Run only when invoked directly, so tests can import checkGateCoverage without
// executing the checker (which would read the repo and set exit codes).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`gate-projects-check errored: ${err.message}`);
    process.exit(1);
  });
}
