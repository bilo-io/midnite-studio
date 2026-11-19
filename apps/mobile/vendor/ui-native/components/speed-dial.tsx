import { type ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { a11yState } from '../lib/a11y';
import { useNativeDriver } from '../lib/native-driver';
import { useReduceMotion } from '../lib/reduce-motion';
import { useTheme } from '../theme/theme-provider';
import { FAB_SIZE, Fab } from './fab';

export type SpeedDialAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  /** Drawn at 0.4 with a "Coming soon" suffix, and inert. */
  disabled?: boolean;
};

export type SpeedDialProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: SpeedDialAction[];
  icon: ReactNode;
  /** Shown while open; without it `icon` rotates 45° (plus → ×). */
  openIcon?: ReactNode;
  /** The FAB's accessible name. */
  label?: string;
  position?: 'bottom-right' | 'bottom-left';
  offsetBottom?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ACTION = 40;
const STAGGER = 30;

/**
 * A FAB that fans out actions above it over a scrim. Tapping the scrim or an
 * action closes it. Render it as the last child of the screen container (above
 * the content, below the nav) so the scrim covers the content.
 */
export function SpeedDial({
  open,
  onOpenChange,
  actions,
  icon,
  openIcon,
  label = 'Actions',
  position = 'bottom-right',
  offsetBottom,
  style,
  testID,
}: SpeedDialProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  const items = useRef(actions.map(() => new Animated.Value(0)));
  if (items.current.length !== actions.length) {
    items.current = actions.map(() => new Animated.Value(0));
  }

  useEffect(() => {
    const duration = reduceMotion ? 0 : theme.motion.base;
    const timing = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, { toValue, duration, easing: theme.motion.easing, useNativeDriver });
    if (!open) items.current.forEach((v) => v.setValue(0));
    // Nearest the FAB first, so the fan grows upward.
    const anim = open
      ? Animated.parallel([
          timing(turn, 1),
          Animated.stagger(
            reduceMotion ? 0 : STAGGER,
            items.current.map((v) => timing(v, 1)),
          ),
        ])
      : timing(turn, 0);
    // Next frame: the actions' animated views attach in this commit, and a
    // detach/re-attach (StrictMode does one) stops an animation already running.
    const frame = requestAnimationFrame(() => anim.start());
    return () => {
      cancelAnimationFrame(frame);
      anim.stop();
    };
  }, [open, reduceMotion, theme.motion, turn, actions.length]);

  const bottom = offsetBottom ?? theme.space[4];
  const inset = theme.space[4] + (FAB_SIZE - ACTION) / 2;
  const right = position === 'bottom-right';
  const close = () => onOpenChange(false);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, style]} testID={testID}>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close actions"
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
          testID={testID ? `${testID}-scrim` : 'speed-dial-scrim'}
        />
      ) : null}
      {open ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.stack,
            {
              bottom: bottom + FAB_SIZE + theme.space[3],
              gap: theme.space[3],
              alignItems: right ? 'flex-end' : 'flex-start',
            },
            right ? { right: inset } : { left: inset },
          ]}
        >
          {actions.map((action, i) => {
            // The stack is column-reverse, so index 0 sits nearest the FAB.
            const v = items.current[i]!;
            return (
              <Animated.View
                key={action.key}
                style={{
                  opacity: v,
                  transform: [
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                  ],
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    action.disabled ? `${action.label}, coming soon` : action.label
                  }
                  {...a11yState({ disabled: action.disabled })}
                  disabled={action.disabled}
                  onPress={() => {
                    action.onPress();
                    close();
                  }}
                  style={[
                    styles.action,
                    { gap: theme.space[3], flexDirection: right ? 'row' : 'row-reverse' },
                    action.disabled && styles.disabled,
                  ]}
                >
                  <View
                    style={[
                      styles.labelPill,
                      theme.elevation[2],
                      {
                        backgroundColor: theme.colors.popover,
                        borderRadius: theme.radius.full,
                        paddingHorizontal: theme.space[3],
                        paddingVertical: theme.space[1],
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.type.sm,
                        { color: theme.colors.popoverForeground, fontWeight: theme.font.medium },
                      ]}
                    >
                      {action.label}
                      {action.disabled ? (
                        <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>
                          {' · Coming soon'}
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.disc,
                      { borderRadius: theme.radius.full, backgroundColor: theme.colors.secondary },
                    ]}
                  >
                    {action.icon}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      ) : null}
      <Fab
        icon={
          open && openIcon ? (
            openIcon
          ) : (
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: turn.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '45deg'],
                    }),
                  },
                ],
              }}
            >
              {icon}
            </Animated.View>
          )
        }
        label={label}
        expanded={open}
        onPress={() => onOpenChange(!open)}
        position={position}
        offsetBottom={bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', flexDirection: 'column-reverse' },
  action: { alignItems: 'center' },
  labelPill: { maxWidth: 240 },
  disc: { width: ACTION, height: ACTION, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
