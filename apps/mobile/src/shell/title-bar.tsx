// The title bar (Phase 146 F2): a fixed 56dp AppBar on every tab. Panel toggle, `owner/name` over the branch (press it
// for the repo switcher), the screen's own action, then the viewer's avatar.
import { AppBar, Avatar, IconButton, useTheme } from '@bilo-io/ui-native';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-context';
import { useViewer } from '../data/queries';
import { repoKey } from '../state/prefs';
import { Icon } from '../ui/icons';
import { useShell } from './shell-context';
import { useCurrentRepo } from './use-current-repo';

export const NO_REPO_TITLE = 'Choose a repository';

export function TitleBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { setPanelOpen, setSwitcherOpen, action } = useShell();
  const { repo, branch } = useCurrentRepo();
  const viewer = useViewer();
  const auth = useAuth();
  const login = auth.state.status === 'signed-in' ? auth.state.login : '';
  // Landscape phone: the branch moves into the title and the subtitle goes, to keep the bar one line.
  const landscape = width > height;
  const name = repo ? repoKey(repo) : NO_REPO_TITLE;
  const title = repo && landscape && branch ? `${name} · ${branch}` : name;
  const subtitle = repo && !landscape ? (branch ?? undefined) : undefined;

  const titleNode = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
      <Text
        numberOfLines={1}
        ellipsizeMode="middle"
        maxFontSizeMultiplier={1.4}
        style={[theme.type.base, { flexShrink: 1, color: theme.colors.foreground, fontWeight: theme.font.semibold }]}
      >
        {title}
      </Text>
      <Icon name="chevronDown" size={16} color={theme.colors.mutedForeground} />
    </View>
  );

  return (
    <AppBar
      testID="title-bar"
      insetTop={insets.top}
      leading={
        <IconButton
          icon={<Icon name="panel" color={theme.colors.foreground} />}
          label="Open forge panel"
          size={40}
          onPress={() => setPanelOpen(true)}
        />
      }
      title={titleNode}
      subtitle={subtitle}
      onTitlePress={() => setSwitcherOpen(true)}
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          {action}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            hitSlop={theme.space[2]}
            // More ▸ Accounts lands with Theme J; until then this opens the More tab.
            onPress={() => router.navigate('/(tabs)/more' as Href)}
          >
            <Avatar name={viewer.data?.name ?? viewer.data?.login ?? login} uri={viewer.data?.avatarUrl ?? undefined} size={32} />
          </Pressable>
        </View>
      }
    />
  );
}
