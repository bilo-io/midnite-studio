// `tabBar` for expo-router's Tabs (Phase 146 F1): maps the navigator's state onto ui-native's BottomNav.
import { BottomNav, useTheme, type BottomNavItem } from '@bilo-io/ui-native';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePulls } from '../data/queries';
import { Icon } from '../ui/icons';
import { TABS } from './tabs';
import { useCurrentRepo } from './use-current-repo';

/** The structural slice of react-navigation's `BottomTabBarProps` this bar reads. */
export interface MidniteTabBarProps {
  state: { index: number; routes: readonly { key: string; name: string }[] };
  navigateToTab(routeKey: string): void;
}

/** Pull requests waiting on the viewer in the current repo; loaded pages only, so it is a floor, not a total. */
function useReviewBadge(): number | undefined {
  const { repo } = useCurrentRepo();
  const pulls = usePulls(repo, 'review-requested');
  return pulls.data?.pages.reduce((n, page) => n + page.items.length, 0);
}

export function MidniteTabBar({ state, navigateToTab }: MidniteTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const reviews = useReviewBadge();
  const routeNames = new Set(state.routes.map((r) => r.name));
  const items: BottomNavItem[] = TABS.filter((t) => routeNames.has(t.name)).map((tab) => ({
    key: tab.name,
    label: tab.label,
    icon: ({ color }) => <Icon name={tab.icon} size={22} color={color} />,
    badge: tab.name === 'reviews' ? reviews : undefined,
  }));
  const activeKey = state.routes[state.index]?.name ?? '';
  // At a font scale of 1.3 or more the labels would crowd the icons: icons only, each keeping its label as its name.
  return (
    <BottomNav
      items={items}
      activeKey={activeKey}
      onChange={(name) => {
        const route = state.routes.find((r) => r.name === name);
        if (route) navigateToTab(route.key);
      }}
      insetBottom={insets.bottom}
      hideLabels={fontScale >= 1.3}
      style={{ backgroundColor: theme.colors.background }}
    />
  );
}
