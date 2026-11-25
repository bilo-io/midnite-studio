// The quick-access FAB (Phase 146 F5): ui-native's SpeedDial, mounted once in the tabs layout above the BottomNav and
// hidden on any route that is not a top-level tab. It mirrors desktop's quick-access leaves.
import { SpeedDial, useTheme, type SpeedDialAction } from '@bilo-io/ui-native';
import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrefs } from '../state/prefs';
import { Icon } from '../ui/icons';
import { useReducedMotion } from '../ui/use-reduced-motion';
import { useShell } from './shell-context';
import { NAV_HEIGHT, isTopLevelTabRoute } from './tabs';

/** Where "Open agent" goes: the Agents tab, carrying the last-used provider when there is one (Theme J opens it). */
export function openAgentHref(lastProvider: string | null): string {
  return lastProvider ? `/(tabs)/agents?open=${encodeURIComponent(lastProvider)}` : '/(tabs)/agents';
}

/** Whether the software keyboard is up; the FAB steps aside while it is. */
function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return up;
}

/** The FAB on top-level tabs only, faded in and out over `motion.fast` (instantly with reduced motion), hidden while the keyboard is up. */
export function QuickAccess() {
  const theme = useTheme();
  const segments = useSegments();
  const { setDialOpen } = useShell();
  const reduced = useReducedMotion();
  const keyboardUp = useKeyboardUp();
  const visible = isTopLevelTabRoute(segments) && !keyboardUp;
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  // Leaving a top-level tab (or opening the keyboard) with the dial open must not leave its scrim behind.
  useEffect(() => {
    if (!visible) setDialOpen(false);
  }, [visible, setDialOpen]);
  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: reduced ? 0 : theme.motion.fast,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, opacity, reduced, theme.motion.fast]);
  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity }}
    >
      <QuickAccessDial />
    </Animated.View>
  );
}

function QuickAccessDial() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dialOpen, setDialOpen, setSwitcherOpen } = useShell();

  const ink = theme.colors.secondaryForeground;
  const actions: SpeedDialAction[] = [
    {
      key: 'new-issue',
      label: 'New issue',
      icon: <Icon name="newIssue" size={20} color={ink} />,
      onPress: () => router.push('/tasks/new-issue' as Href),
    },
    {
      key: 'open-agent',
      label: 'Open agent',
      icon: <Icon name="openAgent" size={20} color={ink} />,
      onPress: () => router.navigate(openAgentHref(usePrefs.getState().lastProvider) as Href),
    },
    {
      key: 'switch-repo',
      label: 'Switch repo',
      icon: <Icon name="switchRepo" size={20} color={ink} />,
      onPress: () => setSwitcherOpen(true),
    },
    {
      key: 'notes',
      label: 'Notes',
      icon: <Icon name="notes" size={20} color={ink} />,
      onPress: () => undefined,
      disabled: true,
    },
  ];

  return (
    <SpeedDial
      open={dialOpen}
      onOpenChange={setDialOpen}
      actions={actions}
      icon={<Icon name="plus" size={24} color={theme.colors.primaryForeground} />}
      label="Quick actions"
      offsetBottom={NAV_HEIGHT + insets.bottom + theme.space[4]}
      testID="quick-access"
    />
  );
}
