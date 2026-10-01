#!/usr/bin/env node
// Regenerate the committed Linux visual baselines inside the official
// Playwright container — the ONE thing in this repo that starts a Linux
// container on a developer's machine.
//
// It used to be a copy-paste `docker run …` buried in
// `packages/app/playwright.visual.config.ts`'s header comment and repeated in
// `docs/TESTING.md`. Two problems with that, both of which this script exists
// to fix:
//
//  1. **Discoverability.** A recipe in a comment is found by whoever already
//     knows to look. `moon run root:visual-regen` shows up in `moon query
//     tasks` beside every other repo task.
//  2. **Opt-in, explicitly.** macOS (arm64) is the only officially supported
//     platform for now (see README's "Supported platform"); Linux and Windows
//     are deferred, not abandoned. Nothing in the default local loop —
//     `moon run :typecheck :lint :test` — has ever started a container, and
//     this script is written so that stays true by construction: it refuses
//     without `MSTUDIO_CROSS_PLATFORM=1` rather than helpfully pulling a
//     ~2 GB image because someone ran the wrong task.
//
// Two more things it does that the original one-liner did not, both found the
// first time it was run from a real checkout on Apple silicon:
//
//  3. **It never mounts the checkout itself.** Mounting the repo put the
//     host's macOS `node_modules` inside the container, and `pnpm install
//     --frozen-lockfile` then considered it up to date — so rollup's Linux
//     native binary (an optional dependency, platform-selected at install) was
//     never fetched and Vite's dev server died with `MODULE_NOT_FOUND`. The
//     config header already recorded the same failure class for moon's own
//     binary. So the script copies the working tree (tracked files plus
//     untracked non-ignored ones, i.e. `git ls-files -co --exclude-standard`
//     — never `node_modules`) into a temp dir, runs there, and copies only
//     the `__screenshots__` directory back.
//  4. **It pins `--platform linux/amd64`.** CI's `visual` job is
//     `ubuntu-24.04` (x86_64) running this same image; on Apple silicon
//     docker would otherwise pull the arm64 variant, and a baseline rasterised
//     on a different architecture is not the corpus CI diffs against.
//     (OrbStack and Docker Desktop both emulate amd64 through Rosetta.)
//
// Pass spec paths (relative to packages/app) to regenerate only those:
//
//   MSTUDIO_CROSS_PLATFORM=1 moon run root:visual-regen -- e2e/visual/status-bar.spec.ts
//
// With no arguments the whole visual suite runs with `-u`. `-u` rewrites a
// baseline only where it fails to match, so an untouched spec's PNGs stay
// byte-identical either way.
//
// The other non-obvious things about the inner command (bare `npx` cannot
// resolve `playwright` from the workspace root; `--ignore-scripts` is required
// in this image) are explained at length in
// `packages/app/playwright.visual.config.ts`. Read that before changing it.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path, { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const IMAGE = 'mcr.microsoft.com/playwright:v1.62.1-noble';
export const PLATFORM = 'linux/amd64';
const PNPM = 'pnpm@9.15.0';
export const SCREENSHOTS_DIR = 'packages/app/e2e/visual/__screenshots__';

/** The bash command run inside the container, against `/w`. */
export function innerCommand(specs = []) {
  const target = specs.map((s) => `'${s.replaceAll("'", "'\\''")}'`).join(' ');
  return [
    'corepack enable',
    `corepack prepare ${PNPM} --activate`,
    'pnpm install --frozen-lockfile --ignore-scripts',
    `cd packages/app && pnpm exec playwright test --config playwright.visual.config.ts${target ? ` ${target}` : ''} -u`,
  ].join(' && ');
}

/** `docker` argv for a run against `workDir` (a COPY of the repo, never the checkout). */
export function dockerArgs(workDir, specs = []) {
  return [
    'run',
    '--rm',
    '--platform',
    PLATFORM,
    // `.npmrc` reads it for the GitHub Packages scope (`@bilo-io/*`); passed by
    // name only, so the token never appears in argv or `ps`.
    '-e',
    'GITHUB_PACKAGES_TOKEN',
    '-v',
    `${workDir}:/w`,
    '-w',
    '/w',
    IMAGE,
    'bash',
    '-c',
    innerCommand(specs),
  ];
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main(specs) {
  if (process.env.MSTUDIO_CROSS_PLATFORM !== '1') {
    fail(
      [
        'visual-regen: refusing to start a Linux container without an explicit opt-in.',
        '',
        'macOS (arm64) is the only officially supported platform for now; the Linux',
        'visual baselines are deferred scope, and their CI lane is opt-in too (the',
        '`cross-platform` PR label, or the `cross_platform` workflow_dispatch input).',
        '',
        'If you really do want to regenerate them:',
        '',
        '  MSTUDIO_CROSS_PLATFORM=1 moon run root:visual-regen',
        '',
        `This pulls ${IMAGE} (~2 GB, ${PLATFORM}) and runs the visual suite inside it`,
        'with -u, rewriting packages/app/e2e/visual/__screenshots__/.',
      ].join('\n'),
    );
  }

  const docker = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  if (docker.error || docker.status !== 0) {
    fail(
      [
        'visual-regen: no working `docker` on PATH.',
        '',
        "The committed baselines are pinned to this exact image's font/fontconfig/",
        'freetype versions, so regenerating them outside it produces a corpus CI will',
        'immediately reject. Install OrbStack or Docker Desktop and retry — or leave',
        'the baselines alone, which is the supported default.',
      ].join('\n'),
    );
  }

  const env = { ...process.env };
  if (!env.GITHUB_PACKAGES_TOKEN) {
    const gh = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
    if (gh.status === 0) env.GITHUB_PACKAGES_TOKEN = gh.stdout.trim();
  }
  if (!env.GITHUB_PACKAGES_TOKEN) {
    fail('visual-regen: GITHUB_PACKAGES_TOKEN is unset and `gh auth token` gave none — the install needs it.');
  }

  const listed = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (listed.status !== 0) fail(`visual-regen: git ls-files failed — ${listed.stderr}`);
  const files = listed.stdout.split('\0').filter(Boolean);

  const workDir = mkdtempSync(path.join(tmpdir(), 'mstudio-visual-regen-'));
  try {
    process.stdout.write(`visual-regen: copying ${files.length} files to ${workDir} (no node_modules)\n`);
    for (const file of files) {
      const dest = path.join(workDir, file);
      mkdirSync(dirname(dest), { recursive: true });
      try {
        copyFileSync(path.join(REPO_ROOT, file), dest);
      } catch (error) {
        // A tracked file deleted in the working tree: skip it, as git would.
        if (error.code !== 'ENOENT') throw error;
      }
    }

    process.stdout.write(
      `visual-regen: running ${specs.length ? specs.join(' ') : 'the visual suite'} with -u inside ${IMAGE} (${PLATFORM})\n`,
    );
    const run = spawnSync('docker', dockerArgs(workDir, specs), { stdio: 'inherit', env });
    if (run.error) fail(`visual-regen: failed to start docker — ${run.error.message}`);

    // Copy baselines back even on a failed run: `-u` has still rewritten every
    // spec that got as far as a screenshot, and the exit code says the rest.
    const from = path.join(workDir, SCREENSHOTS_DIR);
    cpSync(from, path.join(REPO_ROOT, SCREENSHOTS_DIR), {
      recursive: true,
      filter: (src) => !src.endsWith('.png') || src.endsWith('-linux.png'),
    });
    process.stdout.write(`visual-regen: copied ${SCREENSHOTS_DIR} back\n`);
    process.exitCode = run.status ?? 1;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
