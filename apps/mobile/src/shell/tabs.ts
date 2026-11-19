// The five tabs, in order (Phase 146 F1). `name` is the expo-router route under `app/(tabs)/`.
import { ICONS, type IconName } from '../ui/icons';

export const TABS = [
  { name: 'history', label: 'History', icon: ICONS.history },
  { name: 'tasks', label: 'Tasks', icon: ICONS.tasks },
  { name: 'reviews', label: 'Reviews', icon: ICONS.reviews },
  { name: 'agents', label: 'Agents', icon: ICONS.agents },
  { name: 'more', label: 'More', icon: ICONS.more },
] as const satisfies readonly { name: string; label: string; icon: IconName }[];

export type TabName = (typeof TABS)[number]['name'];

/** The BottomNav's content height in dp, before the safe-area inset (ui-native fixes it at 56). */
export const NAV_HEIGHT = 56;

/** The FAB shows on the five top-level tab screens only, never on a detail route pushed above them. */
export function isTopLevelTabRoute(segments: readonly string[]): boolean {
  return segments[0] === '(tabs)' && segments.length <= 2;
}
