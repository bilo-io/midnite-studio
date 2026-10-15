import { describe, expect, it } from 'vitest';
import { parseSshVersion, probeBinary, readSystemHealth, startSshAgent } from './system-health';

describe('readSystemHealth', () => {
  // A smoke test against the real probes, bounded to PROBE_TIMEOUT_MS in the source.
  it('returns structured health metrics without throwing', async () => {
    const health = await readSystemHealth();
    expect(health).toHaveProperty('git');
    expect(health).toHaveProperty('shell');
    expect(health).toHaveProperty('sshAgent');
    expect(typeof health.sshAgent.running).toBe('boolean');
    expect(typeof health.sshAgent.keys).toBe('number');
    if (health.sshAgent.version !== null && health.sshAgent.version !== undefined) {
      expect(typeof health.sshAgent.version).toBe('string');
    }
    expect(health).toHaveProperty('cli');
    expect(typeof health.cli.installed).toBe('boolean');
    expect(typeof health.cli.managed).toBe('boolean');
    if (health.cli.version !== null && health.cli.version !== undefined) {
      expect(typeof health.cli.version).toBe('string');
    }
    expect(health).toHaveProperty('homebrew');
    expect(health).toHaveProperty('node');
    expect(health).toHaveProperty('pnpm');
    expect(health).toHaveProperty('moon');
    expect(health).toHaveProperty('ollama');
    expect(health.ollamaDaemon).toBeDefined();
    expect(typeof health.ollamaDaemon?.reachable).toBe('boolean');
  }, 15_000);
});

describe('parseSshVersion', () => {
  it('parses OpenSSH output with trailing libraries', () => {
    expect(parseSshVersion('OpenSSH_10.3p1, LibreSSL 3.3.6\n')).toBe('OpenSSH 10.3p1');
    expect(parseSshVersion('OpenSSH_9.6p1, OpenSSL 3.0.13 30 Jan 2024')).toBe('OpenSSH 9.6p1');
  });

  it('parses OpenSSH output without trailing commas', () => {
    expect(parseSshVersion('OpenSSH_9.0p1')).toBe('OpenSSH 9.0p1');
    expect(parseSshVersion('OpenSSH 8.9')).toBe('OpenSSH 8.9');
  });

  it('returns null for empty or null inputs', () => {
    expect(parseSshVersion(null)).toBeNull();
    expect(parseSshVersion(undefined)).toBeNull();
    expect(parseSshVersion('')).toBeNull();
    expect(parseSshVersion('   \n')).toBeNull();
  });
});

describe('probeBinary', () => {
  it('detects an existing binary such as git with path and version', async () => {
    const result = await probeBinary('git', ['/usr/bin/git']);
    expect(result.path).not.toBeNull();
    expect(result.version).toMatch(/git version/);
  });

  it('fails soft when a binary does not exist', async () => {
    const result = await probeBinary('nonexistent-binary-midnite-404', ['/tmp/nonexistent-bin-404']);
    expect(result).toEqual({ path: null, version: null });
  });
});

describe('startSshAgent', () => {
  it('attempts to start or resolve ssh-agent without throwing', async () => {
    const result = await startSshAgent();
    expect(typeof result.ok).toBe('boolean');
    if (result.ok && result.sock) {
      expect(typeof result.sock).toBe('string');
    }
  });
});

