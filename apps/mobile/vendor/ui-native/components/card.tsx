import { forwardRef } from 'react';
import { StyleSheet, Text, type TextProps, View, type ViewProps } from 'react-native';

import { useTheme } from '../theme/theme-provider';

/**
 * The bordered surface, with header, title and content parts, as on the web.
 * Each part is a plain `View` (the title a `Text` with the header role) and
 * forwards its props, accessibility ones included.
 */
export const Card = forwardRef<View, ViewProps>(function Card({ style, ...props }, ref) {
  const theme = useTheme();
  return (
    <View
      ref={ref}
      style={[
        styles.card,
        {
          borderRadius: theme.radius.lg,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
        },
        style,
      ]}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<View, ViewProps>(function CardHeader(
  { style, ...props },
  ref,
) {
  return <View ref={ref} style={[styles.header, style]} {...props} />;
});

export const CardTitle = forwardRef<Text, TextProps>(function CardTitle({ style, ...props }, ref) {
  const theme = useTheme();
  return (
    <Text
      ref={ref}
      accessibilityRole="header"
      style={[styles.title, { color: theme.colors.mutedForeground }, style]}
      {...props}
    />
  );
});

export const CardContent = forwardRef<View, ViewProps>(function CardContent(
  { style, ...props },
  ref,
) {
  return <View ref={ref} style={[styles.content, style]} {...props} />;
});

const styles = StyleSheet.create({
  // shadow-sm: one soft, short shadow (elevation on Android).
  card: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  header: { padding: 24, gap: 6 },
  title: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  content: { padding: 24, paddingTop: 0 },
});
