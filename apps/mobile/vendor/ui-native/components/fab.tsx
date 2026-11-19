import { type ReactNode, useRef } from 'react';
import { Animated, Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { a11yState } from '../lib/a11y';
import { useNativeDriver } from '../lib/native-driver';
import { useTheme } from '../theme/theme-provider';

export type FabProps = {
  icon: ReactNode;
  /** The accessible name. */
  label: string;
  onPress: () => void;
  position?: 'bottom-right' | 'bottom-left';
  /** Distance from the bottom edge (nav height + inset + space[4], typically). */
  offsetBottom?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Extra a11y state (SpeedDial sets `expanded`). */
  expanded?: boolean;
};

export const FAB_SIZE = 56;

/** The floating action button: a plain primary disc, absolutely positioned. */
export function Fab({
  icon,
  label,
  onPress,
  position = 'bottom-right',
  offsetBottom,
  style,
  testID,
  expanded,
}: FabProps) {
  const theme = useTheme();
  const pressed = useRef(new Animated.Value(0)).current;
  const to = (toValue: number) =>
    Animated.timing(pressed, {
      toValue,
      duration: theme.motion.fast,
      easing: theme.motion.easing,
      useNativeDriver,
    }).start();
  const side = position === 'bottom-left' ? { left: theme.space[4] } : { right: theme.space[4] };
  return (
    <Animated.View
      style={[
        styles.wrap,
        side,
        { bottom: offsetBottom ?? theme.space[4] },
        {
          opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }),
          transform: [
            { scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) },
          ],
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        {...a11yState({ expanded })}
        onPress={onPress}
        onPressIn={() => to(1)}
        onPressOut={() => to(0)}
        testID={testID}
        style={[
          styles.disc,
          theme.elevation[3],
          { borderRadius: theme.radius.full, backgroundColor: theme.colors.primary },
        ]}
      >
        {icon}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 40 },
  disc: { width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center' },
});
