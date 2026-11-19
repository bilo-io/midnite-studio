// The quick-access FAB (Phase 146 F5): ui-native's SpeedDial, mounted once in the tabs layout above the BottomNav and
// hidden on any route that is not a top-level tab. It mirrors desktop's quick-access leaves.
import { SpeedDial, useTheme, type SpeedDialAction } from '@bilo-io/ui-native';
import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrefs } from '../state/prefs';
import { ICONS, Icon } from '../ui/icons';
import { useShell } from './shell-context';
import { NAV_HEIGHT, isTopLevelTabRoute } from './tabs';

/** Where "Open agent" goes: the Agents tab, carrying the last-used provider when there is one (Theme J opens it). */
export function openAgentHref(lastProvider: string | null): string {
  return lastProvider ? `/(tabs)/agents?open=${encodeURIComponent(lastProvider)}` : '/(tabs)/agents';
}

export function QuickAccess() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const { dialOpen, setDialOpen, setSwitcherOpen } = useShell();
  const visible = isTopLevelTabRoute(segments);

  // Leaving a top-level tab with the dial open must not leave its scrim behind.
  useEffect(() => {
    if (!visible) setDialOpen(false);
  }, [visible, setDialOpen]);
  if (!visible) return null;

  const ink = theme.colors.secondaryForeground;
  const actions: SpeedDialAction[] = [
    {
      key: 'new-issue',
      label: 'New issue',
      icon: <Icon name={ICONS.newIssue} size={20} color={ink} />,
      onPress: () => router.push('/tasks/new-issue' as Href),
    },
    {
      key: 'open-agent',
      label: 'Open agent',
      icon: <Icon name={ICONS.openAgent} size={20} color={ink} />,
      onPress: () => router.navigate(openAgentHref(usePrefs.getState().lastProvider) as Href),
    },
    {
      key: 'switch-repo',
      label: 'Switch repo',
      icon: <Icon name={ICONS.switchRepo} size={20} color={ink} />,
      onPress: () => setSwitcherOpen(true),
    },
    {
      key: 'notes',
      label: 'Notes',
      icon: <Icon name={ICONS.notes} size={20} color={ink} />,
      onPress: () => undefined,
      disabled: true,
    },
  ];

  return (
    <SpeedDial
      open={dialOpen}
      onOpenChange={setDialOpen}
      actions={actions}
      icon={<Icon name={ICONS.plus} size={24} color={theme.colors.primaryForeground} />}
      label="Quick actions"
      offsetBottom={NAV_HEIGHT + insets.bottom + theme.space[4]}
      testID="quick-access"
    />
  );
}
