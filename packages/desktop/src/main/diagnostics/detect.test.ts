import { join } from 'node:path';

import type { DiagnosticsCandidate, DiagnosticsCommand } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import {
  DETECTORS,
  detectCandidates,
  isProposedCommand,
  type DetectFs,
  type Detector,
} from './detect';

const WORKDIR = '/repo';
const ESLINT_BIN = join(WORKDIR, 'node_modules', '.bin', 'eslint');

/** A filesystem that is exactly the set of paths you name. */
function fakeFs(present: readonly string[], executable: readonly string[] = present): DetectFs {
  return {
    exists: async (p) => present.includes(p),
    isExecutable: async (p) => executable.includes(p),
  };
}

const detect = (fs: DetectFs): Promise<DiagnosticsCandidate[]> =>
  detectCandidates(WORKDIR, { fs, detectors: DETECTORS });

describe('the eslint detectors', () => {
  it('proposes nothing when there is no local binary', async () => {
    // A repo with a config but no installed eslint is a repo whose deps are
    // not installed — proposing a command that cannot run helps nobody.
    expect(await detect(fakeFs([join(WORKDIR, 'eslint.config.js')], []))).toEqual([]);
  });

  it('proposes nothing when the binary exists but no config does', async () => {
    // eslint as a transitive dependency of something else. Running it would
    // exit with "couldn't find a configuration file".
    expect(await detect(fakeFs([ESLINT_BIN]))).toEqual([]);
  });

  it('proposes the flat-config command when both are present', async () => {
    const config = join(WORKDIR, 'eslint.config.mjs');
    const [candidate, ...rest] = await detect(fakeFs([ESLINT_BIN, config]));
    expect(rest).toEqual([]);
    expect(candidate?.detectorId).toBe('eslint-flat');
    expect(candidate?.command).toBe(ESLINT_BIN);
    expect(candidate?.args).toEqual(['.', '--format', 'json']);
    expect(candidate?.parser).toBe('eslint');
  });

  it('carries the evidence that made it fire', async () => {
    const config = join(WORKDIR, '.eslintrc.json');
    const [candidate] = await detect(fakeFs([ESLINT_BIN, config]));
    // The trust prompt shows this, so the user can see *why* a command is
    // being offered rather than taking it on faith.
    expect(candidate?.evidence).toEqual(['node_modules/.bin/eslint', '.eslintrc.json']);
  });

  it('ranks flat config above .eslintrc for a repo mid-migration', async () => {
    const fs = fakeFs([ESLINT_BIN, join(WORKDIR, 'eslint.config.js'), join(WORKDIR, '.eslintrc')]);
    // eslint 9 reads the flat one, so the default offer must describe what a
    // run would actually do.
    expect((await detect(fs)).map((c) => c.detectorId)).toEqual(['eslint-flat', 'eslint-legacy']);
  });

  it('never proposes a command for a repo it recognises nothing in', async () => {
    // Go with a Makefile: real tooling, none of it ours to read yet.
    const fs = fakeFs([join(WORKDIR, 'Makefile'), join(WORKDIR, 'go.mod')]);
    expect(await detect(fs)).toEqual([]);
  });
});

describe('the registry', () => {
  const candidate = (parser: string): DiagnosticsCandidate =>
    ({
      detectorId: 'fake',
      ecosystem: 'go',
      label: 'fake',
      command: '/usr/bin/fake',
      args: [],
      parser,
      evidence: [],
    }) as unknown as DiagnosticsCandidate;

  const detector = (id: string, result: DiagnosticsCandidate | null): Detector => ({
    id,
    ecosystem: 'go',
    label: id,
    detect: async () => result,
  });

  it('drops a candidate naming a parser this build does not ship', async () => {
    // The gate. Without it a Go repo gets an approved command whose every run
    // comes back parse-failed — a feature that looks enabled and says nothing.
    const found = await detectCandidates(WORKDIR, {
      fs: fakeFs([]),
      detectors: [detector('golangci', candidate('golangci'))],
    });
    expect(found).toEqual([]);
  });

  it('keeps a candidate whose parser is shipped', async () => {
    const found = await detectCandidates(WORKDIR, {
      fs: fakeFs([]),
      detectors: [detector('shipped', candidate('eslint'))],
    });
    expect(found).toHaveLength(1);
  });

  it('lets one throwing detector cost only its own answer', async () => {
    const throwing: Detector = {
      id: 'boom',
      ecosystem: 'go',
      label: 'boom',
      detect: async () => {
        throw new Error('nope');
      },
    };
    const found = await detectCandidates(WORKDIR, {
      fs: fakeFs([]),
      detectors: [throwing, detector('ok', candidate('eslint'))],
    });
    expect(found.map((c) => c.detectorId)).toEqual(['fake']);
  });

  it('preserves registry order as the ranking', async () => {
    const found = await detectCandidates(WORKDIR, {
      fs: fakeFs([]),
      detectors: [
        detector('a', { ...candidate('eslint'), detectorId: 'a' }),
        detector('b', { ...candidate('eslint'), detectorId: 'b' }),
      ],
    });
    expect(found.map((c) => c.detectorId)).toEqual(['a', 'b']);
  });
});

describe('isProposedCommand', () => {
  const proposal: DiagnosticsCandidate = {
    detectorId: 'eslint-flat',
    ecosystem: 'javascript',
    label: 'ESLint (flat config)',
    command: '/repo/node_modules/.bin/eslint',
    args: ['.', '--format', 'json'],
    parser: 'eslint',
    evidence: ['node_modules/.bin/eslint', 'eslint.config.js'],
  };
  const asCommand = (c: DiagnosticsCandidate): DiagnosticsCommand => ({
    command: c.command,
    args: c.args,
    parser: c.parser,
    ecosystem: c.ecosystem,
  });

  it('accepts the command it proposed', () => {
    expect(isProposedCommand(asCommand(proposal), [proposal])).toBe(true);
  });

  it('refuses an executable nobody proposed', () => {
    // Without this the `trust` verb would be an arbitrary-execution primitive
    // with a consent-shaped name.
    const evil = { ...asCommand(proposal), command: '/bin/sh' };
    expect(isProposedCommand(evil, [proposal])).toBe(false);
  });

  it('refuses the proposed binary with different arguments', () => {
    // `--fix` is a different proposition from `--format json`, and only one of
    // them was on screen when the user clicked Enable.
    const mutated = { ...asCommand(proposal), args: ['.', '--fix'] };
    expect(isProposedCommand(mutated, [proposal])).toBe(false);
  });

  it('refuses an extra argument appended to a proposed command', () => {
    const extended = { ...asCommand(proposal), args: [...proposal.args, '--no-ignore'] };
    expect(isProposedCommand(extended, [proposal])).toBe(false);
  });

  it('refuses everything when nothing was proposed', () => {
    expect(isProposedCommand(asCommand(proposal), [])).toBe(false);
  });

  it('cannot be fooled by re-splitting an argument', () => {
    const resplit = { ...asCommand(proposal), args: ['. --format', 'json'] };
    expect(isProposedCommand(resplit, [proposal])).toBe(false);
  });
});
