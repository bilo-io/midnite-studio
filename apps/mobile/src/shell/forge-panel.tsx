// The forge panel (Phase 146 F4): a left Sheet with the account header, the current repo and three disabled rows.
// A placeholder: it mirrors desktop's left repos panel and grows in a later phase (branches, remotes, forge accounts).
import { Avatar, Badge, ListRow, Sheet, useTheme } from '@bilo-io/ui-native';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-context';
import { ACCOUNT_HOST } from '../auth/token-store';
import { useViewer } from '../data/queries';
import { repoKey } from '../state/prefs';
import { useShell } from './shell-context';
import { useCurrentRepo } from './use-current-repo';

const COMING_SOON = ['Branches', 'Remotes', 'Forge accounts'] as const;

function Heading({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      style={[
        theme.type.xs,
        {
          color: theme.colors.mutedForeground,
          fontWeight: theme.font.semibold,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: theme.space[6],
          paddingTop: theme.space[4],
          paddingBottom: theme.space[2],
        },
      ]}
    >
      {children}
    </Text>
  );
}

export function ForgePanel() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { panelOpen, setPanelOpen } = useShell();
  const { repo } = useCurrentRepo();
  const viewer = useViewer();
  const auth = useAuth();
  const login = viewer.data?.login ?? (auth.state.status === 'signed-in' ? auth.state.login : '');

  return (
    <Sheet
      open={panelOpen}
      onOpenChange={setPanelOpen}
      side="left"
      insetTop={insets.top}
      insetBottom={insets.bottom}
      testID="forge-panel"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], padding: theme.space[6] }}>
        <Avatar name={viewer.data?.name ?? login} uri={viewer.data?.avatarUrl ?? undefined} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[theme.type.base, { color: theme.colors.foreground, fontWeight: theme.font.semibold }]}>
            {login}
          </Text>
          <Text numberOfLines={1} style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>{`@${ACCOUNT_HOST}`}</Text>
        </View>
      </View>
      <Heading>Repository</Heading>
      <ListRow title={repo ? repoKey(repo) : 'No repository selected'} divider={false} />
      <Heading>Forge</Heading>
      {COMING_SOON.map((title, i) => (
        <ListRow
          key={title}
          title={title}
          trailing={<Badge>Coming soon</Badge>}
          divider={i < COMING_SOON.length - 1}
          style={{ opacity: 0.6 }}
        />
      ))}
    </Sheet>
  );
}
