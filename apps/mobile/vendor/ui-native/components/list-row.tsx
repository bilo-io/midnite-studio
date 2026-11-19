import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/theme-provider';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** A short right-aligned value (a count, a setting's current value). */
  meta?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Title line clamp. */
  numberOfLines?: number;
  /** Drop the hairline divider (the last row of a group). */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A list row: 56dp (72 with a subtitle), leading and trailing slots, a hairline divider. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  meta,
  onPress,
  onLongPress,
  numberOfLines = 1,
  divider = true,
  style,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const interactive = Boolean(onPress || onLongPress);
  const look = (pressed: boolean): StyleProp<ViewStyle> => [
    styles.row,
    {
      minHeight: subtitle ? 72 : 56,
      paddingHorizontal: theme.space[4],
      gap: theme.space[3],
      borderBottomColor: theme.colors.border,
    },
    divider && styles.divider,
    pressed && { backgroundColor: theme.colors.accent },
    style,
  ];
  const body = (
    <>
      {leading}
      <View style={styles.body}>
        <Text
          numberOfLines={numberOfLines}
          style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.medium }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={[theme.type.sm, { color: theme.colors.mutedForeground }]}>{meta}</Text>
      ) : null}
      {trailing}
    </>
  );
  if (!interactive) {
    return (
      <View testID={testID} style={look(false)}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      testID={testID}
      style={({ pressed }) => look(pressed)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, minWidth: 0, gap: 2 },
});
