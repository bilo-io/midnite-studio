/**
 * Real `sandbox-exec` — Phase 121 Theme E. Needs macOS, so it runs in `gate-native` (macos-14) and
 * skips elsewhere with the named reason below. A fake HOME inside a scratch directory keeps the
 * "cat ~/.ssh/id_rsa fails" check deterministic: a developer without a real key would otherwise
 * pass for the wrong reason.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prepareConfinement, probeConfinement, wrapWithSandbox } from './confine';
import { generateSeatbeltProfile } from './seatbelt-profile';

const availability = probeConfinement();
const skipReason = availability.available ? '' : `sandbox-exec unavailable: ${availability.reason}`;
const suite = availability.available ? describe : describe.skip;

suite(`sandbox-exec with a generated profile${skipReason ? ` (SKIPPED: ${skipReason})` : ''}`, () => {
  let root: string;
  let home: string;
  let repo: string;
  let sibling: string;
  let scratch: string;
  let userData: string;
  let profilePath: string;

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'confine-sb-')));
    home = join(root, 'home');
    repo = join(root, 'dev', 'repo');
    sibling = join(root, 'dev', 'sibling');
    scratch = join(root, 'scratch');
    userData = join(root, 'userData');
    for (const dir of [join(home, '.ssh'), repo, sibling, scratch, userData]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(home, '.ssh', 'id_rsa'), 'PRIVATE');
    writeFileSync(join(sibling, 'secret.txt'), 'other repo');
    writeFileSync(join(repo, 'ok.txt'), 'mine');
    const profile = generateSeatbeltProfile({
      repoRoots: [repo],
      registryRepos: [repo, sibling],
      userData,
      home,
      tempDirs: [scratch],
    });
    profilePath = prepareConfinement(userData, profile, 'fixture').profilePath;
  });
  afterAll(() => undefined);

  const sh = (script: string) => {
    const { command, args } = wrapWithSandbox(profilePath, '/bin/sh', ['-c', script]);
    return spawnSync(command, args, { cwd: repo, encoding: 'utf8' });
  };

  it('accepts the profile (sandbox-exec -n parses it)', () => {
    const r = spawnSync('/usr/bin/sandbox-exec', ['-f', profilePath, '/usr/bin/true']);
    expect(r.status).toBe(0);
  });

  it('refuses to read ~/.ssh/id_rsa', () => {
    const r = sh(`cat ${join(home, '.ssh', 'id_rsa')}`);
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('PRIVATE');
  });

  it('allows a write under the temp directory and in the repo', () => {
    expect(sh(`echo hi > ${join(scratch, 'x')}`).status).toBe(0);
    expect(readFileSync(join(scratch, 'x'), 'utf8')).toBe('hi\n');
    expect(sh(`echo hi > ${join(repo, 'new.txt')}`).status).toBe(0);
  });

  it('refuses a write to, and a read of, a sibling repo', () => {
    expect(sh(`echo no > ${join(sibling, 'x')}`).status).not.toBe(0);
    expect(existsSync(join(sibling, 'x'))).toBe(false);
    const read = sh(`cat ${join(sibling, 'secret.txt')}`);
    expect(read.status).not.toBe(0);
    expect(read.stdout).not.toContain('other repo');
  });

  it('still reads its own repo', () => {
    expect(sh(`cat ${join(repo, 'ok.txt')}`).stdout).toBe('mine');
  });
});
