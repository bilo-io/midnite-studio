import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether the OS asks for reduced motion; false until the query resolves, then live. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => {
        if (alive) setReduce(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
