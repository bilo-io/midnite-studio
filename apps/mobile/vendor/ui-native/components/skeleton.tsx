import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useNativeDriver } from '../lib/native-driver';
import { useReduceMotion } from '../lib/reduce-motion';
import { useTheme } from '../theme/theme-provider';

export type SkeletonProps = {
  width: number | `${number}%`;
  height: number;
  /** Corner radius in dp; defaults to `radius.sm`. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A loading placeholder block that pulses; a static block under reduce motion. */
export function Skeleton({ width, height, radius, style, testID }: SkeletonProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: theme.motion.slow * 2, useNativeDriver }),
        Animated.timing(pulse, { toValue: 1, duration: theme.motion.slow * 2, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion, theme.motion.slow]);

  return (
    <Animated.View
      aria-hidden
      testID={testID}
      style={[
        {
          width: width as DimensionValue,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors.muted,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}
