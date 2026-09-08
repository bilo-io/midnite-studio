import { useSyncExternalStore } from 'react';

/**
 * The nav's theme switcher, and the state behind it.
 *
 * Three states: `system` (the default — follows the OS) cycles to `light`
 * cycles to `dark` cycles back to `system`. An explicit choice is persisted
 * under `STORAGE_KEY`; `system` is the *absence* of that key, not a stored
 * value, so a visitor who never touches the toggle never writes anything.
 *
 * `applyTheme` is the one function that touches the DOM, and it is the same
 * function the no-flash inline script in `index.html`/`download/index.html`
 * re-implements by hand (it cannot import this module — it has to run before
 * any module does) — see `tokens.css`'s file-level comment for why an
 * explicit choice sets `data-theme` while `system` instead toggles
 * `.ws-auto-light`, computed from `matchMedia` rather than left to a bare
 * `prefers-color-scheme` query: a query can't be overridden by an explicit
 * choice, only `system` is allowed to consult the OS at all.
 */
export type Theme = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const STORAGE_KEY = 'midnite-studio.website.theme';

const CYCLE_ORDER: readonly Theme[] = ['system', 'light', 'dark'];
const LIGHT_QUERY = '(prefers-color-scheme: light)';

const isExplicitTheme = (value: string | null): value is Exclude<Theme, 'system'> =>
  value === 'light' || value === 'dark';

/** The stored choice, or `'system'` when nothing (or something invalid) is stored. */
export const getStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isExplicitTheme(stored) ? stored : 'system';
  } catch {
    // Storage can throw — Safari private mode, a full quota, a locked-down
    // embed. `system` is the correct fallback in every one of those cases.
    return 'system';
  }
};

/** `system → light → dark → system`. */
export const nextTheme = (current: Theme): Theme => {
  const index = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length]!;
};

const systemPrefersLight = (): boolean =>
  typeof matchMedia === 'function' && matchMedia(LIGHT_QUERY).matches;

/** `system` resolved against the OS; an explicit theme resolves to itself. */
export const resolveTheme = (theme: Theme): ResolvedTheme =>
  theme === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : theme;

/**
 * Sets `data-theme`/`.ws-auto-light` on `<html>` to match `theme`. Does not
 * touch storage — call `setTheme` for the persisted, notifying version.
 */
export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    root.classList.toggle('ws-auto-light', systemPrefersLight());
  } else {
    root.setAttribute('data-theme', theme);
    root.classList.remove('ws-auto-light');
  }
};

const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((listener) => listener());

/** Persists `theme` (or clears the key for `system`), applies it, and notifies every `useTheme`. */
export const setTheme = (theme: Theme): void => {
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The in-memory apply below still runs even if persistence failed.
  }
  applyTheme(theme);
  notify();
};

/** Advances to the next theme in the cycle and returns it. */
export const cycleTheme = (): Theme => {
  const next = nextTheme(getStoredTheme());
  setTheme(next);
  return next;
};

let mediaListenerAttached = false;
const ensureMediaListenerAttached = (): void => {
  if (mediaListenerAttached || typeof matchMedia !== 'function') return;
  mediaListenerAttached = true;
  // Only `system` visitors are listening to the OS at all — an explicit
  // choice never re-derives from this, on purpose.
  matchMedia(LIGHT_QUERY).addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system');
    notify();
  });
};

const subscribe = (onStoreChange: () => void): (() => void) => {
  ensureMediaListenerAttached();
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
};

/** The current theme (`'system'` unless the visitor made an explicit choice), live. */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, getStoredTheme);

/** `'light' | 'dark'` — `useTheme()` resolved against the OS when it is `'system'`. */
export const useResolvedTheme = (): ResolvedTheme => resolveTheme(useTheme());
