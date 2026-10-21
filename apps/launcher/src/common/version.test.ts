import { describe, expect, it } from 'vitest';

import type { StudioStatus } from './bridge';
import { installState } from './status';
import { compareVersions } from './version';

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    expect(compareVersions('0.10.0', '0.9.2')).toBe(1);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
  });
});

describe('installState', () => {
  const base: StudioStatus = { installed: null, latest: null, feedError: null, running: false, checkedAt: 0 };
  const latest = { version: '0.4.1', releasedAt: null, notesUrl: null };

  it('derives every tile state from Studio', () => {
    expect(installState(null)).toBe('checking');
    expect(installState(base)).toBe('not-installed');
    expect(installState({ ...base, installed: { path: '/A', version: '0.4.1' }, latest })).toBe('installed');
    expect(installState({ ...base, installed: { path: '/A', version: '0.3.2' }, latest })).toBe('update');
    // Offline, or an unversioned bundle: installed, never a phantom update.
    expect(installState({ ...base, installed: { path: '/A', version: '0.3.2' } })).toBe('installed');
    expect(installState({ ...base, installed: { path: '/A', version: null }, latest })).toBe('installed');
  });
});
