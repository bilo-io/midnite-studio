import { describe, expect, it } from 'vitest';

import type { AppsStatus, StudioStatus } from './bridge';
import { deriveAppState } from './status';

const studio = (installed: string | null, latest: string | null = '0.4.1'): StudioStatus => ({
  installed: installed === null ? null : { path: '/Applications/Midnite Studio.app', version: installed },
  latest: latest === null ? null : { version: latest, releasedAt: null, notesUrl: null },
  feedError: null,
  running: false,
  checkedAt: 0,
});

const apps = (over: Partial<AppsStatus> = {}): AppsStatus => ({
  runtimeVersion: '0.4.1',
  canManageBundles: true,
  installed: [],
  catalog: { runtimeVersion: '0.4.1', apps: [{ id: 'gamer', version: '0.4.1' }] },
  ...over,
});

describe('deriveAppState', () => {
  it("Studio's own tile reads Studio's install, whatever the bundles say", () => {
    expect(deriveAppState('studio', studio(null), apps()).state).toBe('not-installed');
    expect(deriveAppState('studio', studio('0.4.1'), apps()).state).toBe('installed');
    expect(deriveAppState('studio', studio('0.3.0'), apps()).state).toBe('update');
    expect(deriveAppState('studio', null, null).state).toBe('checking');
  });

  it('is Installed when the recorded bundle matches the catalog and the runtime', () => {
    const state = deriveAppState(
      'gamer',
      studio(null),
      apps({ installed: [{ id: 'gamer', version: '0.4.1', runtimeVersion: '0.4.1' }] }),
    );
    expect(state).toMatchObject({ state: 'installed', source: 'bundle', version: '0.4.1', latest: '0.4.1' });
  });

  it('is Installed from the bundle even when Studio is not installed', () => {
    const state = deriveAppState('gamer', studio(null), apps({ installed: [{ id: 'gamer', version: '0.4.1', runtimeVersion: '0.4.1' }] }));
    expect(state.state).toBe('installed');
    expect(state.studioFallback).toBe(false);
  });

  it('is Update when the catalog publishes a different version (lockstep mismatch included)', () => {
    const newer = apps({ installed: [{ id: 'gamer', version: '0.4.0', runtimeVersion: '0.4.1' }] });
    expect(deriveAppState('gamer', studio('0.4.1'), newer)).toMatchObject({ state: 'update', version: '0.4.0', latest: '0.4.1' });
    const older = apps({ installed: [{ id: 'gamer', version: '0.4.2', runtimeVersion: '0.4.1' }] });
    expect(deriveAppState('gamer', studio('0.4.1'), older).state).toBe('update');
  });

  it('is Update with the lockstep reason when the bundle is not the runtime version, even with no catalog', () => {
    const behind = apps({ catalog: null, installed: [{ id: 'gamer', version: '0.4.0', runtimeVersion: '0.4.1' }] });
    expect(deriveAppState('gamer', null, behind)).toMatchObject({ state: 'update', lockstep: 'bundle-behind' });
    const ahead = apps({ catalog: null, installed: [{ id: 'gamer', version: '0.5.0', runtimeVersion: '0.4.1' }] });
    expect(deriveAppState('gamer', null, ahead)).toMatchObject({ state: 'update', lockstep: 'bundle-ahead' });
    const ok = apps({ installed: [{ id: 'gamer', version: '0.4.1', runtimeVersion: '0.4.1' }] });
    expect(deriveAppState('gamer', null, ok).lockstep).toBeNull();
  });

  it('is Update when its stub was cloned from another runtime', () => {
    const stale = apps({ installed: [{ id: 'gamer', version: '0.4.1', runtimeVersion: '0.4.0' }] });
    expect(deriveAppState('gamer', null, stale).state).toBe('update');
  });

  it('is Installed with no catalog, judging the stub against the running runtime', () => {
    const offline = apps({ catalog: null, installed: [{ id: 'gamer', version: '0.4.1', runtimeVersion: '0.4.1' }] });
    expect(deriveAppState('gamer', null, offline)).toMatchObject({ state: 'installed', latest: null });
    const stale = apps({ catalog: null, installed: [{ id: 'gamer', version: '0.4.1', runtimeVersion: '0.3.9' }] });
    expect(deriveAppState('gamer', null, stale).state).toBe('update');
  });

  it('is Not installed when the catalog publishes it and no bundle is recorded, noting the Studio fallback', () => {
    expect(deriveAppState('gamer', studio('0.4.1'), apps())).toMatchObject({
      state: 'not-installed',
      source: 'bundle',
      latest: '0.4.1',
      studioFallback: true,
    });
    expect(deriveAppState('gamer', studio(null), apps()).studioFallback).toBe(false);
  });

  it("falls back to Studio's state for an app nothing has published (missing catalog or no entry)", () => {
    expect(deriveAppState('agents', studio('0.4.1'), apps())).toMatchObject({ state: 'installed', source: 'studio' });
    expect(deriveAppState('agents', studio(null), apps({ catalog: null }))).toMatchObject({ state: 'not-installed', source: 'studio' });
    expect(deriveAppState('agents', studio('0.3.0'), apps({ catalog: null })).state).toBe('update');
  });

  it('is Checking until the bundle status arrives', () => {
    expect(deriveAppState('gamer', studio('0.4.1'), null).state).toBe('checking');
  });

  it('is Coming soon for apps marked comingSoon, regardless of Studio or bundles', () => {
    const state = deriveAppState('science', studio('0.4.1'), apps());
    expect(state).toMatchObject({ state: 'coming-soon', studioFallback: false });
    expect(deriveAppState('startup', null, null).state).toBe('coming-soon');
  });

  it('resolves Vanguard as a live Studio-hosted app', () => {
    expect(deriveAppState('vanguard', studio('0.4.1'), apps())).toMatchObject({
      state: 'installed',
      source: 'studio',
      studioFallback: true,
    });
  });
});
