import { useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  PanResponder,
  Platform,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { a11yState, a11yValue } from '../lib/a11y';
import { useTheme } from '../theme/theme-provider';

export type SliderProps = {
  /** Controlled value. Leave undefined (and pass `defaultValue`) for uncontrolled. */
  value?: number;
  /** Starting value when uncontrolled. Defaults to `min`. */
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Called with each new value while dragging or stepping. */
  onValueChange?: (value: number) => void;
  /** Called once when a drag ends. */
  onSlidingComplete?: (value: number) => void;
  /** The fill and knob colour. Defaults to the primary token. */
  color?: string;
  /** A visible label above the track; also the accessible name unless `accessibilityLabel` is set. */
  label?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const KNOB = 18;
const TRACK = 6;
const ROW = 28; // the touch target; the painted track stays 6dp

/** Clamped to [min, max] and snapped to `step`, as the web slider's `sliderValue`. */
export function snapValue(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Math.min(max, Number(snapped.toFixed(10)));
}

/** The value under `x` dp along a track `width` wide (the knob's centre travels inside it). */
export function valueAt(x: number, width: number, min: number, max: number, step: number): number {
  const travel = Math.max(1, width - KNOB);
  return snapValue(min + ((x - KNOB / 2) / travel) * (max - min), min, max, step);
}

type KeyEvent = { key: string; preventDefault: () => void };

/**
 * Layout dp per pointer pixel on the web. A CSS transform on an ancestor (the
 * showcase's scaled phone frame, a zoomed embed) shrinks what the pointer
 * reports (`locationX`, `dx`) but not `onLayout`'s width, which
 * react-native-web reads from `offsetWidth`. The track's drawn width, from
 * `getBoundingClientRect`, gives the ratio between the two. 1 when either is
 * unknown.
 */
export function layoutPerPixel(target: unknown, layoutWidth: number): number {
  const drawn = (target as Drawn | null)?.getBoundingClientRect?.().width ?? 0;
  return drawn > 0 && layoutWidth > 0 ? layoutWidth / drawn : 1;
}

type Drawn = { getBoundingClientRect?: () => { width: number } };

/**
 * A range slider in pure React Native: a PanResponder over a painted track, no
 * native module. Drag or tap the track; screen readers get the adjustable role
 * with increment/decrement actions; on the web (react-native-web) it takes
 * focus and answers the arrow, Page and Home/End keys like `<input type=range>`.
 */
export function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  onSlidingComplete,
  color,
  label,
  accessibilityLabel,
  disabled = false,
  style,
  testID,
}: SliderProps) {
  const theme = useTheme();
  const [inner, setInner] = useState(() => snapValue(defaultValue ?? min, min, max, step));
  const [width, setWidth] = useState(0);
  const current = snapValue(value ?? inner, min, max, step);
  const fill = color ?? theme.colors.primary;

  const commit = (next: number) => {
    const snapped = snapValue(next, min, max, step);
    if (snapped === current) return snapped;
    if (value === undefined) setInner(snapped);
    onValueChange?.(snapped);
    return snapped;
  };

  // The responder is created once; it reads the latest render through this ref.
  const latest = useRef({ commit, width, disabled, min, max, step, onSlidingComplete });
  latest.current = { commit, width, disabled, min, max, step, onSlidingComplete };
  // `scale` turns pointer distances into layout dp for this gesture (1 on native).
  const drag = useRef({ startX: 0, scale: 1, last: current });

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      // Hold the gesture once it is ours, so a parent ScrollView cannot steal a drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { commit, width, min, max, step } = latest.current;
        drag.current.scale = Platform.OS === 'web' ? layoutPerPixel(e.currentTarget, width) : 1;
        drag.current.startX = e.nativeEvent.locationX * drag.current.scale;
        drag.current.last = commit(valueAt(drag.current.startX, width, min, max, step));
      },
      onPanResponderMove: (_e, g) => {
        const { commit, width, min, max, step } = latest.current;
        const x = drag.current.startX + g.dx * drag.current.scale;
        drag.current.last = commit(valueAt(x, width, min, max, step));
      },
      onPanResponderRelease: () => latest.current.onSlidingComplete?.(drag.current.last),
      // Taken away anyway (the OS, a modal): the drag still ends.
      onPanResponderTerminate: () => latest.current.onSlidingComplete?.(drag.current.last),
    }),
  ).current;

  const page = Math.max(step, (max - min) / 10);
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (disabled) return;
    if (e.nativeEvent.actionName === 'increment') commit(current + step);
    if (e.nativeEvent.actionName === 'decrement') commit(current - step);
  };

  // RN's View types have no key events; react-native-web forwards `onKeyDown`
  // to the DOM, so the web gets the native range input's keyboard contract.
  const webKeys =
    Platform.OS === 'web'
      ? {
          onKeyDown: (e: KeyEvent) => {
            if (disabled) return;
            const next: Record<string, number> = {
              ArrowRight: current + step,
              ArrowUp: current + step,
              ArrowLeft: current - step,
              ArrowDown: current - step,
              PageUp: current + page,
              PageDown: current - page,
              Home: min,
              End: max,
            };
            if (!(e.key in next)) return;
            e.preventDefault();
            commit(next[e.key]!);
          },
        }
      : {};

  const ratio = max > min ? (current - min) / (max - min) : 0;
  const knobLeft = ratio * Math.max(0, width - KNOB);
  const name = accessibilityLabel ?? label;

  return (
    <View style={[styles.root, disabled && styles.disabled, style]}>
      {label ? (
        <View style={styles.header}>
          <Text style={[styles.label, { color: theme.colors.foreground }]}>{label}</Text>
          <Text style={[styles.value, { color: theme.colors.mutedForeground }]}>{current}</Text>
        </View>
      ) : null}
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={name}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        {...a11yState({ disabled })}
        {...a11yValue({ min, max, now: current })}
        focusable={!disabled}
        tabIndex={disabled ? -1 : 0}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        {...webKeys}
        style={styles.row}
      >
        {/* Children ignore touches, so `locationX` is always measured from the row. */}
        <View
          pointerEvents="none"
          style={[
            styles.track,
            { backgroundColor: theme.colors.muted, left: KNOB / 2, right: KNOB / 2 },
          ]}
        />
        <View
          pointerEvents="none"
          style={[styles.track, { backgroundColor: fill, left: KNOB / 2, width: knobLeft }]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.knob,
            { left: knobLeft, backgroundColor: fill, borderColor: theme.colors.popover },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 8 },
  disabled: { opacity: 0.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  value: { fontSize: 12, fontVariant: ['tabular-nums'] },
  row: { height: ROW, justifyContent: 'center' },
  track: {
    position: 'absolute',
    top: (ROW - TRACK) / 2,
    height: TRACK,
    borderRadius: TRACK / 2,
  },
  knob: {
    position: 'absolute',
    top: (ROW - KNOB) / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
