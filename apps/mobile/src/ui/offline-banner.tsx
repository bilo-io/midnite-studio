// The app-wide offline banner (Phase 146 L4): under the AppBar, `accents.status.wip`-tinted, shown after two consecutive
// `network` failures and hidden on the next success (see data/network-status).
import { useTheme } from '@bilo-io/ui-native';
import { Text, View } from 'react-native';
import { useNetworkStatus } from '../data/network-status';
import { Icon } from './icons';

export function OfflineBanner() {
  const theme = useTheme();
  const offline = useNetworkStatus((s) => s.offline);
  if (!offline) return null;
  return (
    <View
      accessibilityRole="alert"
      testID="offline-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[2],
        paddingHorizontal: theme.space[4],
        paddingVertical: theme.space[2],
        backgroundColor: theme.accents.status.wip,
      }}
    >
      <Icon name="offline" size={16} />
      <Text maxFontSizeMultiplier={1.4} style={[theme.type.sm, { flex: 1, color: theme.colors.foreground }]}>
        You're offline. Showing what was loaded.
      </Text>
    </View>
  );
}
