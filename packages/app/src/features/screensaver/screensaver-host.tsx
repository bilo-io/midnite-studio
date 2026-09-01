import { useEffect, useRef } from 'react';

import { useUiStore } from '../../store/ui-store';
import { Screensaver } from './screensaver';

export function ScreensaverHost() {
  const inactivityTimeoutS = useUiStore((s) => s.inactivityTimeoutS);
  const screensaverOpen = useUiStore((s) => s.screensaverOpen);
  const screensaverLocked = useUiStore((s) => s.screensaverLocked);
  const setScreensaverOpen = useUiStore((s) => s.setScreensaverOpen);

  /**
   * One re-armed timeout, not a poll (Phase 36 E). This used to compare
   * `Date.now()` against the last activity every second for the whole time the
   * app was open — 900 wakeups to answer a question whose answer only changes
   * when the user stops touching the machine. Now activity re-arms a single
   * timer for the full timeout, so an active user costs one `clearTimeout` +
   * `setTimeout` per event burst and an away user costs nothing at all.
   */
  const armRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (screensaverOpen || !inactivityTimeoutS || inactivityTimeoutS <= 0) {
      armRef.current = null;
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const arm = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => setScreensaverOpen(true, false), inactivityTimeoutS * 1000);
    };
    armRef.current = arm;
    arm();

    return () => {
      armRef.current = null;
      if (timer !== null) clearTimeout(timer);
    };
  }, [inactivityTimeoutS, screensaverOpen, setScreensaverOpen]);

  useEffect(() => {
    // `mousemove` fires at pointer rate, so coalesce: re-arming is cheap but
    // not free, and one re-arm per animation frame is indistinguishable from
    // one per event against a timeout measured in minutes.
    let queued = false;
    const onActivity = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        armRef.current?.();
      });
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'pointerdown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, []);

  if (!screensaverOpen) {
    return null;
  }

  return (
    <Screensaver
      onClose={() => setScreensaverOpen(false, false)}
      locked={screensaverLocked}
    />
  );
}
