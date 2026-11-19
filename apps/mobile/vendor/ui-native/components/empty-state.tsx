import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/theme-provider';
import { Button } from './button';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** The centred "nothing here" block: icon, title, a line of body, an optional action. */
export function EmptyState({ icon, title, body, action, style, testID }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.wrap, { padding: theme.space[6], gap: theme.space[2] }, style]}
    >
      {icon ? <View style={{ marginBottom: theme.space[2] }}>{icon}</View> : null}
      <Text
        accessibilityRole="header"
        style={[
          theme.type.base,
          styles.center,
          { color: theme.colors.foreground, fontWeight: theme.font.semibold },
        ]}
      >
        {title}
      </Text>
      {body ? (
        <Text style={[theme.type.sm, styles.center, { color: theme.colors.mutedForeground }]}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button variant="outline" onPress={action.onPress} style={{ marginTop: theme.space[3] }}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
