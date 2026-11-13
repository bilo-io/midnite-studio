import { describe, expect, it } from 'vitest';

import { macConfigCheck, parseFileVault, parseGatekeeper, parseSecurityUpdates, parseSip } from './mac-config';
import { isWildcardAddress, macPortsCheck, parseLsofListeners, type ListeningPort } from './mac-ports';
import { secretsOutsideVaultCheck } from './secrets-outside-vault';
import { parseAuthorizedKeys, sshKeysCheck } from './ssh-keys';

const LSOF = ['p100', 'cnode', 'n*:5173', 'p200', 'cmystery', 'n*:9999', 'n127.0.0.1:9998', 'p300', 'cControlCenter', 'n*:7000', 'p400', 'cdevtool', 'n[::]:4444'].join('\n');

describe('ports', () => {
  it('parses lsof field output', () => {
    const l = parseLsofListeners(LSOF);
    expect(l).toHaveLength(5);
    expect(l[1]).toEqual({ pid: 200, command: 'mystery', address: '*', port: 9999 });
    expect(l[4]).toEqual({ pid: 400, command: 'devtool', address: '[::]', port: 4444 });
    expect(isWildcardAddress('127.0.0.1')).toBe(false);
  });

  it('flags wildcard listeners that are not known, Apple or loopback; unsigned is high', () => {
    const signer = (c: string): ListeningPort['signer'] => (c === 'ControlCenter' ? 'apple' : c === 'devtool' ? 'unsigned' : 'signed');
    const ports = parseLsofListeners(LSOF).map((p) => ({ ...p, signer: signer(p.command) }));
    const f = macPortsCheck.run({ ports }) as ReturnType<typeof macPortsCheck.run> & unknown[];
    const found = f as { fingerprint: string; severity: string; remediation: { id: string }[] }[];
    expect(found.map((x) => [x.fingerprint, x.severity])).toEqual([
      ['mac-ports:mystery:9999', 'medium'],
      ['mac-ports:devtool:4444', 'high'],
    ]);
    expect(found[0]!.remediation[0]!.id).toBe('kill-process-group');
  });
});

describe('configuration', () => {
  it('classifies probe output as on, off or unavailable', () => {
    expect(parseFileVault('FileVault is Off.')).toBe('off');
    expect(parseFileVault('FileVault is On.')).toBe('on');
    expect(parseFileVault('')).toBe('unavailable');
    expect(parseGatekeeper('assessments disabled')).toBe('off');
    expect(parseSip('System Integrity Protection status: enabled.')).toBe('on');
    expect(parseSip('System Integrity Protection status: disabled.')).toBe('off');
    expect(parseSecurityUpdates('No new software available.')).toBe('off');
    expect(parseSecurityUpdates('* Label: macOS Sequoia 15.1\n')).toBe('on');
  });

  it('reports each off protection once with the table severity, and nothing for unavailable or healthy', () => {
    const f = macConfigCheck.run({
      macConfig: { fileVault: 'off', firewall: 'off', gatekeeper: 'off', sip: 'on', remoteLogin: 'on', screenSharing: 'off', pendingSecurityUpdates: 'unavailable', autoUpdates: 'unavailable' },
    }) as { fingerprint: string; severity: string }[];
    expect(f.map((x) => [x.fingerprint, x.severity])).toEqual([
      ['mac-config:fileVault', 'high'],
      ['mac-config:firewall', 'medium'],
      ['mac-config:gatekeeper', 'high'],
      ['mac-config:remoteLogin', 'medium'],
    ]);
    expect(macConfigCheck.run({ macConfig: { fileVault: 'on', firewall: 'on', gatekeeper: 'on', sip: 'on', remoteLogin: 'off', screenSharing: 'off', pendingSecurityUpdates: 'off', autoUpdates: 'on' } })).toEqual([]);
  });
});

describe('keys', () => {
  it('flags a 0644 key and a passphrase-less key, leaves a clean 0600 protected key', () => {
    const f = sshKeysCheck.run({
      sshKeys: {
        files: [
          { path: '/h/.ssh/id_a', mode: 0o644, isPrivateKey: true, hasPassphrase: true },
          { path: '/h/.ssh/id_b', mode: 0o600, isPrivateKey: true, hasPassphrase: false },
          { path: '/h/.ssh/id_c', mode: 0o600, isPrivateKey: true, hasPassphrase: true },
          { path: '/h/.ssh/id_c.pub', mode: 0o644, isPrivateKey: false, hasPassphrase: null },
        ],
        authorizedKeys: [],
        gnupg: [{ path: '/h/.gnupg', mode: 0o755 }, { path: '/h/.gnupg/ok', mode: 0o600 }],
      },
    }) as { fingerprint: string; severity: string; remediation: { id: string }[] }[];
    expect(f.map((x) => [x.fingerprint, x.severity])).toEqual([
      ['ssh-keys:mode:/h/.ssh/id_a', 'high'],
      ['ssh-keys:passphrase:/h/.ssh/id_b', 'medium'],
      ['ssh-keys:gnupg:/h/.gnupg', 'medium'],
    ]);
    expect(f[0]!.remediation[0]!.id).toBe('chmod-600');
  });

  it('lists authorized_keys options without the key material', () => {
    const entries = parseAuthorizedKeys('/h/.ssh/authorized_keys', 'ssh-ed25519 AAAAC3SECRETKEY me@laptop\ncommand="/bin/true",from="10.0.0.1" ssh-rsa AAAAB3OTHER ci\n# note\n');
    expect(entries).toHaveLength(2);
    expect(JSON.stringify(entries)).not.toContain('SECRETKEY');
    const f = sshKeysCheck.run({ sshKeys: { files: [], authorizedKeys: entries, gnupg: [] } }) as { severity: string }[];
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('info');
  });
});

describe('secrets outside the vault', () => {
  it('groups by file and pattern, high, and never carries a value', () => {
    const f = secretsOutsideVaultCheck.run({
      dotfileSecrets: [
        { file: '/h/.npmrc', line: 2, pattern: 'npm token' },
        { file: '/h/.npmrc', line: 5, pattern: 'npm token' },
      ],
    }) as { severity: string; detail: string }[];
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('high');
    expect(f[0]!.detail).toContain('2, 5');
  });

  it('is clean when nothing matched', () => {
    expect(secretsOutsideVaultCheck.run({ dotfileSecrets: [] })).toEqual([]);
  });
});
