import { chmod, mkdtemp, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDotfileSecrets, resolveListeningPorts, resolveMacConfig, resolveSshInputs } from './mac-probes';
import type { ExecFile } from './software';

const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n';

describe('mac probes', () => {
  it('reads a fixture home: a 0644 key, a passphrase-less key, an .npmrc token and a clean .zshrc', async () => {
    const home = await mkdtemp(join(tmpdir(), 'guard-home-'));
    await mkdir(join(home, '.ssh'));
    await writeFile(join(home, '.ssh', 'loose'), KEY);
    await chmod(join(home, '.ssh', 'loose'), 0o644);
    await writeFile(join(home, '.ssh', 'tight'), KEY);
    await chmod(join(home, '.ssh', 'tight'), 0o600);
    await writeFile(join(home, '.ssh', 'tight.pub'), 'ssh-ed25519 AAAA me');
    await writeFile(join(home, '.zshrc'), 'export PATH=$PATH:/opt/bin\nalias ll="ls -l"\n');
    await writeFile(join(home, '.npmrc'), '//registry.npmjs.org/:_authToken=npm_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8\n');

    const calls: string[][] = [];
    // `ssh-keygen -y -P ''` succeeds for `loose` (no passphrase) and rejects for the other.
    const exec: ExecFile = async (file, args) => {
      calls.push([file, ...args]);
      if (file === 'ssh-keygen' && args.includes('-y')) {
        const target = args[args.length - 1]!;
        return target.includes('guard-key-') && calls.filter((c) => c[0] === 'ssh-keygen').length === 1 ? 'ssh-ed25519 AAAA' : Promise.reject(new Error('passphrase'));
      }
      throw new Error('unexpected');
    };
    const ssh = await resolveSshInputs(exec, home);
    const byName = Object.fromEntries(ssh.files.map((f) => [f.path.split('/').pop()!, f]));
    expect(byName['loose']!.mode).toBe(0o644);
    expect(byName['tight']!.mode).toBe(0o600);
    expect(Object.values(byName).filter((f) => f.hasPassphrase === false)).toHaveLength(1);
    expect(byName['tight.pub']).toBeUndefined();
    // the original keys were only read: same bytes, and the copies are gone
    expect((await readdir(tmpdir())).filter((n) => n.startsWith('guard-key-'))).toHaveLength(0);

    const secrets = await resolveDotfileSecrets(home, []);
    expect(secrets.every((s) => s.file.endsWith('.npmrc'))).toBe(true);
    expect(secrets.length).toBeGreaterThan(0);
    expect(JSON.stringify(secrets)).not.toContain('a1B2c3D4');
  });

  it('classifies listeners by signer', async () => {
    const exec: ExecFile = async (file, args) => {
      if (file === 'lsof') return 'p1\ncApple\nn*:7000\np2\ncfoo\nn*:8000\np3\ncbar\nn*:9000\n';
      if (file === 'ps') return args[1] === '1' ? '/usr/bin/a' : args[1] === '2' ? '/opt/foo' : (() => { throw new Error('gone'); })();
      if (file === 'codesign') return args[2] === '/usr/bin/a' ? 'designated => anchor apple\n' : Promise.reject(new Error('not signed'));
      throw new Error('unexpected');
    };
    const ports = await resolveListeningPorts(exec);
    expect(ports.map((p) => p.signer)).toEqual(['apple', 'unsigned', 'unknown']);
  });

  it('throws when no macOS setting can be read, so the sweep records a skipped input', async () => {
    const missing = Object.assign(new Error('nope'), { code: 'ENOENT' });
    await expect(resolveMacConfig(async () => Promise.reject(missing))).rejects.toThrow();
    const cfg = await resolveMacConfig(async (file) => (file === 'fdesetup' ? 'FileVault is Off.' : Promise.reject(missing)));
    expect(cfg.fileVault).toBe('off');
    expect(cfg.sip).toBe('unavailable');
  });
});
