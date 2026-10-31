#!/usr/bin/env node
// electron-freshness: warn when a pinned Electron major has fallen out of the three majors
// Electron supports (Phase 91 Theme I; stops Phase 76 Theme A's bump ageing back out of support).
//
// The window is the three highest *stable* majors in the release index. The index also lists
// nightlies and alphas (`47.0.0-nightly.…`, `46.0.0-alpha.4`) months before a major ships stable;
// counting them once made the window "47, 46, 45" while 45 was the newest stable release, and the
// first 48 nightly would have pushed every stable Electron out of it — a gate nothing could pass.
//
// Two pins are judged, because two binaries ship: `packages/desktop` (Studio) and `apps/launcher`
// (Midnite Apps — the runtime every app bundle, the Browser included, runs on; a stub clones its
// binary). Both ride the same lockstep version in practice, but a pin is judged where it is written.
//
// `--strict` (Phase 117 Theme A) turns the warning into a gate: an out-of-window major on either pin
// exits 1. `app-browser:dist` and the release's Browser bundle job run it strict — a browser app
// cannot ship on a Chromium with no security backports. Studio's pin was warn-only under `--strict`
// until Phase 76 Theme A's bump brought it back into the window; both pins are gated alike since.
// Strict needs a verdict: with no release index (offline, a 429, the 15 s timeout) it exits 1 and
// says so, because a gate that ships the bundle whenever the network is down is not one. The
// warn-only default still skips with a notice and exits 0.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RELEASES = 'https://electronjs.org/headers/index.json';

/**
 * The package.json files whose Electron pin a shipped binary comes from. `gate` is whether `--strict`
 * may fail on it — both, since Phase 76 Theme A brought Studio's pin into the window.
 */
export const PINNED_PACKAGES = [
  { path: 'packages/desktop/package.json', gate: true },
  { path: 'apps/launcher/package.json', gate: true },
];

export function pinnedMajor(range) {
  const m = /(\d+)\./.exec(range ?? '');
  return m ? Number(m[1]) : null;
}

/** The three highest stable majors in the releases index; prereleases (`-nightly`, `-alpha`, `-beta`) are ignored. */
export function supportedMajors(releases) {
  const majors = new Set();
  for (const r of releases) {
    const m = /^(\d+)\.\d+\.\d+$/.exec(r.version ?? '');
    if (m) majors.add(Number(m[1]));
  }
  return [...majors].sort((a, b) => b - a).slice(0, 3);
}

export function judge(pinned, supported) {
  if (pinned == null || supported.length === 0) return { ok: true, message: 'could not determine majors; skipping' };
  if (supported.includes(pinned)) return { ok: true, message: `Electron ${pinned} is supported (supported: ${supported.join(', ')})` };
  return { ok: false, message: `Electron ${pinned} is outside the supported majors (${supported.join(', ')}); no security backports. Bump per Phase 76 Theme A.` };
}

/**
 * The process exit code for a set of verdicts: 1 only when strict AND a *gated* pin is out of the
 * window. A skipped verdict (no data) is `ok`, so it never fails even strict.
 */
export function exitCodeFor(verdicts, strict) {
  return strict && verdicts.some((v) => v.gate && !v.ok) ? 1 : 0;
}

/** The parsed CLI: `--strict` and nothing else. */
export function parseArgs(argv) {
  return { strict: argv.includes('--strict') };
}

function readPin(relative) {
  const pkg = JSON.parse(readFileSync(path.join(here, '..', relative), 'utf8'));
  return pinnedMajor(pkg.dependencies?.electron ?? pkg.devDependencies?.electron);
}

async function main() {
  const { strict } = parseArgs(process.argv.slice(2));
  let supported;
  try {
    const res = await fetch(RELEASES, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    supported = supportedMajors(await res.json());
  } catch (err) {
    if (strict) {
      console.log(`::error title=Electron floor unverified::electron-freshness: ${err.message} — --strict needs a verdict; rerun with the network up`);
      process.exitCode = 1;
    } else {
      console.log(`electron-freshness: skipped (${err.message})`);
    }
    return;
  }
  const verdicts = PINNED_PACKAGES.map(({ path: relative, gate }) => ({ relative, gate, ...judge(readPin(relative), supported) }));
  for (const { relative, gate, ok, message } of verdicts) {
    if (ok) console.log(`electron-freshness: ${relative}: ${message}`);
    else if (strict && gate) console.log(`::error title=Electron out of support::${relative}: ${message}`);
    else console.log(`::warning title=Electron out of support::${relative}: ${message}`);
  }
  process.exitCode = exitCodeFor(verdicts, strict);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
