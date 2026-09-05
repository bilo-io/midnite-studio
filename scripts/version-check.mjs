#!/usr/bin/env node
// version-check: assert the lockstep invariant — the root package.json and every
// packages/*/package.json share one MAJOR.MINOR (PATCH may differ per package).
// A hand-edit that breaks lockstep fails CI here with a clear, named message.
//
// Self-contained on purpose: no @midnite/* imports. It runs in `moon ci` before
// (and independently of) any build, so it must not depend on built output. The
// bump *math* the two /midnite-release-* skills use lives in
// packages/shared/src/version.ts; this script is just the repo-wide invariant
// guard. Keep the two in agreement.
//
// The CLI wrapper (packages/desktop/resources/bin/midnite-studio) is
// deliberately NOT in the file list below — Phase 53 Theme B made it *derive*
// its version from the bundle it ships inside rather than adding a sixth
// hand-written site for this script to remember to check.

import { readFile, readdir } from 'node:fs/promises';
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

async function main() {
  const packagesDir = path.join(repoRoot, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });

  const targets = [
    { pkgPath: path.join(repoRoot, 'package.json'), fallbackName: 'package.json (root)' },
    ...entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        pkgPath: path.join(packagesDir, e.name, 'package.json'),
        fallbackName: `packages/${e.name}`,
      })),
  ];

  const packages = await Promise.all(
    targets.map((t) => readPackageVersion(t.pkgPath, t.fallbackName)),
  );

  const result = checkLockstep(packages);
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exitCode = 1;
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
