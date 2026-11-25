import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { type ColorScheme, createTheme, type Theme } from './palette';

const ThemeContext = createContext<Theme | null>(null);

// On the web (react-native-web) the brand face is whatever `@bilo-io/ui/brand.css`
// registered, and an unknown family there falls back silently. On iOS an
// unregistered family is a red-box error, so native gets the platform face
// unless the app says it loaded Damion.
const DEFAULT_BRAND_FONT = Platform.OS === 'web' ? "'Damion', cursive" : undefined;

const fallback: Record<ColorScheme, Theme> = {
  light: createTheme('light', { brandFontFamily: DEFAULT_BRAND_FONT }),
  dark: createTheme('dark', { brandFontFamily: DEFAULT_BRAND_FONT }),
};

const resolve = (scheme: string | null | undefined): ColorScheme =>
  scheme === 'dark' ? 'dark' : 'light';

export type ThemeProviderProps = {
  /** Pin light or dark. Omit to follow the device (`useColorScheme`). */
  scheme?: ColorScheme;
  /**
   * The family name the app registered Damion under (e.g. with expo-font). On
   * native, omit it until the font is loaded.
   */
  brandFontFamily?: string;
  children: ReactNode;
};

/**
 * Light/dark for every component below it, from the @bilo-io/ui tokens. It
 * follows the device scheme unless `scheme` pins one, so a host app with its own
 * theme switch passes its resolved value down.
 */
export function ThemeProvider({
  scheme,
  brandFontFamily = DEFAULT_BRAND_FONT,
  children,
}: ThemeProviderProps) {
  const system = useColorScheme();
  const resolved = scheme ?? resolve(system);
  const theme = useMemo(
    () => createTheme(resolved, { brandFontFamily }),
    [resolved, brandFontFamily],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The active theme. Without a provider, the device scheme's. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  const system = useColorScheme();
  return theme ?? fallback[resolve(system)];
}
