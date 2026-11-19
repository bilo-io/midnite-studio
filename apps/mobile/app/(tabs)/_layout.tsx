import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { ForgePanel } from '../../src/shell/forge-panel';
import { QuickAccess } from '../../src/shell/quick-access';
import { RepoSwitcher } from '../../src/shell/repo-switcher';
import { ShellProvider } from '../../src/shell/shell-context';
import { MidniteTabBar } from '../../src/shell/tab-bar';
import { TABS } from '../../src/shell/tabs';
import { TitleBar } from '../../src/shell/title-bar';

// The shell (Phase 146 Theme F): a title bar on every tab, the five-tab BottomNav, a quick-access FAB above it, and the
// repo switcher and forge panel as sheets. Screens (Themes G to J) fill `app/(tabs)/*`.
export default function TabsLayout() {
  return (
    <ShellProvider>
      <View style={{ flex: 1 }}>
        <Tabs tabBar={(props) => <MidniteTabBar {...props} />} screenOptions={{ header: () => <TitleBar /> }}>
          {TABS.map((tab) => (
            <Tabs.Screen key={tab.name} name={tab.name} />
          ))}
        </Tabs>
        <QuickAccess />
      </View>
      <RepoSwitcher />
      <ForgePanel />
    </ShellProvider>
  );
}
