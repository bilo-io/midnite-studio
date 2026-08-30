import { useEffect, useRef } from 'react';

import { useUiStore } from '../../store/ui-store';
import { Screensaver } from './screensaver';

export function ScreensaverHost() {
  const inactivityTimeoutS = useUiStore((s) => s.inactivityTimeoutS);
  const screensaverOpen = useUiStore((s) => s.screensaverOpen);
  const screensaverLocked = useUiStore((s) => s.screensaverLocked);
  const setScreensaverOpen = useUiStore((s) => s.setScreensaverOpen);

  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'pointerdown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, []);

  useEffect(() => {
    if (screensaverOpen || !inactivityTimeoutS || inactivityTimeoutS <= 0) {
      return;
    }

    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= inactivityTimeoutS * 1000) {
        setScreensaverOpen(true, false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [inactivityTimeoutS, screensaverOpen, setScreensaverOpen]);

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
