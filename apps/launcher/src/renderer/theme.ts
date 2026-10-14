import type { ThemeSource } from '../common/bridge';
import { getBridge } from './bridge';

/**
 * The launcher's theme: System (follow macOS), Light or Dark.
 *
 * Applied in two places. `data-theme` on <html> picks the CSS tokens
 * (`styles.css`); the bridge sets Electron's `nativeTheme.themeSource` so the
 * parts Chromium draws natively — the sort dropdown, scrollbars, the window's
 * own chrome — agree with the page. Remembered per machine in localStorage.
 */

export const THEME_KEY = 'midnite-launcher.theme';

export function readTheme(): ThemeSource {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: ThemeSource): void {
  if (theme === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
  getBridge().theme.set(theme);
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // remembering is a convenience; the theme still applies for this session
  }
}
