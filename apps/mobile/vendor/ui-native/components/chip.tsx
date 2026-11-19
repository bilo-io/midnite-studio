import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { a11yState } from '../lib/a11y';
import { contrastTextForHex } from '../theme/contrast';
import { useTheme } from '../theme/theme-provider';

export type ChipProps = {
  label: string;
  /** A hex fill (`#rrggbb`, `rrggbb` or `#rgb`: a label or option colour); the text picks black or white to read on it. Anything else is ignored. */
  color?: string;
  selected?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A compact label or filter pill. Pressable when `onPress` is set. */
export function Chip({ label, color, selected, onPress, leading, style, testID }: ChipProps) {
  const theme = useTheme();
  const hex = color === undefined ? undefined : readableOn(color);
  // GitHub label colours come without the `#`.
  const swatch =
    hex && color ? (color.trim().startsWith('#') ? color.trim() : `#${color.trim()}`) : undefined;
  const fill = swatch ?? (selected ? theme.colors.accent : 'transparent');
  const ink = hex ?? (selected ? theme.colors.accentForeground : theme.colors.foreground);
  const look: StyleProp<ViewStyle> = [
    styles.chip,
    {
      backgroundColor: fill,
      borderColor: swatch
        ? selected
          ? theme.colors.ring
          : swatch
        : selected
          ? theme.colors.accent
          : theme.colors.border,
      borderWidth: swatch && selected ? 2 : StyleSheet.hairlineWidth,
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.space[3],
      gap: theme.space[1],
    },
    style,
  ];
  const body = (
    <>
      {leading}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={[theme.type.xs, { color: ink, fontWeight: theme.font.medium }]}
      >
        {label}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={look}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      {...(selected !== undefined ? a11yState({ selected }) : {})}
      onPress={onPress}
      hitSlop={8}
      testID={testID}
      style={look}
    >
      {body}
    </Pressable>
  );
}

/** Black or white for a hex fill; undefined when `color` is not a hex this can read. */
function readableOn(color: string): '#000000' | '#ffffff' | undefined {
  try {
    return contrastTextForHex(color);
  } catch {
    return undefined;
  }
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
