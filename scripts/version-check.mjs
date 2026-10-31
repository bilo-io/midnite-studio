#!/usr/bin/env node
// version-check: assert the lockstep invariant — the root package.json and every
// packages/*/package.json and apps/*/package.json share one MAJOR.MINOR (PATCH may differ per package).
// A hand-edit that breaks lockstep fails CI here with a clear, named message.
//
// Self-contained on purpose: no @midnite/* imports. It runs in `moon ci` before
// (and independently of) any build, so it must not depend on built output. The
// bump *math* the two /midnite-release-* skills use lives in
// packages/shared/src/version.ts; this script is just the repo-wide invariant
// guard. Keep the two in agreement.
//
// The CLI wrapper (packages/desktop/resources/bin/midnite) is
// deliberately NOT in the file list below — Phase 53 Theme B made it *derive*
// its version from the bundle it ships inside rather than adding a sixth
// hand-written site for this script to remember to check.

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {{ name: string, version: string | null }} PackageVersion
 */

/**
 * Read the `name` + `version` out of a package.json. Never throws: an
 * unreadable file or a missing/non-string "version" field comes back as
 * `version: null` so the caller can report it as a lockstep failure rather
 * than silently dropping the package from the check.
 *
 * @param {string} pkgPath
 * @param {string} fallbackName used when the file has no "name" field (or can't be read)
 * @returns {Promise<PackageVersion>}
 */
export async function readPackageVersion(pkgPath, fallbackName) {
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const json = JSON.parse(raw);
    const name = typeof json.name === 'string' ? json.name : fallbackName;
    return { name, version: typeof json.version === 'string' ? json.version : null };
  } catch {
    return { name: fallbackName, version: null };
  }
}

/**
 * Assert every package shares one MAJOR.MINOR (PATCH may diverge).
 *
 * The comparison is a **grouping, not a pairwise equality**: every package is
 * bucketed by its MAJOR.MINOR prefix, and lockstep means exactly one bucket
 * exists. A missing/invalid version is reported as its own named failure
 * rather than silently excluded from the grouping — a package.json that
 * failed to read is not "in lockstep by omission".
 *
 * Pure — no fs, no process — so this is testable without touching disk.
 *
 * @param {PackageVersion[]} packages
 * @returns {{ ok: boolean, message: string }}
 */
export function checkLockstep(packages) {
  const issues = [];
  /** @type {Map<string, PackageVersion[]>} */
  const groups = new Map();

  for (const pkg of packages) {
    if (typeof pkg.version !== 'string') {
      issues.push(`  ${pkg.name}: missing or unreadable "version" field`);
      continue;
    }
    const parts = pkg.version.split('.');
    if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
      issues.push(`  ${pkg.name}: invalid version "${pkg.version}" (expected MAJOR.MINOR.PATCH)`);
      continue;
    }
    const prefix = `${parts[0]}.${parts[1]}`;
    const bucket = groups.get(prefix) ?? [];
    bucket.push(pkg);
    groups.set(prefix, bucket);
  }

  if (groups.size > 1) {
    // The bucket backing the most packages is the presumed intended one —
    // named so the divergent buckets read as the odd ones out.
    let expected = null;
    let expectedCount = -1;
    for (const [prefix, pkgs] of groups) {
      if (pkgs.length > expectedCount) {
        expected = prefix;
        expectedCount = pkgs.length;
      }
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [prefix, pkgs] of sorted) {
      const tag = prefix === expected ? '' : '  <-- diverges';
      issues.push(`  ${prefix}.x: ${pkgs.map((p) => `${p.name}@${p.version}`).join(', ')}${tag}`);
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      message: [
        'version-check FAILED: packages do not share one MAJOR.MINOR (lockstep broken).',
        ...issues,
      ].join('\n'),
    };
  }

  const [onlyPrefix] = groups.keys();
  return {
    ok: true,
    message: `version-check OK: ${packages.length} package(s) in lockstep at ${onlyPrefix ?? 'n/a'}.x`,
  };
}

/**
 * Every versioned workspace package: the root, `packages/*` and (Phase 113 Theme E item 4)
 * `apps/*` — the launcher and every suite app are lockstep with the runtime too.
 *
 * A directory with no package.json AT ALL is not a workspace package and is not in lockstep
 * with anything (`packages/website/` was once just an asset folder); a package.json that exists
 * but has no "version" is still a failure, which is why this filters on the file's existence
 * rather than on `readPackageVersion` coming back null.
 *
 * @param {string} root
 * @returns {Promise<PackageVersion[]>}
 */
export async function collectWorkspaceVersions(root) {
  const candidates = [{ pkgPath: path.join(root, 'package.json'), fallbackName: 'package.json (root)' }];
  for (const group of ['packages', 'apps']) {
    const entries = await readdir(path.join(root, group), { withFileTypes: true }).catch(() => []);
    for (const e of entries.filter((d) => d.isDirectory())) {
      candidates.push({ pkgPath: path.join(root, group, e.name, 'package.json'), fallbackName: `${group}/${e.name}` });
    }
  }
  const present = await Promise.all(
    candidates.map((t) =>
      access(t.pkgPath).then(
        () => true,
        () => false,
      ),
    ),
  );
  return Promise.all(candidates.filter((_, i) => present[i]).map((t) => readPackageVersion(t.pkgPath, t.fallbackName)));
}

/**
 * Assert every release-shipped package sits on EXACTLY `expected`: the lockstep check above lets
 * PATCH diverge, but `catalog.json` is rejected by the launcher unless every app equals the
 * release's version, and a tag built from a branch that missed one bump would publish a
 * half-versioned release. Pure, like {@link checkLockstep}.
 *
 * @param {PackageVersion[]} packages
 * @param {string} expected `X.Y.Z`, no leading `v`
 * @returns {{ ok: boolean, message: string }}
 */
export function checkExactVersion(packages, expected) {
  const wrong = packages.filter((pkg) => pkg.version !== expected);
  if (wrong.length > 0) {
    return {
      ok: false,
      message: [
        `version-check FAILED: the release is ${expected} but these packages are not:`,
        ...wrong.map((pkg) => `  ${pkg.name}: ${pkg.version ?? 'missing or unreadable "version" field'}`),
      ].join('\n'),
    };
  }
  return { ok: true, message: `version-check OK: ${packages.length} release package(s) at exactly ${expected}.` };
}

/**
 * The packages a release ships as installables: the Electron runtime (`packages/desktop`) and every
 * `apps/*` (the launcher and each bundle).
 *
 * @param {string} root
 * @returns {Promise<PackageVersion[]>}
 */
export async function collectReleaseVersions(root) {
  const entries = await readdir(path.join(root, 'apps'), { withFileTypes: true }).catch(() => []);
  const candidates = [
    { pkgPath: path.join(root, 'packages', 'desktop', 'package.json'), fallbackName: 'packages/desktop' },
    ...entries
      .filter((d) => d.isDirectory())
      .map((d) => ({ pkgPath: path.join(root, 'apps', d.name, 'package.json'), fallbackName: `apps/${d.name}` })),
  ];
  const present = await Promise.all(
    candidates.map((t) =>
      access(t.pkgPath).then(
        () => true,
        () => false,
      ),
    ),
  );
  return Promise.all(candidates.filter((_, i) => present[i]).map((t) => readPackageVersion(t.pkgPath, t.fallbackName)));
}

/** `--expect X.Y.Z` (or `--expect=X.Y.Z`, a leading `v` tolerated) → `X.Y.Z`; `null` when absent. */
export function parseExpect(argv) {
  const at = argv.findIndex((a) => a === '--expect' || a.startsWith('--expect='));
  if (at === -1) return null;
  const raw = argv[at].includes('=') ? argv[at].split('=')[1] : argv[at + 1];
  if (!raw) throw new Error('--expect needs a version');
  return raw.replace(/^v/, '');
}

async function main() {
  const packages = await collectWorkspaceVersions(repoRoot);

  const result = checkLockstep(packages);
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exitCode = 1;
  }

  // `--expect X.Y.Z` (release.yml's `meta` job): additionally require the release's own version
  // everywhere it ships, before anything is built or published.
  const expected = parseExpect(process.argv.slice(2));
  if (expected !== null) {
    const exact = checkExactVersion(await collectReleaseVersions(repoRoot), expected);
    if (exact.ok) {
      console.log(exact.message);
    } else {
      console.error(exact.message);
      process.exitCode = 1;
    }
  }
}

// Run only when invoked directly, so tests can import checkLockstep/readPackageVersion
// without executing the checker (which would read the repo and set exit codes).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`version-check errored: ${err.message}`);
    process.exit(1);
  });
}
