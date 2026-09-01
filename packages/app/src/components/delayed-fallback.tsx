import { useEffect, useState } from 'react';

import { Spinner } from './spinner';

/**
 * The fallback every lazy boundary in the app uses — Phase 36 Theme C.
 *
 * A chunk that is already in the browser's cache resolves inside a frame or two.
 * Showing a spinner for that is worse than showing nothing: the user perceives a
 * flash of loading UI where previously there was an instant switch, and reads the
 * app as having got *slower* the moment it got smaller. So this renders `null`
 * until `delayMs` has elapsed and only then the spinner — warm loads never flash,
 * cold ones still say something is happening.
 *
 * 120ms is the resolved decision, and it is the standard "is this instant?"
 * threshold: below ~100ms a transition reads as immediate, so a fallback that
 * appears later than that cannot be mistaken for the destination being slow.
 *
 * Full-height flex box because that is what every consumer wants — a view slot,
 * a panel — and centring it at each call site would be the same three classes
 * thirteen times. `Spinner` is already `prefers-reduced-motion`-aware.
 */
export function DelayedFallback({ delayMs = 120 }: { delayMs?: number } = {}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!show) return null;

  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}
