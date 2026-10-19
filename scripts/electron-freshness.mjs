#!/usr/bin/env node
// electron-freshness: warn (never fail) when the pinned Electron major has fallen out of
// the three majors Electron supports (Phase 91 Theme I; stops Phase 76 Theme A's bump
// ageing back out of support). A network call must never redden the gate, so every
// failure path exits 0 with a notice.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RELEASES = 'https://electronjs.org/headers/index.json';

export function pinnedMajor(range) {
  const m = /(\d+)\./.exec(range ?? '');
  return m ? Number(m[1]) : null;
}

/** The three highest majors in the releases index. */
export function supportedMajors(releases) {
  const majors = new Set();
  for (const r of releases) {
    const m = /^(\d+)\./.exec(r.version ?? '');
    if (m) majors.add(Number(m[1]));
  }
  return [...majors].sort((a, b) => b - a).slice(0, 3);
}

export function judge(pinned, supported) {
  if (pinned == null || supported.length === 0) return { ok: true, message: 'could not determine majors; skipping' };
  if (supported.includes(pinned)) return { ok: true, message: `Electron ${pinned} is supported (supported: ${supported.join(', ')})` };
  return { ok: false, message: `Electron ${pinned} is outside the supported majors (${supported.join(', ')}); no security backports. Bump per Phase 76 Theme A.` };
}

async function main() {
  const pkg = JSON.parse(readFileSync(path.join(here, '..', 'packages', 'desktop', 'package.json'), 'utf8'));
  const pinned = pinnedMajor(pkg.dependencies?.electron ?? pkg.devDependencies?.electron);
  try {
    const res = await fetch(RELEASES, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { ok, message } = judge(pinned, supportedMajors(await res.json()));
    console.log(ok ? `electron-freshness: ${message}` : `::warning title=Electron out of support::${message}`);
  } catch (err) {
    console.log(`electron-freshness: skipped (${err.message})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
