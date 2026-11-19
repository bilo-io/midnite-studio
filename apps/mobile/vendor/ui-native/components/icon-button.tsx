import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { a11yState } from '../lib/a11y';
import { useTheme } from '../theme/theme-provider';

export type IconButtonProps = {
  icon: ReactNode;
  /** The accessible name: an icon alone says nothing to a screen reader. */
  label: string;
  onPress: () => void;
  variant?: 'ghost' | 'filled';
  size?: 32 | 40;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const MIN_HIT = 44;

/** A round icon-only button with a 44dp minimum hit target. */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'ghost',
  size = 40,
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  const slop = Math.max(0, (MIN_HIT - size) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...a11yState({ disabled })}
      disabled={disabled}
      hitSlop={slop}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: theme.radius.full },
        variant === 'filled' && { backgroundColor: theme.colors.secondary },
        pressed && { backgroundColor: theme.colors.accent },
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
