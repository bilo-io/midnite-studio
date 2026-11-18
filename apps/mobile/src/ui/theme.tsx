// Theme seam (Phase 146 B). @bilo-io/ui-native is not published yet; once ^0.5.0 lands (Theme A) this module
// re-exports its ThemeProvider and tokens and nothing else in the app changes.
import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export interface Theme {
  scheme: 'light' | 'dark';
  background: string;
  foreground: string;
}

const DARK: Theme = { scheme: 'dark', background: '#0a0a0a', foreground: '#fafafa' };
const LIGHT: Theme = { scheme: 'light', background: '#ffffff', foreground: '#0a0a0a' };

const ThemeContext = createContext<Theme>(DARK);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  return <ThemeContext.Provider value={scheme === 'light' ? LIGHT : DARK}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
