import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { a11yState } from '../lib/a11y';
import { useTheme } from '../theme/theme-provider';

export type BottomNavItem = {
  key: string;
  label: string;
  /** A node, or a render function given the ink for the item's state (as expo-router's `tabBarIcon`). */
  icon: ReactNode | ((state: { color: string; focused: boolean }) => ReactNode);
  /** A count (capped at `99+`) or `true` for a dot. */
  badge?: number | boolean;
};

export type BottomNavProps = {
  items: BottomNavItem[];
  activeKey: string;
  onChange: (key: string) => void;
  /** The safe-area bottom inset. */
  insetBottom?: number;
  /** Icons only (large Dynamic Type); each tab keeps its label as its name. */
  hideLabels?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** What a numeric badge shows: the count, `99+` past 99, nothing at 0. */
export function badgeText(badge: number | boolean | undefined): string | null {
  if (typeof badge !== 'number' || badge <= 0) return null;
  return badge > 99 ? '99+' : String(badge);
}

const HEIGHT = 56;

/**
 * The tab bar: equal-width items, the active one on an accent pill. Its props
 * map straight from an expo-router `tabBar` (state.routes → items,
 * state.index → activeKey, navigation.navigate → onChange).
 */
export function BottomNav({
  items,
  activeKey,
  onChange,
  insetBottom = 0,
  hideLabels = false,
  style,
  testID,
}: BottomNavProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      style={[
        styles.bar,
        {
          height: HEIGHT + insetBottom,
          paddingBottom: insetBottom,
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
        style,
      ]}
    >
      {items.map((item) => {
        const selected = item.key === activeKey;
        const ink = selected ? theme.colors.foreground : theme.colors.mutedForeground;
        const count = badgeText(item.badge);
        const dot = item.badge === true;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={
              count ? `${item.label}, ${count}` : dot ? `${item.label}, new` : item.label
            }
            {...a11yState({ selected })}
            onPress={() => onChange(item.key)}
            style={styles.item}
          >
            <View
              style={[
                styles.pill,
                { borderRadius: theme.radius.full },
                selected && { backgroundColor: theme.colors.accent },
              ]}
            >
              {typeof item.icon === 'function'
                ? item.icon({ color: ink, focused: selected })
                : item.icon}
              {count || dot ? (
                <View
                  testID={`${item.key}-badge`}
                  style={[
                    dot ? styles.dot : styles.count,
                    {
                      backgroundColor: theme.colors.primary,
                      borderColor: theme.colors.background,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                >
                  {count ? (
                    <Text
                      maxFontSizeMultiplier={1.4}
                      style={[
                        styles.countText,
                        { color: theme.colors.primaryForeground, fontWeight: theme.font.semibold },
                      ]}
                    >
                      {count}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
            {hideLabels ? null : (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={[theme.type.xs, { color: ink, fontWeight: theme.font.medium }]}
              >
                {item.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 44 },
  pill: { width: 56, height: 28, alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute',
    top: -4,
    left: 30,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 0, left: 34, width: 12, height: 12, borderWidth: 2 },
  countText: { fontSize: 10, lineHeight: 12 },
});
