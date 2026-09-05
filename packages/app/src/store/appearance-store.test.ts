import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveSystemMotion, useAppearanceStore, useAppearanceSync } from './appearance-store';

/**
 * Phase 46 Theme E — the `data-motion` write conflict.
 *
 * `useMotionPreference` (`app.tsx`) and `useAppearanceSync` both write the
 * same attribute; before this phase `useAppearanceSync` passed a literal
 * `'system'` straight through, which none of this app's own CSS guards ever
 * match. These tests drive `useAppearanceSync` in isolation — the fix that
 * matters for this app's CSS — and `useMotionPreference`'s half (deferring
 * to an explicit choice) is exercised together with it in `app.tsx`, which
 * this file does not mount.
 */
function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('resolveSystemMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves to reduced when the OS asks for it', () => {
    mockMatchMedia(true);
    expect(resolveSystemMotion()).toBe('reduced');
  });

  it('resolves to full when the OS does not ask for it', () => {
    mockMatchMedia(false);
    expect(resolveSystemMotion()).toBe('full');
  });

  it('falls back to full when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(resolveSystemMotion()).toBe('full');
  });
});

describe('useAppearanceSync (Phase 46 Theme E)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-motion');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("resolves 'system' against the OS query, never passing the literal string through", () => {
    mockMatchMedia(true);
    useAppearanceStore.setState({ motion: 'system' });

    renderHook(() => useAppearanceSync());

    // The bug this theme fixes: `applyMotion('system')` would have set this
    // literal string, which no `html[data-motion='reduced']` guard matches.
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
  });

  it('re-resolves against the current OS state the moment the setting switches back to system', () => {
    // The OS already prefers reduced motion when the switch happens — this is
    // the case that must not wait for the next `change` event to catch up.
    mockMatchMedia(true);
    useAppearanceStore.setState({ motion: 'full' });
    renderHook(() => useAppearanceSync());
    expect(document.documentElement.getAttribute('data-motion')).toBe('full');

    act(() => useAppearanceStore.setState({ motion: 'system' }));
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
  });

  it('applies an explicit choice verbatim, ignoring the OS query entirely', () => {
    mockMatchMedia(true); // OS asks for reduced motion...
    useAppearanceStore.setState({ motion: 'full' }); // ...but the user overrode it.

    renderHook(() => useAppearanceSync());

    expect(document.documentElement.getAttribute('data-motion')).toBe('full');
  });
});

describe('persist v1 -> v2 (Phase 64 Theme B)', () => {
  beforeEach(() => localStorage.clear());

  it('a real pre-Phase-64 (version 1) profile keeps its own eight fields untouched', () => {
    const migrate = useAppearanceStore.persist.getOptions().migrate;
    const preExisting = {
      accent: 'violet',
      motion: 'reduced',
      density: 'compact',
      uiFont: 'mono',
      background: 'dots',
      bgIntensity: 'bold',
      effects: { pageReveal: false, typewriter: true, glass: true },
      shimmer: 'rtl',
    };
    // v1 -> v2 changed nothing about THIS store's own shape (only the shared
    // key gained palette-store's fields) — migrate is a passthrough.
    expect(migrate?.(preExisting, 1)).toEqual(preExisting);
  });

  it('a real pre-Phase-64 localStorage blob round-trips through the real store unchanged', async () => {
    localStorage.setItem(
      'midnite.settings',
      JSON.stringify({
        state: {
          accent: 'emerald',
          motion: 'full',
          density: 'compact',
          uiFont: 'serif',
          background: 'grid',
          bgIntensity: 'subtle',
          effects: { pageReveal: true, typewriter: false, glass: false },
          shimmer: 'ltr',
        },
        version: 1,
      }),
    );
    await useAppearanceStore.persist.rehydrate();
    expect(useAppearanceStore.getState().accent).toBe('emerald');
    expect(useAppearanceStore.getState().density).toBe('compact');
    expect(useAppearanceStore.getState().uiFont).toBe('serif');
  });

  it('only serializes its own eight fields, never a sibling store\'s (partialize)', () => {
    const partialize = useAppearanceStore.persist.getOptions().partialize;
    const serialized = partialize?.(useAppearanceStore.getState());
    expect(Object.keys(serialized ?? {}).sort()).toEqual(
      ['accent', 'background', 'bgIntensity', 'density', 'effects', 'motion', 'shimmer', 'uiFont'].sort(),
    );
  });
});
