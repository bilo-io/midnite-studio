import { basename, join, relative, sep } from 'node:path';

import type { TestPackage, TestSuite } from '@midnite/studio-shared';

import { classifySuite, isCandidateScript, type PresentConfigs } from './classify';
import { realTestsFs, safeJsonParse, type TestsFs } from './fs';
import {
  detectPackageManager,
  moonLocalTaskOverride,
  resolveWorkspacePackages,
  type PackageManager,
} from './workspace';

/**
 * Suite discovery: `package.json` scripts, a package's `moon.yml`, and the
 * presence of the four config files this build knows how to run — never
 * execution. Pure over an injected {@link TestsFs}, so this reads exactly like
 * `detect.ts`: electron-free, runs under bare vitest, and is safe to call for
 * any checkout at any time.
 *
 * This repository is its own best fixture: four `pnpm`-workspace packages,
 * each with a `moon.yml`, a `vitest.config.ts`, and `package.json` scripts
 * that are sometimes the same command moon would run anyway (`test`) and
 * sometimes not (git-engine's `smoke`, app's `e2e`, desktop's `bundle`).
 */

const toPosix = (p: string): string => p.split(sep).join('/');

/** Task names moon's `.moon/tasks/typescript.yml` inherits for every project. */
const MOON_INHERITED_TASKS = ['test', 'lint', 'typecheck'] as const;

async function presentConfigs(dir: string, fs: TestsFs): Promise<PresentConfigs> {
  const has = (names: readonly string[]): Promise<boolean> =>
    Promise.all(names.map((n) => fs.exists(join(dir, n)))).then((r) => r.some(Boolean));

  const [vitest, playwright, jest, cypress] = await Promise.all([
    has(['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts']),
    has(['playwright.config.ts', 'playwright.config.js']),
    has(['jest.config.ts', 'jest.config.js', 'jest.config.cjs', 'jest.config.json']),
    has(['cypress.config.ts', 'cypress.config.js']),
  ]);
  return { vitest, playwright, jest, cypress };
}

function shellArgs(pm: PackageManager, script: string): string[] {
  return pm === 'npm' ? ['run', script] : ['run', script];
}

async function suitesForPackage(options: {
  repoRoot: string;
  dir: string;
  isMoon: boolean;
  pm: PackageManager;
  fs: TestsFs;
}): Promise<TestSuite[]> {
  const { repoRoot, dir, isMoon, pm, fs } = options;

  const pkgRaw = await fs.readFile(join(dir, 'package.json'));
  if (!pkgRaw) return [];
  const pkg = safeJsonParse(pkgRaw);
  if (!pkg) return [];

  const scripts = pkg['scripts'];
  const scriptEntries =
    scripts && typeof scripts === 'object'
      ? Object.entries(scripts as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === 'string',
        )
      : [];

  const relPath = toPosix(relative(repoRoot, dir));
  const packageName = typeof pkg['name'] === 'string' ? (pkg['name'] as string) : relPath || basename(dir);
  const configs = await presentConfigs(dir, fs);

  const moonYaml = isMoon ? await fs.readFile(join(dir, 'moon.yml')) : null;
  const hasMoon = moonYaml !== null;
  const projectId = basename(dir);

  const suites: TestSuite[] = [];
  const seenNames = new Set<string>();

  for (const [name, command] of scriptEntries) {
    if (!isCandidateScript(name, command)) continue;
    const kind = classifySuite(name, command, configs);

    // A moon project runs its standard tasks through moon, not through
    // `pnpm run` — the two are the same underlying command in this repo, and
    // showing both would be the same suite twice.
    if (hasMoon && (MOON_INHERITED_TASKS as readonly string[]).includes(name)) {
      const local = moonLocalTaskOverride(moonYaml, name);
      suites.push({
        id: `${relPath}::${name}`,
        package: relPath,
        packageName,
        name,
        kind,
        source: 'moon.yml',
        sourceFile: local ? posixJoin(relPath, 'moon.yml') : '.moon/tasks/typescript.yml',
        displayCommand: `moon run ${projectId}:${name}`,
        run: { command: 'moon', args: ['run', `${projectId}:${name}`], cwd: repoRoot },
      });
      seenNames.add(name);
      continue;
    }

    suites.push({
      id: `${relPath}::${name}`,
      package: relPath,
      packageName,
      name,
      kind,
      source: 'package.json',
      sourceFile: posixJoin(relPath, 'package.json'),
      displayCommand: `${pm} ${shellArgs(pm, name).join(' ')}`,
      run: { command: pm, args: shellArgs(pm, name), cwd: dir },
    });
    seenNames.add(name);
  }

  return suites;
}

const posixJoin = (dir: string, file: string): string => (dir ? `${dir}/${file}` : file);

export type DiscoverTestsOptions = {
  repoRoot: string;
  fs?: TestsFs;
};

/** Every package's discovered suites, packages with none dropped entirely. */
export async function discoverTests(options: DiscoverTestsOptions): Promise<TestPackage[]> {
  const fs = options.fs ?? realTestsFs;
  const repoRoot = options.repoRoot;

  const isMoon = await fs.exists(join(repoRoot, '.moon'));
  const pm = await detectPackageManager(repoRoot, fs);
  const memberDirs = await resolveWorkspacePackages(repoRoot, fs);
  const dirs = memberDirs.length > 0 ? memberDirs : [repoRoot];

  const packages: TestPackage[] = [];
  for (const dir of dirs) {
    const suites = await suitesForPackage({ repoRoot, dir, isMoon, pm, fs });
    if (suites.length === 0) continue;
    const relPath = toPosix(relative(repoRoot, dir));
    const packageName = suites[0]?.packageName ?? (relPath || basename(dir));
    packages.push({ path: relPath, name: packageName, suites });
  }
  return packages;
}
