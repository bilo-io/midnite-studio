// Pressed and focus states for composite rows and cards (Phase 146 L5, the State matrix's last column).
// Rows paint `accent` while pressed; cards scale to 0.98 over `motion.fast`, or dim instead when the OS asks for reduced
// motion. Focus (hardware keyboard, switch access) is a 2dp `ring` outline drawn inset by `FocusRing`.
import { useTheme } from '@bilo-io/ui-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import { useReducedMotion } from './use-reduced-motion';

export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { focused, onFocus, onBlur };
}

/** A 2dp `ring` outline laid inside its parent; the parent must be `position: relative` (any View is). */
export function FocusRing({ visible, radius = 0 }: { visible: boolean; radius?: number }) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <View
      testID="focus-ring"
      pointerEvents="none"
      accessible={false}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        borderWidth: 2,
        borderColor: theme.colors.ring,
        borderRadius: radius,
      }}
    />
  );
}

/** Press feedback for a card: scale 0.98 over `motion.fast`; with reduced motion, an instant opacity change. */
export function usePressFeedback() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(0)).current;
  const to = useCallback(
    (target: 0 | 1) =>
      Animated.timing(value, {
        toValue: target,
        duration: reduced ? 0 : theme.motion.fast,
        useNativeDriver: Platform.OS !== 'web',
      }).start(),
    [value, reduced, theme.motion.fast],
  );
  useEffect(() => () => value.stopAnimation(), [value]);
  const style = reduced
    ? { opacity: value.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }
    : { transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }] };
  return { style, onPressIn: () => to(1), onPressOut: () => to(0) };
}
