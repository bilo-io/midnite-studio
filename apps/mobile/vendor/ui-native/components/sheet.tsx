import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { useNativeDriver } from '../lib/native-driver';
import { useReduceMotion } from '../lib/reduce-motion';
import { useTheme } from '../theme/theme-provider';

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: 'left' | 'bottom';
  title?: string;
  children: ReactNode;
  /** Left sheet width as a fraction of the screen, capped at 360dp. */
  widthFraction?: number;
  /** Bottom sheet heights as fractions of the screen, smallest first. */
  snapPoints?: number[];
  /**
   * `false` draws the sheet in place (absolutely filling its parent) instead of
   * in a native `Modal`: for a sheet inside a frame, such as a showcase phone.
   */
  modal?: boolean;
  /** Safe-area insets in dp: a drawer pads both, a bottom sheet the bottom. */
  insetTop?: number;
  insetBottom?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const LEFT_MAX = 360;
const BOTTOM_MAX = 560;
const DEFAULT_SNAPS = [0.5, 0.9];

/**
 * A modal panel that slides in from the left (a drawer) or up from the bottom,
 * over the scrim. Swipe it back the way it came, tap the scrim, or press
 * Android back (`onRequestClose`) to close.
 */
export function Sheet({
  open,
  onOpenChange,
  side,
  title,
  children,
  widthFraction = 0.86,
  snapPoints = DEFAULT_SNAPS,
  modal = true,
  insetTop = 0,
  insetBottom = 0,
  style,
  testID,
}: SheetProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const window = useWindowDimensions();
  // In place, the sheet sizes against its parent, not the window.
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const { width: screenW, height: screenH } = !modal && frame ? frame : window;
  const [visible, setVisible] = useState(open);
  const [snap, setSnap] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;

  const panelW = Math.min(screenW * widthFraction, LEFT_MAX);
  const panelH = screenH * (snapPoints[snap] ?? snapPoints[0] ?? DEFAULT_SNAPS[0]!);
  const travel = side === 'left' ? panelW : panelH;

  useEffect(() => {
    if (open) {
      setVisible(true);
      setSnap(0);
      drag.setValue(0);
    }
  }, [open, drag]);

  // Animate only once the panel is mounted.
  useEffect(() => {
    if (!visible) return;
    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reduceMotion ? 0 : theme.motion.base,
      easing: theme.motion.easing,
      useNativeDriver,
    });
    // Next frame: the panel's animated views attach in this commit, and a
    // detach/re-attach (StrictMode does one) stops any animation already running.
    const frame = requestAnimationFrame(() =>
      anim.start(({ finished }) => {
        if (finished && !open) setVisible(false);
      }),
    );
    return () => {
      cancelAnimationFrame(frame);
      anim.stop();
    };
  }, [open, visible, progress, reduceMotion, theme.motion]);

  const close = () => onOpenChange(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          side === 'left'
            ? Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy)
            : Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          // Only toward closing: left for a drawer, down for a bottom sheet.
          drag.setValue(side === 'left' ? Math.min(0, g.dx) : Math.max(0, g.dy));
        },
        onPanResponderRelease: (_e, g) => {
          const moved = side === 'left' ? -g.dx : g.dy;
          const speed = side === 'left' ? -g.vx : g.vy;
          if (side === 'bottom' && g.dy < -40) {
            setSnap((s) => Math.min(s + 1, snapPoints.length - 1));
          } else if (moved > travel * 0.3 || speed > 0.5) {
            if (side === 'bottom' && snap > 0) setSnap((s) => s - 1);
            else closeRef.current();
          }
          Animated.spring(drag, { toValue: 0, useNativeDriver }).start();
        },
      }),
    [side, travel, snap, snapPoints.length, drag],
  );

  // Memoised: a fresh node each render detaches the old one, and a detached
  // Animated.Value stops its running animation mid-slide.
  const translate = useMemo(
    () =>
      Animated.add(
        progress.interpolate({
          inputRange: [0, 1],
          outputRange: side === 'left' ? [-travel, 0] : [travel, 0],
        }),
        drag,
      ),
    [progress, drag, side, travel],
  );

  const header = (
    <>
      {side === 'bottom' ? (
        <View
          style={[
            styles.grabber,
            {
              marginTop: theme.space[2],
              backgroundColor: theme.colors.border,
              borderRadius: theme.radius.full,
            },
          ]}
        />
      ) : null}
      {title ? (
        <Text
          accessibilityRole="header"
          style={[
            theme.type.lg,
            {
              color: theme.colors.popoverForeground,
              fontWeight: theme.font.semibold,
              paddingHorizontal: theme.space[4],
              paddingTop: theme.space[side === 'left' ? 6 : 3],
            },
          ]}
        >
          {title}
        </Text>
      ) : null}
    </>
  );

  const body = (
    <View style={[StyleSheet.absoluteFill, !modal && styles.inPlace]} testID={testID}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
          testID={testID ? `${testID}-scrim` : 'sheet-scrim'}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={side === 'left' ? styles.leftDock : styles.bottomDock}>
        <Animated.View
          // A drawer swipes sideways from anywhere; a bottom sheet drags by its
          // header, so a list inside it keeps its vertical scroll.
          {...(side === 'left' ? pan.panHandlers : {})}
          accessibilityViewIsModal
          aria-modal
          accessibilityLabel={title}
          style={[
            theme.elevation[2],
            { backgroundColor: theme.colors.popover },
            side === 'left'
              ? [
                  styles.left,
                  {
                    width: panelW,
                    paddingTop: insetTop,
                    paddingBottom: insetBottom,
                    transform: [{ translateX: translate }],
                  },
                ]
              : [
                  styles.bottom,
                  {
                    height: panelH + insetBottom,
                    paddingBottom: insetBottom,
                    maxWidth: BOTTOM_MAX,
                    borderTopLeftRadius: theme.radius.lg * 2,
                    borderTopRightRadius: theme.radius.lg * 2,
                    transform: [{ translateY: translate }],
                  },
                ],
            style,
          ]}
        >
          {side === 'bottom' ? <View {...pan.panHandlers}>{header}</View> : header}
          <View style={[styles.content, { padding: theme.space[4] }]}>{children}</View>
        </Animated.View>
      </View>
    </View>
  );

  if (!modal) {
    return (
      <>
        {/* Always mounted, so the frame is known before the first open. */}
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setFrame((f) => (f?.width === width && f.height === height ? f : { width, height }));
          }}
        />
        {visible ? body : null}
      </>
    );
  }
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={close}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  leftDock: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'flex-start',
  },
  bottomDock: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  left: { height: '100%' },
  bottom: { width: '100%' },
  grabber: { width: 36, height: 4, alignSelf: 'center' },
  content: { flex: 1 },
  inPlace: { zIndex: 50 },
});
