import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, SESSION_ENDED_NOTICE, useAuth } from '../auth/auth-context';
import { AuthGate } from '../auth/auth-gate';
import { DataSourceProvider } from '../data/source-context';
import type { MobileDataSource } from '../data/source';
import { ThemeProvider } from '@bilo-io/ui-native';
import { usePrefs } from '../state/prefs';
import { createQueryClient } from './query-client';

function QueryAndData({ children, source }: { children: ReactNode; source?: MobileDataSource }) {
  const auth = useAuth();
  const signOutRef = useRef(auth.signOut);
  signOutRef.current = auth.signOut;
  const [client] = useState(() =>
    createQueryClient({
      onAuthError: () => {
        void signOutRef.current(SESSION_ENDED_NOTICE);
        // Nothing cached for the ended session may outlive it.
        client.clear();
      },
    }),
  );
  return (
    <QueryClientProvider client={client}>
      <DataSourceProvider source={source}>
        <AuthGate>{children}</AuthGate>
      </DataSourceProvider>
    </QueryClientProvider>
  );
}

/** ui-native's ThemeProvider, pinned to the user's theme preference (system follows the device). */
function PrefsTheme({ children }: { children: ReactNode }) {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    void usePrefs.getState().hydrate();
  }, []);
  return <ThemeProvider scheme={theme === 'system' ? undefined : theme}>{children}</ThemeProvider>;
}

/** `source` overrides the GitHub source (tests, and a future desktop-paired source). */
export function AppProviders({ children, source }: { children: ReactNode; source?: MobileDataSource }) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <PrefsTheme>
          <AuthProvider>
            <QueryAndData source={source}>{children}</QueryAndData>
          </AuthProvider>
        </PrefsTheme>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
