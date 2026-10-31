import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { exitCodeFor, judge, parseArgs, PINNED_PACKAGES, pinnedMajor, supportedMajors } from './electron-freshness.mjs';

const releases = ['41.0.1', '41.0.0', '40.2.0', '39.8.1', '38.9.0'].map((version) => ({ version }));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('electron-freshness', () => {
  it('reads the major from a range', () => expect(pinnedMajor('^33.2.0')).toBe(33));
  it('takes the three newest majors', () => expect(supportedMajors(releases)).toEqual([41, 40, 39]));
  // Phase 76 Theme A: the index lists nightlies and alphas months before a major ships stable.
  it('ignores prereleases, so a nightly never pushes the newest stable major out of the window', () => {
    const withPrereleases = [
      { version: '48.0.0-nightly.20261201' },
      { version: '47.0.0-nightly.20261030' },
      { version: '46.0.0-alpha.4' },
      { version: '45.0.0-beta.7' },
      ...['45.2.1', '44.10.0', '43.8.6', '42.11.18'].map((version) => ({ version })),
    ];
    expect(supportedMajors(withPrereleases)).toEqual([45, 44, 43]);
  });
  it('warns when outside the window and passes inside it', () => {
    expect(judge(33, [41, 40, 39]).ok).toBe(false);
    expect(judge(40, [41, 40, 39]).ok).toBe(true);
  });
  it('never fails on missing data', () => expect(judge(null, []).ok).toBe(true));
  it('judges and gates every binary that ships — Studio and the launcher every bundle runs on', () => {
    for (const { path: relative } of PINNED_PACKAGES) expect(existsSync(path.join(repoRoot, relative)), relative).toBe(true);
    expect(PINNED_PACKAGES.filter((p) => p.gate).map((p) => p.path)).toEqual(['packages/desktop/package.json', 'apps/launcher/package.json']);
  });

  // Phase 117 Theme A: `--strict` is the Browser bundle's gate.
  it('--strict fails only on an out-of-window verdict for a gated pin', () => {
    const out = { gate: true, ...judge(33, [41, 40, 39]) };
    const inside = { gate: true, ...judge(40, [41, 40, 39]) };
    const ungatedLagging = { gate: false, ...judge(33, [41, 40, 39]) };
    expect(exitCodeFor([inside, out], true)).toBe(1);
    expect(exitCodeFor([inside], true)).toBe(0);
    expect(exitCodeFor([inside, out], false)).toBe(0);
    // An ungated pin out of the window warns but never fails strict on its own.
    expect(exitCodeFor([ungatedLagging, inside], true)).toBe(0);
  });
  it('--strict never fails on a pin it cannot read (no verdict on the pin is not a verdict against it)', () => expect(exitCodeFor([{ gate: true, ...judge(null, []) }], true)).toBe(0));
  it('parses --strict and nothing else', () => {
    expect(parseArgs(['--strict'])).toEqual({ strict: true });
    expect(parseArgs([])).toEqual({ strict: false });
  });
});
