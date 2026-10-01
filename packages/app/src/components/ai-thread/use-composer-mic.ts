import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { companionPorts } from '../../features/companion/companion-ports';
import { setNextTranscriptSink } from '../../features/companion/voice-ports';

export type ComposerMic = {
  available: boolean;
  /** Tooltip text — the reason the mic is unusable, or "Hold to talk". */
  reason: string;
  held: boolean;
  /** Start capturing (no-op when the mic is unavailable). */
  pressStart: () => void;
};

/**
 * Push-to-talk for any composer. Capture and recognition are the Companion's
 * (`voice-ports.ts`); this hook only owns the held state and the release
 * listeners. Without `onTranscript` the text goes to the Companion's own
 * input (the global `transcriptSink` port); with it, the next transcript goes
 * to the caller instead.
 */
export function useComposerMic(
  options: { onTranscript?: (text: string) => void; onInterrupt?: () => void } = {},
): ComposerMic {
  const { onTranscript, onInterrupt } = options;
  const [held, setHeld] = useState(false);
  const available = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micAvailable(),
  );
  const reason = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micUnavailableReason(),
  );

  const pressStart = useCallback(() => {
    if (!companionPorts().micAvailable()) return;
    (onInterrupt ?? (() => companionPorts().interrupt()))();
    setHeld(true);
    setNextTranscriptSink(onTranscript ?? null);
    companionPorts().micPressStart();
  }, [onInterrupt, onTranscript]);

  useEffect(() => {
    if (!held) return undefined;
    const release = () => {
      setHeld(false);
      companionPorts().micPressEnd();
    };
    const keyRelease = (event: KeyboardEvent) => {
      if (event.key === ' ') release();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keyup', keyRelease);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keyup', keyRelease);
      window.removeEventListener('blur', release);
    };
  }, [held]);

  return { available, reason, held, pressStart };
}
