// The More tab (Phase 146 J4): Accounts, Appearance and About, as grouped rows in inset cards.
import { Avatar, Button, ListRow, SegmentedControl, useTheme } from '@bilo-io/ui-native';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { openInAppBrowser } from '../agents/open-provider';
import { useAuth } from '../auth/auth-context';
import { useViewer } from '../data/queries';
import { usePrefs } from '../state/prefs';
import { useTokenScopes } from './token-scopes';

export const REPORT_ISSUE_URL = 'https://github.com/bilo-io/midnite-apps/issues/new';
/** The ui-native release the app is built against (a vendored stand-in until it is published). */
export const UI_NATIVE_VERSION = '0.5.0';

const THEMES = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.xs, { color: theme.colors.mutedForeground, fontWeight: theme.font.semibold, textTransform: 'uppercase', paddingHorizontal: theme.space[2] }]}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function MoreScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const client = useQueryClient();
  const viewer = useViewer();
  const scopes = useTokenScopes();
  const appTheme = usePrefs((s) => s.theme);
  const [reportFailed, setReportFailed] = useState(false);

  const login = auth.state.status === 'signed-in' ? auth.state.login : '';
  const scopeText = scopes.data?.kind === 'scopes' ? scopes.data.scopes.join(', ') : scopes.isLoading ? '…' : scopes.isError ? 'Unavailable' : 'Fine-grained token';
  const version = Constants.expoConfig?.version ?? '—';
  const sdk = Constants.expoConfig?.sdkVersion?.split('.')[0] ?? '—';

  const signOut = async () => {
    // The keychain entry goes first, then nothing cached for the account may outlive it.
    await auth.signOut();
    client.clear();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.space[4], gap: theme.space[5] }}
    >
      <Section title="Accounts">
        <ListRow
          testID="account-row"
          title={viewer.data?.name ?? login}
          subtitle={`@${login}`}
          leading={<Avatar name={viewer.data?.name ?? login} uri={viewer.data?.avatarUrl ?? undefined} size={40} />}
        />
        <ListRow title="Token scopes" meta={scopeText} divider={false} />
        <View style={{ padding: theme.space[4] }}>
          <Button variant="destructive" onPress={() => void signOut()} accessibilityLabel="Sign out">
            Sign out
          </Button>
        </View>
      </Section>
      <Section title="Appearance">
        <View style={{ padding: theme.space[4] }}>
          <SegmentedControl
            accessibilityLabel="Theme"
            segments={THEMES}
            value={appTheme}
            onChange={(key) => usePrefs.getState().setTheme(key as 'system' | 'light' | 'dark')}
          />
        </View>
      </Section>
      <Section title="About">
        <ListRow title="Version" meta={version} />
        <ListRow title="Expo SDK" meta={sdk} />
        <ListRow title="ui-native" meta={UI_NATIVE_VERSION} />
        <ListRow
          title="Report an issue"
          meta={reportFailed ? "Couldn't open" : undefined}
          divider={false}
          onPress={() => {
            setReportFailed(false);
            void openInAppBrowser(REPORT_ISSUE_URL, theme.colors).then((r) => setReportFailed(!r.ok));
          }}
        />
      </Section>
    </ScrollView>
  );
}
