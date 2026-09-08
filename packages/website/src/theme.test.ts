import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  STORAGE_KEY,
  applyTheme,
  cycleTheme,
  getStoredTheme,
  nextTheme,
  resolveTheme,
  setTheme,
} from './theme';

const resetDom = () => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('ws-auto-light');
};

beforeEach(resetDom);
afterEach(resetDom);

describe('nextTheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});

describe('getStoredTheme', () => {
  it('is system when nothing is stored', () => {
    expect(getStoredTheme()).toBe('system');
  });

  it('reads an explicit stored choice', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('falls back to system for a garbage stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'purple');
    expect(getStoredTheme()).toBe('system');
  });
});

describe('setTheme / applyTheme', () => {
  it('persists an explicit choice and sets data-theme', () => {
    setTheme('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('ws-auto-light')).toBe(false);
  });

  it('system clears the stored key and removes data-theme', () => {
    setTheme('light');
    setTheme('system');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('system toggles .ws-auto-light from the OS preference', () => {
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const original = window.matchMedia;
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;

    applyTheme('system');
    expect(document.documentElement.classList.contains('ws-auto-light')).toBe(true);

    window.matchMedia = original;
  });
});

describe('cycleTheme', () => {
  it('advances from whatever is currently stored and persists the result', () => {
    expect(getStoredTheme()).toBe('system');
    expect(cycleTheme()).toBe('light');
    expect(getStoredTheme()).toBe('light');
    expect(cycleTheme()).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
    expect(cycleTheme()).toBe('system');
    expect(getStoredTheme()).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('resolves an explicit theme to itself', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves system from matchMedia', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    expect(resolveTheme('system')).toBe('light');

    window.matchMedia = original;
  });
});
