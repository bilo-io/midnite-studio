import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSuitePrefs, type SuitePrefsSnapshot } from '@midnite/studio-shared';

import { useAppearanceStore, useAppearanceSync } from './appearance-store';
import { resetSuitePrefsStorage } from './suite-prefs-storage';

/**
 * Phase 123 Theme L.2 — the suite stores persist through the suite-prefs file and re-hydrate on
 * `suitePrefsChanged`. A fake bridge stands in for the runtime's file service.
 */
function snapshotWith(accent: string | null): SuitePrefsSnapshot {
  const prefs = defaultSuitePrefs();
  if (accent) prefs.appearance = { ...prefs.appearance, accent: accent as never };
  return { prefs, stored: accent ? ['appearance'] : [] };
}

function installBridge(initial: SuitePrefsSnapshot) {
  let current = initial;
  let listener: ((s: SuitePrefsSnapshot) => void) | undefined;
  const set = vi.fn(async (req: { key: string; value: unknown }) => {
    const prefs = { ...current.prefs, [req.key]: req.value } as SuitePrefsSnapshot['prefs'];
    current = { prefs, stored: [...new Set([...current.stored, req.key])] as never };
    return { ok: true as const, snapshot: current };
  });
  window.midniteStudio = {
    suitePrefs: {
      get: vi.fn(async () => current),
      set,
      onChanged: (fn: (s: SuitePrefsSnapshot) => void) => {
        listener = fn;
        return () => {
          listener = undefined;
        };
      },
    },
  } as never;
  return {
    set,
    emit: (next: SuitePrefsSnapshot) => {
      current = next;
      listener?.(next);
    },
  };
}

describe('suite-prefs storage (L.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSuitePrefsStorage();
    useAppearanceStore.setState({ accent: 'default' });
  });
  afterEach(() => {
    cleanup();
    delete (window as { midniteStudio?: unknown }).midniteStudio;
    document.documentElement.removeAttribute('data-accent');
  });

  it('writes a change to the file group, not to localStorage', async () => {
    const { set } = installBridge(snapshotWith('blue'));
    localStorage.clear();
    useAppearanceStore.getState().setAccent('violet');
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    expect(set.mock.calls[0]?.[0].key).toBe('appearance');
    expect((set.mock.calls[0]?.[0].value as { accent: string }).accent).toBe('violet');
    expect(localStorage.getItem('midnite.settings')).toBeNull();
  });

  it('hydrates from the file group when it holds one', async () => {
    installBridge(snapshotWith('emerald'));
    await useAppearanceStore.persist.rehydrate();
    expect(useAppearanceStore.getState().accent).toBe('emerald');
  });

  it('falls back to the old localStorage blob when the file holds no appearance group', async () => {
    installBridge(snapshotWith(null));
    localStorage.setItem(
      'midnite.settings',
      JSON.stringify({ state: { accent: 'rose' }, version: 2 }),
    );
    await useAppearanceStore.persist.rehydrate();
    expect(useAppearanceStore.getState().accent).toBe('rose');
  });

  it('a suitePrefsChanged with a new accent updates the store and the data-accent attribute', async () => {
    const bridge = installBridge(snapshotWith('blue'));
    await useAppearanceStore.persist.rehydrate();
    renderHook(() => useAppearanceSync());
    await act(async () => {
      bridge.emit(snapshotWith('amber'));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(useAppearanceStore.getState().accent).toBe('amber'));
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('data-accent')).toBe('amber'),
    );
  });

  it('does not write back an echo of what the file already holds', async () => {
    const bridge = installBridge(snapshotWith('blue'));
    await useAppearanceStore.persist.rehydrate();
    renderHook(() => useAppearanceSync());
    await act(async () => {
      bridge.emit(snapshotWith('cyan'));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(useAppearanceStore.getState().accent).toBe('cyan'));
    expect(bridge.set).not.toHaveBeenCalled();
  });
});
