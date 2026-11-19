import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { a11yState } from '../lib/a11y';
import { useTheme } from '../theme/theme-provider';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export type TabsProps<T extends string> = {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab list. */
  accessibilityLabel: string;
  /** Stretch the segments to share the full width — the usual phone layout. */
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The segmented control: a tab list whose segments are tabs, the selected one
 * on the accent fill. Controlled, like the web Tabs; the caller renders the
 * matching panel.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  stretch = false,
  style,
  testID,
}: TabsProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        styles.list,
        {
          borderRadius: theme.radius.md,
          borderColor: theme.alpha('border', 0.6),
          backgroundColor: theme.alpha('card', 0.6),
        },
        stretch ? styles.stretch : styles.inline,
        style,
      ]}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityLabel={opt.label}
            {...a11yState({ selected })}
            onPress={() => onChange(opt.value)}
            style={[
              styles.tab,
              { borderRadius: theme.radius.sm },
              stretch && styles.tabStretch,
              selected && { backgroundColor: theme.colors.accent },
            ]}
          >
            {opt.icon}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: selected ? theme.colors.accentForeground : theme.colors.mutedForeground },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 2 },
  inline: { alignSelf: 'flex-start' },
  stretch: { alignSelf: 'stretch' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tabStretch: { flex: 1 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
});
