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
export const NODE_PROJECTS = ['shared', 'knowledge', 'app', 'website', 'db-engine', 'frame', 'feature-optimizer', 'feature-monitor', 'feature-vault', 'feature-notes', 'feature-finance', 'feature-media-core', 'feature-media-docs', 'feature-media-images', 'feature-media-library', 'feature-models', 'feature-councils', 'feature-chats', 'feature-media-audio', 'feature-media-video', 'feature-slides', 'feature-workflows', 'feature-mcp-tools', 'feature-tests', 'feature-forge', 'feature-media-map', 'feature-media-terrain', 'feature-media-sprite', 'feature-media-model', 'feature-media-game', 'feature-api-client', 'feature-database', 'feature-sessions', 'feature-tasks', 'feature-browser', 'feature-capture', 'feature-report', 'feature-vanguard', 'feature-forge-host', 'feature-terminal', 'module-vault', 'module-cleaner', 'module-monitor', 'module-capture', 'module-coder', 'module-creator', 'module-vanguard', 'module-money', 'module-media'];
// `runtime` (Phase 113 Theme C) is on gate-native ahead of need: it is the
// main-process layer Theme D moves the safeStorage vault and the pty broker
// into, and platform behaviour is only validated on the platform.
export const NATIVE_PROJECTS = ['git-engine', 'desktop', 'runtime'];

/**
 * @typedef {{ ok: boolean, message: string }} CheckResult
 */

/** Where project `id` lives on disk — the inverse of `discoverProjectIds`. */
export function projectDir(id) {
  if (id.startsWith('feature-')) return `packages/features/${id.slice('feature-'.length)}`;
  if (id.startsWith('module-')) return `packages/modules/${id.slice('module-'.length)}`;
  return `packages/${id}`;
}

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
        `  ${id}: listed in scripts/gate-projects-check.mjs but no ${projectDir(id)} directory exists — stale entry, or a typo.`,
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

/**
 * The folder under packages/ that holds feature packages rather than being one
 * (Phase 113 Theme C). `.moon/workspace.yml` globs `packages/features/*` and
 * negates `packages/features` itself; this mirrors that.
 */
export const FEATURES_DIR = 'features';

/** Same for `packages/modules` (Phase 124 Theme B): children are projects `module-<name>`. */
export const MODULES_DIR = 'modules';

/**
 * Map the directories found on disk to moon project ids, the same way
 * `.moon/workspace.yml` does: every `packages/<x>` is project `<x>`, except the
 * `packages/features` container, whose children `packages/features/<name>` are
 * projects `feature-<name>` (the id each feature's own moon.yml declares).
 * Pure, so the mapping is testable without a filesystem.
 *
 * @param {string[]} packageDirs — directory names directly under packages/
 * @param {string[]} featureDirs — directory names directly under packages/features/
 * @param {string[]} [moduleDirs] — directory names directly under packages/modules/ (`_`-prefixed templates skipped)
 * @returns {string[]}
 */
export function discoverProjectIds(packageDirs, featureDirs, moduleDirs = []) {
  return [
    ...packageDirs.filter((name) => name !== FEATURES_DIR && name !== MODULES_DIR),
    ...featureDirs.map((name) => `feature-${name}`),
    ...moduleDirs.filter((name) => !name.startsWith('_')).map((name) => `module-${name}`),
  ];
}

async function listDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function main() {
  const packagesDir = path.join(repoRoot, 'packages');
  const discovered = discoverProjectIds(
    await listDirs(packagesDir),
    await listDirs(path.join(packagesDir, FEATURES_DIR)),
    await listDirs(path.join(packagesDir, MODULES_DIR)),
  );

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
