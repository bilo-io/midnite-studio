import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { a11yState } from '../lib/a11y';
import type { Theme } from '../theme/palette';
import { useTheme } from '../theme/theme-provider';

export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A string is set in the label style; anything else (an icon, a row) renders as given. */
  children?: ReactNode;
  /** Covers the content with a spinner (the button keeps its width), blocks presses and reports busy. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

type Paint = { background: string; pressed: string; foreground: string; border?: string };

// The web Button's cva variants, as colours: the same tokens and the same
// pressed/hover step (`/90`, `/80`, or an accent fill).
const PAINT: Record<ButtonVariant, (t: Theme) => Paint> = {
  default: (t) => ({
    background: t.colors.primary,
    pressed: t.alpha('primary', 0.9),
    foreground: t.colors.primaryForeground,
  }),
  secondary: (t) => ({
    background: t.colors.secondary,
    pressed: t.alpha('secondary', 0.8),
    foreground: t.colors.secondaryForeground,
  }),
  outline: (t) => ({
    background: t.colors.background,
    pressed: t.colors.accent,
    foreground: t.colors.foreground,
    border: t.colors.input,
  }),
  ghost: (t) => ({
    background: 'transparent',
    pressed: t.colors.accent,
    foreground: t.colors.foreground,
  }),
  destructive: (t) => ({
    background: t.colors.destructive,
    pressed: t.alpha('destructive', 0.9),
    foreground: t.colors.destructiveForeground,
  }),
};

/** h-9 px-4 · h-8 px-3 text-xs · h-10 px-6 · h-9 w-9 — the web sizes in dp. */
const SIZE = StyleSheet.create({
  default: { height: 36, paddingHorizontal: 16 },
  sm: { height: 32, paddingHorizontal: 12 },
  lg: { height: 40, paddingHorizontal: 24 },
  icon: { height: 36, width: 36, paddingHorizontal: 0 },
});

/**
 * The primary action, with the web Button's five variants and four sizes. A
 * `Pressable` with `accessibilityRole="button"`; `disabled` and `loading` both
 * block presses and are reported to assistive tech.
 */
export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    variant = 'default',
    size = 'default',
    loading = false,
    disabled,
    children,
    style,
    textStyle,
    accessibilityState,
    ...props
  },
  ref,
) {
  const theme = useTheme();
  const paint = PAINT[variant](theme);
  const inactive = !!disabled || loading;
  const label = typeof children === 'string' || typeof children === 'number';

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      disabled={inactive}
      {...props}
      {...a11yState({ ...accessibilityState, disabled: inactive, busy: loading })}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? paint.pressed : paint.background,
        },
        paint.border
          ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: paint.border }
          : null,
        SIZE[size],
        inactive && styles.inactive,
        style,
      ]}
    >
      {/* Still laid out (and still the accessible name) while loading, only
          invisible, so the button keeps its width under the spinner. */}
      <View style={[styles.content, loading && styles.hidden]}>
        {label ? (
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              size === 'sm' && styles.labelSm,
              { color: paint.foreground },
              textStyle,
            ]}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
      {loading ? (
        <View pointerEvents="none" style={styles.spinner}>
          <ActivityIndicator size="small" color={paint.foreground} />
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hidden: { opacity: 0 },
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: { opacity: 0.5 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  labelSm: { fontSize: 12, lineHeight: 16 },
});
