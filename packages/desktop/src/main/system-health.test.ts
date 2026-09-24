import { describe, expect, it } from 'vitest';
import { probeBinary, readSystemHealth } from './system-health';

describe('readSystemHealth', () => {
  // A smoke test against the real probes, bounded to PROBE_TIMEOUT_MS in the source.
  it('returns structured health metrics without throwing', async () => {
    const health = await readSystemHealth();
    expect(health).toHaveProperty('git');
    expect(health).toHaveProperty('shell');
    expect(health).toHaveProperty('sshAgent');
    expect(health).toHaveProperty('cli');
    expect(health).toHaveProperty('homebrew');
    expect(health).toHaveProperty('node');
    expect(health).toHaveProperty('pnpm');
    expect(health).toHaveProperty('moon');
    expect(health).toHaveProperty('ollama');
    expect(health.ollamaDaemon).toBeDefined();
    expect(typeof health.ollamaDaemon?.reachable).toBe('boolean');
  }, 15_000);
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
