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
