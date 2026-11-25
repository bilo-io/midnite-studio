// Reduce motion (Phase 146 L7): true while the OS asks for it, live through its change event. The app's own motion
// (the card press scale, the FAB fade) reads this and switches to an instant opacity change; ui-native's Skeleton pulse,
// SpeedDial stagger and Sheet slide read the same OS setting inside the kit.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduced;
}

/** At this font scale the BottomNav drops its labels (each tab keeps its `accessibilityLabel`). */
export const HIDE_NAV_LABELS_AT = 1.3;
