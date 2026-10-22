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
  it('warns when outside the window and passes inside it', () => {
    expect(judge(33, [41, 40, 39]).ok).toBe(false);
    expect(judge(40, [41, 40, 39]).ok).toBe(true);
  });
  it('never fails on missing data', () => expect(judge(null, []).ok).toBe(true));
  it('judges every binary that ships: Studio and the launcher the bundles run on', () => {
    for (const relative of PINNED_PACKAGES) expect(existsSync(path.join(repoRoot, relative)), relative).toBe(true);
  });

  // Phase 117 Theme A: `--strict` is the Browser bundle's gate.
  it('--strict fails only on an out-of-window verdict', () => {
    const out = judge(33, [41, 40, 39]);
    const inside = judge(40, [41, 40, 39]);
    expect(exitCodeFor([inside, out], true)).toBe(1);
    expect(exitCodeFor([inside], true)).toBe(0);
    expect(exitCodeFor([inside, out], false)).toBe(0);
  });
  it('--strict never fails on missing data', () => expect(exitCodeFor([judge(null, [])], true)).toBe(0));
  it('parses --strict and nothing else', () => {
    expect(parseArgs(['--strict'])).toEqual({ strict: true });
    expect(parseArgs([])).toEqual({ strict: false });
  });
});
