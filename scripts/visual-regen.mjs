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
// The docker invocation below is byte-for-byte the one those two comments
// documented, and the three non-obvious things about it (bare `npx` cannot
// resolve `playwright` from the workspace root; `--ignore-scripts` is required
// in this image; going through `moon` breaks on an already-installed host
// `node_modules`) are all explained at length in
// `packages/app/playwright.visual.config.ts`. Read that before changing it.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'mcr.microsoft.com/playwright:v1.62.1-noble';
const PNPM = 'pnpm@9.15.0';

const INNER = [
  'corepack enable',
  `corepack prepare ${PNPM} --activate`,
  'pnpm install --frozen-lockfile --ignore-scripts',
  'cd packages/app && pnpm exec playwright test --config playwright.visual.config.ts -u',
].join(' && ');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

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
      `This pulls ${IMAGE} (~2 GB) and runs the whole`,
      'visual suite inside it with `-u`, rewriting packages/app/e2e/visual/__screenshots__/.',
    ].join('\n'),
  );
}

const docker = spawnSync('docker', ['--version'], { stdio: 'ignore' });
if (docker.error || docker.status !== 0) {
  fail(
    [
      'visual-regen: no working `docker` on PATH.',
      '',
      'The committed baselines are pinned to this exact image\'s font/fontconfig/',
      'freetype versions, so regenerating them outside it produces a corpus CI will',
      'immediately reject. Install Docker Desktop (or colima) and retry — or leave',
      'the baselines alone, which is the supported default.',
    ].join('\n'),
  );
}

process.stdout.write(`visual-regen: running the visual suite with -u inside ${IMAGE}\n`);

const run = spawnSync(
  'docker',
  ['run', '--rm', '-v', `${REPO_ROOT}:/w`, '-w', '/w', IMAGE, 'bash', '-c', INNER],
  { stdio: 'inherit' },
);

if (run.error) fail(`visual-regen: failed to start docker — ${run.error.message}`);
process.exit(run.status ?? 1);
