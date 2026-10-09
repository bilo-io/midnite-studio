import { useCallback, useEffect, useRef } from 'react';

import { useUiStore } from '../../../store/ui-store';
import { companionTtsSpeaker, type CompanionSpeaker } from '../../companion/speaker';
import { simplifyForSpeech } from './simplify-for-speech';

export type VoiceThread = {
  speechOn: boolean;
  setSpeechOn: (on: boolean) => void;
  /** Speak a simplified rendering of `text` — a no-op while speech is off. */
  speakReply: (text: string) => void;
};

/**
 * Companion-style speech for a Media thread: TTS of a simplified reply over
 * the Companion's own `companionTtsSpeaker`. The on/off toggle is the
 * persisted `mediaSpeechOn`, default off. Dictation is the shared composer's
 * `useComposerMic` (the Companion's recorder), not duplicated here.
 */
export function useVoiceThread(speaker: CompanionSpeaker = companionTtsSpeaker): VoiceThread {
  const speechOn = useUiStore((s) => s.mediaSpeechOn);
  const setSpeechOn = useUiStore((s) => s.setMediaSpeechOn);
  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;

  // Turning speech off silences whatever is being said; leaving stops it too.
  useEffect(() => {
    if (!speechOn) speakerRef.current.cancel();
  }, [speechOn]);
  useEffect(() => () => speakerRef.current.cancel(), []);

  const speakReply = useCallback((text: string) => {
    if (!useUiStore.getState().mediaSpeechOn) return;
    const spoken = simplifyForSpeech(text);
    if (!spoken) return;
    speakerRef.current.cancel();
    void speakerRef.current.speak(spoken);
  }, []);

  return { speechOn, setSpeechOn, speakReply };
}

/** Join a dictated transcript onto an existing draft. */
export function appendDictation(draft: string, text: string): string {
  return draft.trim().length === 0 ? text : `${draft.replace(/\s+$/, '')} ${text}`;
}

/**
 * Speak how a job ended: when `busy` falls from true to false, say the error
 * if there is one, else `done`. For prompt forms (image, audio) whose "reply"
 * is a generation outcome rather than a chat message.
 */
export function useSpeakOutcome(voice: VoiceThread, busy: boolean, error: string | null, done: string): void {
  const was = useRef(busy);
  const speak = useRef(voice.speakReply);
  speak.current = voice.speakReply;
  useEffect(() => {
    if (was.current && !busy) speak.current(error ?? done);
    was.current = busy;
  }, [busy, error, done]);
}
