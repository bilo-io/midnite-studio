import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEFAULT_DETECTORS,
  DETECTOR_COUNT,
  matchesFileSuffix,
  matchesPathSuffix,
  STALE_WORKTREE_DETECTOR,
  type EvidenceRule,
} from './detectors';
import { classify } from './scan-service';

describe('matchesPathSuffix', () => {
  it('accepts a matching multi-segment suffix', () => {
    expect(matchesPathSuffix(`${sep}a${sep}b${sep}vendor${sep}bundle`, 'vendor/bundle')).toBe(
      true,
    );
  });

  it('rejects a name that merely contains the suffix without segment boundaries', () => {
    expect(matchesPathSuffix(`${sep}a${sep}vendorbundle`, 'vendor/bundle')).toBe(false);
  });

  it('rejects a differently-prefixed segment', () => {
    expect(matchesPathSuffix(`${sep}a${sep}xvendor${sep}bundle`, 'vendor/bundle')).toBe(false);
  });

  it('returns false when the suffix has more segments than the path', () => {
    expect(matchesPathSuffix(`${sep}bundle`, 'vendor/bundle')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(matchesPathSuffix(`${sep}a${sep}Build`, 'build')).toBe(false);
    expect(matchesPathSuffix(`${sep}a${sep}build`, 'build')).toBe(true);
  });
});

describe('matchesFileSuffix', () => {
  it('matches a present suffix', () => {
    expect(matchesFileSuffix(new Set(['App.csproj', 'Program.cs']), ['.csproj'])).toBe(true);
  });

  it('does not match an absent suffix', () => {
    expect(matchesFileSuffix(new Set(['Program.cs']), ['.csproj'])).toBe(false);
  });

  it('does not match a name that merely contains the suffix mid-string, not at the end', () => {
    // A plain `endsWith` scan: `.csproj` appearing mid-string (not as the
    // trailing suffix) is not evidence. A directory literally NAMED
    // `x.csproj` (ending in the suffix) is the accepted case the phase doc
    // calls out separately — see the "present" case above.
    expect(matchesFileSuffix(new Set(['x.csproj.bak']), ['.csproj'])).toBe(false);
  });
});

describe('DEFAULT_DETECTORS shape', () => {
  it('has DETECTOR_COUNT entries', () => {
    expect(DEFAULT_DETECTORS).toHaveLength(DETECTOR_COUNT);
  });

  it('every id is unique — detectorId keys the result.detectors map', () => {
    expect(new Set(DEFAULT_DETECTORS.map((d) => d.id)).size).toBe(DEFAULT_DETECTORS.length);
  });

  it('every detector names a producer', () => {
    expect(DEFAULT_DETECTORS.every((d) => d.producer.trim().length > 0)).toBe(true);
  });

  it('STALE_WORKTREE_DETECTOR also names a producer, and is excluded from DEFAULT_DETECTORS', () => {
    expect(STALE_WORKTREE_DETECTOR.producer.trim().length).toBeGreaterThan(0);
    expect(DEFAULT_DETECTORS.find((d) => d.id === STALE_WORKTREE_DETECTOR.id)).toBeUndefined();
  });

  function sharesSuffix(a: readonly string[], b: readonly string[]): boolean {
    return a.some((x) => b.includes(x));
  }

  function noEvidenceFreeShadowsEvidenced(
    detectors: readonly { match: readonly string[]; evidence: EvidenceRule }[],
  ): boolean {
    for (const [i, detector] of detectors.entries()) {
      if (detector.evidence.kind !== 'none') continue;
      for (const later of detectors.slice(i + 1)) {
        if (sharesSuffix(detector.match, later.match)) return false;
      }
    }
    return true;
  }

  it('no evidence-free detector shadows an evidenced one sharing its suffix', () => {
    expect(noEvidenceFreeShadowsEvidenced(DEFAULT_DETECTORS)).toBe(true);
  });

  it('the ordering-invariant helper actually catches a violation', () => {
    const bad = [
      { match: ['node_modules'], evidence: { kind: 'none' } as EvidenceRule },
      { match: ['node_modules'], evidence: { kind: 'siblingAny', names: ['x'] } as EvidenceRule },
    ];
    expect(noEvidenceFreeShadowsEvidenced(bad)).toBe(false);
  });
});

describe('classify (via a real fixture tree, one per EvidenceRule arm)', () => {
  let root: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-detectors-')));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('siblingAny: matches with the sibling present, not without it', async () => {
    const withCargo = join(root, 'with-cargo');
    await mkdir(join(withCargo, 'target'), { recursive: true });
    await writeFile(join(withCargo, 'Cargo.toml'), '[package]');
    const siblingsWith = new Set(['target', 'Cargo.toml']);
    expect((await classify(join(withCargo, 'target'), siblingsWith))?.id).toBe('rust-target');

    const withoutCargo = join(root, 'without-cargo');
    await mkdir(join(withoutCargo, 'target'), { recursive: true });
    const siblingsWithout = new Set(['target']);
    expect(await classify(join(withoutCargo, 'target'), siblingsWithout)).toBeNull();
  });

  it('siblingSuffix: matches a project-file extension beside it, not a plain sibling', async () => {
    const withProj = join(root, 'with-csproj');
    await mkdir(join(withProj, 'obj'), { recursive: true });
    const siblingsWith = new Set(['obj', 'App.csproj']);
    expect((await classify(join(withProj, 'obj'), siblingsWith))?.id).toBe('dotnet-obj');

    const withoutProj = join(root, 'without-csproj');
    await mkdir(join(withoutProj, 'obj'), { recursive: true });
    const siblingsWithout = new Set(['obj']);
    expect(await classify(join(withoutProj, 'obj'), siblingsWithout)).toBeNull();
  });

  it('childAny: matches with the child file present inside the candidate, not without it', async () => {
    const withCache = join(root, 'with-cache', 'build');
    await mkdir(withCache, { recursive: true });
    await writeFile(join(withCache, 'CMakeCache.txt'), 'x');
    expect((await classify(withCache, new Set(['build'])))?.id).toBe('cmake-build');

    const withoutCache = join(root, 'without-cache', 'build');
    await mkdir(withoutCache, { recursive: true });
    expect(await classify(withoutCache, new Set(['build']))).toBeNull();
  });

  it('none: matches on name alone', async () => {
    expect((await classify(join(root, 'node_modules'), new Set()))?.id).toBe('node-modules');
  });

  it('an unreadable childAny candidate fails closed: no match, not a thrown error', async () => {
    if (process.getuid?.() === 0) return; // root ignores permission bits — skip under CI-as-root
    const unreadable = join(root, 'unreadable-build');
    await mkdir(unreadable, { recursive: true });
    await writeFile(join(unreadable, 'CMakeCache.txt'), 'x');
    await chmod(unreadable, 0o000);

    try {
      expect(await classify(unreadable, new Set(['build']))).toBeNull();
    } finally {
      await chmod(unreadable, 0o755);
    }
  });
});
