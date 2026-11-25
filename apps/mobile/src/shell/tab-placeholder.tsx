import { EmptyState, useTheme } from '@bilo-io/ui-native';
import { View } from 'react-native';
import { Icon, type IconName } from '../ui/icons';

/** What a tab shows until its screen lands (Themes G to J replace these routes). */
export function TabPlaceholder({ title, icon }: { title: string; icon: IconName }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
      <EmptyState
        icon={<Icon name={icon} size={32} color={theme.colors.mutedForeground} />}
        title={title}
        body="Coming soon"
      />
    </View>
  );
}
