import { describe, expect, it } from 'vitest';
import { checkLockstep } from './version-check.mjs';

describe('checkLockstep', () => {
  it('passes when every package shares one MAJOR.MINOR', () => {
    const result = checkLockstep([
      { name: '@midnite/studio', version: '0.1.0' },
      { name: '@midnite/studio-shared', version: '0.1.0' },
      { name: '@midnite/studio-desktop', version: '0.1.0' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/OK/);
  });

  it('passes when only PATCH diverges (a grouping, not pairwise equality)', () => {
    const result = checkLockstep([
      { name: '@midnite/studio', version: '0.1.0' },
      { name: '@midnite/studio-shared', version: '0.1.0' },
      { name: '@midnite/studio-desktop', version: '0.1.3' },
      { name: '@midnite/studio-app', version: '0.1.7' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('fails when a MINOR diverges, naming every offending package', () => {
    const result = checkLockstep([
      { name: '@midnite/studio', version: '0.1.0' },
      { name: '@midnite/studio-shared', version: '0.1.0' },
      { name: '@midnite/studio-desktop', version: '0.2.0' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('@midnite/studio-desktop@0.2.0');
    expect(result.message).toContain('@midnite/studio@0.1.0');
    expect(result.message).toContain('<-- diverges');
  });

  it('fails when a MAJOR diverges', () => {
    const result = checkLockstep([
      { name: '@midnite/studio', version: '0.1.0' },
      { name: '@midnite/studio-shared', version: '1.0.0' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('reports a missing package rather than silently skipping it', () => {
    const result = checkLockstep([
      { name: '@midnite/studio', version: '0.1.0' },
      { name: '@midnite/studio-shared', version: null },
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('@midnite/studio-shared: missing or unreadable "version" field');
  });

  it('reports an invalid (non-semver) version by name', () => {
    const result = checkLockstep([
      { name: '@midnite/studio', version: '0.1' },
      { name: '@midnite/studio-shared', version: '0.1.0' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('@midnite/studio: invalid version "0.1"');
  });

  it('names the majority bucket as the baseline when reporting a split', () => {
    const result = checkLockstep([
      { name: 'a', version: '0.1.0' },
      { name: 'b', version: '0.1.0' },
      { name: 'c', version: '0.1.0' },
      { name: 'd', version: '0.2.0' },
    ]);
    expect(result.ok).toBe(false);
    // The 0.1.x bucket (3 packages) is the baseline; 0.2.x (1 package) diverges.
    const lines = result.message.split('\n');
    const majorityLine = lines.find((l) => l.includes('0.1.x:'));
    const minorityLine = lines.find((l) => l.includes('0.2.x:'));
    expect(majorityLine).not.toContain('<-- diverges');
    expect(minorityLine).toContain('<-- diverges');
  });

  it('is trivially ok for a single package', () => {
    expect(checkLockstep([{ name: 'solo', version: '0.1.0' }]).ok).toBe(true);
  });

  it('is trivially ok for an empty list', () => {
    expect(checkLockstep([]).ok).toBe(true);
  });
});
