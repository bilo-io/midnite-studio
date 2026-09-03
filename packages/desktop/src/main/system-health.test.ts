import { describe, expect, it } from 'vitest';
import { readSystemHealth } from './system-health';

describe('readSystemHealth', () => {
  // A smoke test against the real probes, so it shells out to `git --version`
  // and `ssh-add -l`. Each is bounded to PROBE_TIMEOUT_MS (4s) in the source, so
  // the worst case is two sequential 4s probes; the default 5s vitest budget was
  // too tight for that under CI spawn contention and flaked. 15s clears both
  // probes plus process-spawn latency with room to spare.
  it('returns structured health metrics without throwing', async () => {
    const health = await readSystemHealth();
    expect(health).toHaveProperty('git');
    expect(health).toHaveProperty('shell');
    expect(health).toHaveProperty('sshAgent');
    expect(health).toHaveProperty('cli');
  }, 15_000);
});
