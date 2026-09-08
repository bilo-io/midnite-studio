import { failure, type GitOpResult } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { setCompanionVolume } from './audio/context';
import { companionPorts, setCompanionPorts } from './companion-ports';
import { stopCompanionPersonality } from './filler';
import {
  RecorderError,
  cancelRecording,
  isRecording,
  recorderErrorMessage,
  startRecording,
  stopRecording,
  transcribe,
} from './recorder';
import { companionTtsSpeaker } from './speaker';

/**
 * Where Themes F and G plug into Theme C's panel.
 *
 * `companion-ports.ts` is a merge-based registry with no-op defaults, built
 * so the panel could ship complete before a speaker or a recorder existed.
 * This module is the voice half claiming its four members — `interrupt`,
 * `micPressStart`, `micPressEnd` and `micAvailable` — in one call at module
 * scope. Theme D/E claims `submit`, `greet` and `repeat` in its own.
 *
 * It is imported for its side effect from `app.tsx`, which is the only place
 * that can guarantee it runs before the panel first renders. There is nothing
 * to call: importing it *is* the wiring.
 */

/**
 * Whether a key is stored, cached.
 *
 * `micAvailable()` is read during render and has to be synchronous, but the
 * answer lives in main behind `safeStorage`. So: a cached boolean, refreshed
 * lazily on the first read and after anything that could change it. The first
 * paint of a freshly-configured panel can therefore show the mic disabled for
 * one frame — which is the right trade, because the alternative is either an
 * IPC call on every render or one at boot for a feature that is off by
 * default.
 */
let micReady = false;
let micProbe: Promise<boolean> | null = null;

/** Re-ask main whether a provider key is stored. Called after a Settings save. */
export function refreshMicAvailability(): Promise<boolean> {
  const companion = bridge()?.companion;
  if (!companion?.sttStatus) {
    micReady = false;
    return Promise.resolve(false);
  }
  micProbe ??= companion
    .sttStatus()
    .then((status) => {
      micReady = status.configured.length > 0;
      return micReady;
    })
    .catch(() => {
      // A bridge that answered nothing is "not configured" — the mic button
      // stays disabled with its reason, which is the honest state.
      micReady = false;
      return false;
    })
    .finally(() => {
      micProbe = null;
    });
  return micProbe;
}

function micAvailable(): boolean {
  if (!micReady && micProbe === null) void refreshMicAvailability();
  return micReady;
}

/**
 * Everything stops.
 *
 * The phase's "every scripted turn is interruptible" rule, from the surface
 * that has the keyboard: the spoken line, the filler schedule, the whistle,
 * the elevator loop, and a recording in progress. `cancelRecording` rather
 * than `stopRecording` because an interrupt means the utterance is *not*
 * wanted — stopping would send it to be transcribed.
 */
function interrupt(): void {
  companionTtsSpeaker.cancel();
  stopCompanionPersonality();
  if (isRecording()) cancelRecording();
}

/**
 * Report a mic failure the way the phase requires: spoken once, and shown in
 * the thread with the recovery step.
 *
 * The thread rather than a toast because it is the companion talking, and a
 * spoken sentence with no written copy is one a user cannot re-read.
 */
function reportVoiceError(text: string): void {
  useCompanionStore.getState().addTurn({ role: 'companion', text, spoken: true });
  void companionTtsSpeaker.speak(text);
}

/**
 * `push` releases to stop; `toggle` ignores the release and stops on the next
 * press.
 *
 * Implemented here rather than in the input bar so Theme C's component stays
 * as it shipped: it emits a press and a release, and what those *mean* is a
 * preference this layer owns. The mode is read per gesture, so flipping it in
 * Settings mid-session takes effect on the next press rather than the next
 * launch.
 */
async function micPressStart(): Promise<void> {
  const mode = useUiStore.getState().companionMicMode;
  if (mode === 'toggle' && isRecording()) {
    await finishRecording();
    return;
  }
  if (isRecording()) return;

  // A press is the user taking the floor — the same rule the textarea's first
  // keystroke follows.
  companionTtsSpeaker.cancel();
  stopCompanionPersonality();
  useCompanionStore.getState().send('listen');

  try {
    await startRecording();
  } catch (error) {
    useCompanionStore.getState().send('interrupt');
    reportVoiceError(
      error instanceof RecorderError ? error.message : recorderErrorMessage('failed'),
    );
  }
}

async function micPressEnd(): Promise<void> {
  // In toggle mode the release is not the end of anything; the next press is.
  if (useUiStore.getState().companionMicMode === 'toggle') return;
  await finishRecording();
}

/**
 * Stop, transcribe, and hand the text to the textarea **unsent**.
 *
 * Unsent is the phase's default and the reason the transcript goes through
 * `transcriptSink` rather than `submit`: recognition is wrong often enough
 * that a command sent unread is a command nobody authorised. Hands-free
 * submission is Theme E's, gated on its own switch and only after the
 * companion has said the command aloud.
 */
async function finishRecording(): Promise<void> {
  if (!isRecording()) {
    useCompanionStore.getState().send('interrupt');
    return;
  }

  const store = useCompanionStore.getState();
  let result: GitOpResult<{ text: string }>;
  try {
    result = await transcribe(await stopRecording());
  } catch (error) {
    result = failure(error instanceof Error ? error.message : recorderErrorMessage('failed'));
  }

  // Out of `listening` either way — the state is left on transcript arrival
  // *or* cancel, and a failed transcription is the latter.
  store.send('interrupt');

  if (!result.ok) {
    reportVoiceError(result.kind === 'error' ? result.message : recorderErrorMessage('failed'));
    return;
  }
  if (result.value.text.length === 0) {
    reportVoiceError('I did not catch that. Try again, a little closer to the microphone.');
    return;
  }
  companionPorts().transcriptSink(result.value.text);
}

/**
 * Claim the four members, and apply the persisted volume.
 *
 * A named function as well as the call below, so a test can put the registry
 * back to its defaults and re-register rather than having to reset the whole
 * module graph — resetting modules would give this file a *different* copy of
 * `companion-ports` and of the stores than the test holds, which is a subtle
 * enough trap to be worth one export.
 *
 * The volume is applied here because the slider writes both the store and the
 * live master gain, but a relaunch restores only the store — and the
 * `AudioContext` it would have to tell does not exist yet. Reading it at boot
 * means the first whistle of a session is already at the right volume rather
 * than at 1.
 */
export function registerVoicePorts(): void {
  setCompanionPorts({
    interrupt,
    micAvailable,
    micPressStart: () => {
      void micPressStart();
    },
    micPressEnd: () => {
      void micPressEnd();
    },
  });
  setCompanionVolume(useUiStore.getState().companionVolume);
}

registerVoicePorts();

/** Reset the availability cache. Tests only. */
export function __resetVoicePortsForTest(): void {
  micReady = false;
  micProbe = null;
}
