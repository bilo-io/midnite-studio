import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@bilo-io/ui/theme';

import { ThemeToggle } from './theme-toggle';

/**
 * `theme-toggle.tsx`'s four options resolve through `@bilo-io/ui`'s
 * `ThemeProvider` — this app deliberately does not reimplement it (Phase 64
 * Decision 7) — but nothing in this repo asserted any of the four actually
 * reach the right resolved theme end to end. `light` and `dark` are
 * pass-through; `system` resolves off `matchMedia`; `time` resolves off the
 * system clock (light 08:00-18:00, dark otherwise — this file's own comment
 * on `OPTIONS`). Phase 64 Theme G's own verification item calls `time` out
 * as the mode most likely to be untested, and it was: `appearance-page.test.tsx`
 * asserts all four render as options, never that any of them actually resolves.
 */
let systemPrefersDark = false;

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

function selectOption(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: label }));
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

describe('ThemeToggle — all four modes resolve (Phase 64 Theme G)', () => {
  beforeEach(() => {
    systemPrefersDark = false;
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.cssText = '';
    // `ThemeProvider` reads `matchMedia(...).matches` synchronously, both on
    // mount and whenever `setPreference('system')` runs — a getter, not a
    // snapshot, so flipping `systemPrefersDark` between tests (or before the
    // click, in the "both ways" cases below) is enough; no event needs firing.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return systemPrefersDark;
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves "light" to the light theme', () => {
    renderToggle();
    selectOption('Light');
    expect(isDark()).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('resolves "dark" to the dark theme', () => {
    renderToggle();
    selectOption('Dark');
    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('resolves "system" to dark when the OS prefers dark', () => {
    systemPrefersDark = true;
    renderToggle();
    selectOption('System');
    expect(isDark()).toBe(true);
  });

  it('resolves "system" to light when the OS does not prefer dark', () => {
    systemPrefersDark = false;
    renderToggle();
    selectOption('System');
    expect(isDark()).toBe(false);
  });

  it('resolves "time" to light inside the 08:00-18:00 window', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-01T10:00:00'));
    renderToggle();
    selectOption('Time of day');
    expect(isDark()).toBe(false);
  });

  it('resolves "time" to dark outside the 08:00-18:00 window', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-01T22:00:00'));
    renderToggle();
    selectOption('Time of day');
    expect(isDark()).toBe(true);
  });
});
