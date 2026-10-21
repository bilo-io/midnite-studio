import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { companionPorts } from '../../features/companion/companion-ports';
import {
  conversationArmed,
  conversationOwner,
  startConversation,
  stopConversation,
  subscribeConversation,
  type ConversationOwner,
} from '../../features/companion/conversation';
import { setNextTranscriptSink } from '../../features/companion/voice-ports';
import { useUiStore } from '../../store/ui-store';

export type ComposerMic = {
  available: boolean;
  /** Tooltip text — the reason the mic is unusable, or "Hold to talk". */
  reason: string;
  held: boolean;
  /** Start capturing (no-op when the mic is unavailable). */
  pressStart: () => void;
  /**
   * Conversation mode — the shared `voiceConversation` setting. While it is on
   * the mic button starts and stops listening instead of being held, and every
   * phrase it hears is sent ({@link autoSendSeq}). Optional so a hand-built
   * `ComposerMic` (a test, a story) still renders the plain hold-to-talk mic.
   */
  conversation?: boolean;
  /** This composer holds the open conversation session. */
  listening?: boolean;
  /** `wake` trigger: the name was just said on its own and the next phrase is the command. */
  armed?: boolean;
  /** Flip the shared setting. Turning it on is a gesture, so it starts listening here. */
  toggleConversation?: () => void;
  /** Start or stop listening here (the mic button, in conversation mode). */
  toggleListening?: () => void;
  /**
   * Bumped each time a conversation phrase lands in this composer. `AiComposer`
   * sends when it moves, once the text it carried is in the field.
   */
  autoSendSeq?: number;
  /**
   * Bumped each time *any* spoken phrase lands in this composer — a held press
   * or a conversation-mode phrase alike. `AiComposer` scrolls the field to the
   * end and puts the caret after it, so what was just said is what is on
   * screen even when the draft has grown past the field's height.
   */
  dictationSeq?: number;
};

/**
 * Push-to-talk for any composer. Capture and recognition are the Companion's
 * (`voice-ports.ts`); this hook only owns the held state and the release
 * listeners. Without `onTranscript` the text goes to the Companion's own
 * input (the global `transcriptSink` port); with it, the next transcript goes
 * to the caller instead.
 *
 * Conversation mode (`conversation.ts`) reuses the same sink: a phrase lands
 * exactly where a push-to-talk transcript would, and `autoSendSeq` is what
 * turns that into a send.
 */
export function useComposerMic(
  options: { onTranscript?: (text: string) => void; onInterrupt?: () => void } = {},
): ComposerMic {
  const { onTranscript, onInterrupt } = options;
  const [held, setHeld] = useState(false);
  const [autoSendSeq, setAutoSendSeq] = useState(0);
  const [dictationSeq, setDictationSeq] = useState(0);
  const available = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micAvailable(),
  );
  const reason = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micUnavailableReason(),
  );

  const conversation = useUiStore((state) => state.voiceConversation);
  const setVoiceConversation = useUiStore((state) => state.setVoiceConversation);

  // One identity for this composer's whole life, so the session can tell
  // "this composer" from "another one that took over"; it always calls the
  // caller's latest `onTranscript`.
  const deliverRef = useRef<(text: string) => void>(() => {});
  deliverRef.current = (text) => {
    (onTranscript ?? companionPorts().transcriptSink)(text);
    setDictationSeq((seq) => seq + 1);
    setAutoSendSeq((seq) => seq + 1);
  };
  const owner = useMemo<ConversationOwner>(() => ({ deliver: (text) => deliverRef.current(text) }), []);
  const listening = useSyncExternalStore(subscribeConversation, () => conversationOwner() === owner);
  const armed = useSyncExternalStore(subscribeConversation, () => conversationOwner() === owner && conversationArmed());

  // A composer that goes away stops a session it still holds — and only one
  // it still holds, never one another composer has since taken over.
  useEffect(() => () => stopConversation(owner), [owner]);

  const toggleListening = useCallback(() => {
    if (conversationOwner() === owner) {
      stopConversation(owner);
      return;
    }
    if (!companionPorts().micAvailable()) return;
    void startConversation(owner);
  }, [owner]);

  /*
    Conversation-aware, so every caller — the composer's mic button, the
    companion's Space shortcut, the media voice controls — starts or stops
    listening in conversation mode without knowing the mode exists. A
    push-to-talk capture opened beside a live session would race it for the
    same device.
  */
  const pressStart = useCallback(() => {
    if (useUiStore.getState().voiceConversation) {
      toggleListening();
      return;
    }
    if (!companionPorts().micAvailable()) return;
    (onInterrupt ?? (() => companionPorts().interrupt()))();
    setHeld(true);
    // Wrapped rather than handed over bare, so this composer hears that its
    // dictation landed (`dictationSeq`); where the text goes is unchanged —
    // the caller's sink, or the companion's own input bar's.
    setNextTranscriptSink((text) => {
      (onTranscript ?? companionPorts().transcriptSink)(text);
      setDictationSeq((seq) => seq + 1);
    });
    companionPorts().micPressStart();
  }, [onInterrupt, onTranscript, toggleListening]);

  const toggleConversation = useCallback(() => {
    const next = !useUiStore.getState().voiceConversation;
    setVoiceConversation(next);
    if (next && companionPorts().micAvailable()) void startConversation(owner);
  }, [owner, setVoiceConversation]);

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

  return {
    available,
    reason,
    held,
    pressStart,
    conversation,
    listening,
    armed,
    toggleConversation,
    toggleListening,
    autoSendSeq,
    dictationSeq,
  };
}
