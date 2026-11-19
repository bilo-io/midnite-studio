// A test harness for the shell: the real provider tree over a fake data source, signed in, plus a probe that reads the
// shell state. Phase 146 Theme F.
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { AppProviders } from '../src/providers/app-providers';
import type { MobileDataSource } from '../src/data/source';
import { DEFAULT_PREFS, PREFS_KEY, usePrefs } from '../src/state/prefs';
import { ShellProvider, useShell } from '../src/shell/shell-context';
import { store } from './mocks/expo-secure-store';

export const fakeSource = (over: Record<string, unknown>) => over as unknown as MobileDataSource;

export function resetShellState(prefs: Partial<typeof DEFAULT_PREFS> = {}) {
  store.clear();
  store.set('midnite:active-login', 'octo');
  store.set('github:github.com:octo', 'ghp_FAKE');
  // AppProviders hydrates from the store on mount, so the prefs go there as well as into the live store.
  store.set(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, ...prefs }));
  usePrefs.setState({ ...DEFAULT_PREFS, ...prefs, hydrated: true });
}

/** Prints which overlays are open, so a test asserts on text rather than on component internals. */
export function ShellProbe() {
  const s = useShell();
  return <Text testID="probe">{`panel:${s.panelOpen} switcher:${s.switcherOpen} dial:${s.dialOpen}`}</Text>;
}

/** Renders and waits for the AuthGate to let the tree through (the session read is async). */
export async function renderInShell(ui: ReactNode, source: Record<string, unknown> = {}) {
  const view = render(
    <AppProviders source={fakeSource(source)}>
      <ShellProvider>
        {ui}
        <ShellProbe />
      </ShellProvider>
    </AppProviders>,
  );
  await screen.findByTestId('probe');
  return view;
}

/** Buttons that open each overlay, standing in for the title bar and FAB in isolated tests. */
export function Openers() {
  const s = useShell();
  return (
    <>
      <Pressable accessibilityLabel="open-switcher" onPress={() => s.setSwitcherOpen(true)}>
        <Text>open-switcher</Text>
      </Pressable>
      <Pressable accessibilityLabel="open-panel" onPress={() => s.setPanelOpen(true)}>
        <Text>open-panel</Text>
      </Pressable>
    </>
  );
}
