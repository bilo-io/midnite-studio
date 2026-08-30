import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { commandFingerprint, type DiagnosticsCommand } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTrustStore, parseTrustState, statusFor } from './trust-store';

const command: DiagnosticsCommand = {
  command: '/repo/node_modules/.bin/eslint',
  args: ['.', '--format', 'json'],
  parser: 'eslint',
  ecosystem: 'javascript',
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-trust-'));
});

describe('statusFor', () => {
  it('reports no-command for a repo nothing is configured for', () => {
    expect(statusFor(undefined).state).toBe('no-command');
    expect(statusFor({ command: null, grant: null, trustedAt: null }).state).toBe('no-command');
  });

  it('reports untrusted for a configured but unapproved command', () => {
    expect(statusFor({ command, grant: null, trustedAt: null }).state).toBe('untrusted');
  });

  it('reports trusted only when the grant matches the command', () => {
    const record = { command, grant: commandFingerprint(command), trustedAt: 1 };
    expect(statusFor(record).state).toBe('trusted');
  });

  it('distinguishes a changed command from one that was never approved', () => {
    // The whole point of fingerprinting: editing the configured command must
    // withdraw the grant, because the prompt the user answered named the old
    // one. Folding this into `untrusted` would lose the only fact worth saying.
    const record = { command, grant: commandFingerprint({ ...command, args: ['--fix'] }), trustedAt: 1 };
    expect(statusFor(record).state).toBe('command-changed');
  });
});

describe('createTrustStore', () => {
  it('starts with nothing trusted and no command to run', async () => {
    const store = createTrustStore(dir);
    expect((await store.status('repo:/a')).state).toBe('no-command');
    expect(await store.trustedCommand('repo:/a')).toBeNull();
  });

  it('grants, persists and re-reads across instances', async () => {
    const first = createTrustStore(dir);
    expect((await first.trust('repo:/a', command, 1_700_000_000_000)).state).toBe('trusted');

    const second = createTrustStore(dir);
    const status = await second.status('repo:/a');
    expect(status.state).toBe('trusted');
    expect(status.trustedAt).toBe(1_700_000_000_000);
    expect(await second.trustedCommand('repo:/a')).toEqual(command);
  });

  it('scopes a grant to one repository', async () => {
    const store = createTrustStore(dir);
    await store.trust('repo:/a', command, 1);
    // Trusting one repo says nothing about the next — rule 1 of the policy.
    expect((await store.status('repo:/b')).state).toBe('no-command');
  });

  it('stops handing out the command once it has changed', async () => {
    const store = createTrustStore(dir);
    await store.trust('repo:/a', command, 1);
    const edited = { ...command, args: ['.', '--format', 'json', '--fix'] };
    // Simulate a config edit: same repo, different command, grant untouched.
    const raw = JSON.parse(await readFile(join(dir, 'trust.json'), 'utf8'));
    raw.repos['repo:/a'].command = edited;
    await writeFile(join(dir, 'trust.json'), JSON.stringify(raw));

    const reread = createTrustStore(dir);
    expect((await reread.status('repo:/a')).state).toBe('command-changed');
    expect(await reread.trustedCommand('repo:/a')).toBeNull();
  });

  it('keeps the command but drops the grant on untrust', async () => {
    const store = createTrustStore(dir);
    await store.trust('repo:/a', command, 1);
    const status = await store.untrust('repo:/a');
    // Re-enabling should be one click, not another trip through detection.
    expect(status.state).toBe('untrusted');
    expect(status.command).toEqual(command);
    expect(await store.trustedCommand('repo:/a')).toBeNull();
  });

  it('survives a corrupt file by trusting nothing', async () => {
    await writeFile(join(dir, 'trust.json'), '{ not json');
    const store = createTrustStore(dir);
    expect((await store.status('repo:/a')).state).toBe('no-command');
  });
});

describe('parseTrustState', () => {
  it('returns nothing for shapes that are not a state object', () => {
    expect(parseTrustState(null)).toEqual({});
    expect(parseTrustState([])).toEqual({});
    expect(parseTrustState({ repos: 'no' })).toEqual({});
  });

  it('drops a record whose command does not validate', () => {
    // The thing that failed to validate is the thing we would execute.
    const parsed = parseTrustState({
      repos: { 'repo:/a': { command: { command: '', args: [] }, grant: 'x', trustedAt: 1 } },
    });
    expect(parsed).toEqual({});
  });

  it('drops a command naming a parser this build does not ship', () => {
    const parsed = parseTrustState({
      repos: {
        'repo:/a': {
          command: { ...command, parser: 'golangci' },
          grant: 'x',
          trustedAt: 1,
        },
      },
    });
    expect(parsed).toEqual({});
  });

  it('keeps the command but drops an incoherent grant', () => {
    const parsed = parseTrustState({
      repos: { 'repo:/a': { command, grant: 'x', trustedAt: null } },
    });
    expect(parsed['repo:/a']?.command).toEqual(command);
    expect(parsed['repo:/a']?.grant).toBeNull();
  });
});
