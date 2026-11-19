import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/theme-provider';

export type AppBarProps = {
  title: ReactNode;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Makes the title block a button (a repo switcher, say). */
  onTitlePress?: () => void;
  /** The safe-area top inset; the library takes no safe-area dependency. */
  insetTop?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const HEIGHT = 56;

/** The top bar: leading slot, a title block that fills the row, trailing slot. */
export function AppBar({
  title,
  subtitle,
  leading,
  trailing,
  onTitlePress,
  insetTop = 0,
  style,
  testID,
}: AppBarProps) {
  const theme = useTheme();
  const titleNode =
    typeof title === 'string' ? (
      <Text
        numberOfLines={1}
        ellipsizeMode="middle"
        maxFontSizeMultiplier={1.4}
        accessibilityRole={onTitlePress ? undefined : 'header'}
        style={[
          theme.type.base,
          { color: theme.colors.foreground, fontWeight: theme.font.semibold },
        ]}
      >
        {title}
      </Text>
    ) : (
      title
    );
  const block = (
    <>
      {titleNode}
      {subtitle ? (
        <Text numberOfLines={1} style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );
  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        {
          paddingTop: insetTop,
          height: HEIGHT + insetTop,
          paddingHorizontal: theme.space[2],
          gap: theme.space[2],
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      {leading}
      {onTitlePress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onTitlePress}
          style={[styles.title, !leading && { paddingLeft: theme.space[2] }]}
        >
          {block}
        </Pressable>
      ) : (
        <View style={[styles.title, !leading && { paddingLeft: theme.space[2] }]}>{block}</View>
      )}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, minWidth: 0, justifyContent: 'center' },
});
