import { describe, expect, it } from 'vitest';
import { readSystemHealth } from './system-health';

describe('readSystemHealth', () => {
  it('returns structured health metrics without throwing', async () => {
    const health = await readSystemHealth();
    expect(health).toHaveProperty('git');
    expect(health).toHaveProperty('shell');
    expect(health).toHaveProperty('sshAgent');
    expect(health).toHaveProperty('cli');
  });
});
