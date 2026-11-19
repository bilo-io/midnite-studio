import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';

import { a11yState } from '../lib/a11y';
import { useTheme } from '../theme/theme-provider';

export type SwitchProps = Omit<PressableProps, 'children' | 'style' | 'onPress'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TRACK_W = 36;
const THUMB = 16;
const PAD = 2;
// react-native-web has no native animated module and warns if asked for one.
const useNativeDriver = Platform.OS !== 'web';

/**
 * A controlled on/off toggle with the switch role, drawn like the web Switch
 * (a 36×20 track, the thumb sliding 16dp). It is the design-system look; reach
 * for RN's own `Switch` when the platform control is wanted instead.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  accessibilityState,
  style,
  ...props
}: SwitchProps) {
  const theme = useTheme();
  const x = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(x, { toValue: checked ? 1 : 0, duration: 200, useNativeDriver }).start();
  }, [checked, x]);

  return (
    <Pressable
      accessibilityRole="switch"
      disabled={disabled}
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      onPress={() => onCheckedChange(!checked)}
      {...props}
      {...a11yState({ ...accessibilityState, checked, disabled })}
      style={[
        styles.track,
        { backgroundColor: checked ? theme.colors.foreground : theme.colors.border },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            backgroundColor: theme.colors.background,
            transform: [
              {
                translateX: x.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRACK_W - THUMB - PAD * 2],
                }),
              },
            ],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: THUMB + PAD * 2,
    padding: PAD,
    borderRadius: 999,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  disabled: { opacity: 0.4 },
});
