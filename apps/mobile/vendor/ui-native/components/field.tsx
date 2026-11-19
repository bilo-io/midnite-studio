import { forwardRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { a11yState } from '../lib/a11y';
import { useTheme } from '../theme/theme-provider';

export type FieldProps = TextInputProps & {
  /** A visible label above the field; it is also the accessible name unless `accessibilityLabel` is set. */
  label?: string;
  /** Read-only and dimmed (`editable={false}`), and reported as disabled. */
  disabled?: boolean;
};

/**
 * The shared text field behind Input and Textarea: the web field's border,
 * background and placeholder tokens, with the ring colour on focus.
 */
export const Field = forwardRef<TextInput, FieldProps & { multiline?: boolean }>(function Field(
  {
    label,
    disabled = false,
    editable,
    multiline = false,
    accessibilityLabel,
    accessibilityState,
    onFocus,
    onBlur,
    style,
    ...props
  },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const input = (
    <TextInput
      ref={ref}
      editable={!disabled && editable !== false}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholderTextColor={theme.colors.mutedForeground}
      selectionColor={theme.colors.ring}
      accessibilityLabel={accessibilityLabel ?? label}
      {...a11yState({ ...accessibilityState, disabled })}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.field,
        multiline ? styles.multiline : styles.single,
        {
          borderRadius: theme.radius.md,
          borderColor: focused ? theme.colors.ring : theme.colors.input,
          backgroundColor: theme.colors.background,
          color: theme.colors.foreground,
        },
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    />
  );

  if (!label) return input;
  return (
    <View style={styles.labelled}>
      {/* The input already carries the label as its accessible name; hidden here
          so VoiceOver/TalkBack do not read it twice. */}
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[styles.label, { color: theme.colors.foreground }]}
      >
        {label}
      </Text>
      {input}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    width: '100%',
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    // The field draws its own focus colour; the browser outline would double it.
    ...Platform.select({ web: { outlineWidth: 0 } }),
  },
  single: { height: 36, paddingVertical: 4 },
  multiline: { minHeight: 80, paddingVertical: 8 },
  disabled: { opacity: 0.5 },
  labelled: { width: '100%', gap: 6 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
