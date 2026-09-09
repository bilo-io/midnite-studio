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
 * Why the mic is (or isn't) usable, richer than the boolean the port exposes.
 *
 * `checking` is the state before the first probe resolves — distinct from
 * `no-key` so the tooltip can say "checking…" instead of accusing a user of
 * never having visited Settings. `not-implemented` is Deepgram today: a key
 * can be saved for it (Settings does not stop you, and `STT_PROVIDER_LABELS`
 * says so in the option text alone), `sttStatus().configured` reports it
 * honestly as configured, but there is no factory behind it in main — so
 * `micReady` must require an *implemented* configured provider, not merely a
 * configured one, or the button lies about being usable.
 */
type MicAvailabilityStatus =
  | 'checking'
  | 'no-bridge'
  | 'no-key'
  | 'no-key-no-keychain'
  | 'not-implemented'
  | 'available';

/**
 * Cached, and observable.
 *
 * `micAvailable()` is read during render and has to be synchronous, but the
 * answer lives in main behind `safeStorage`. So: a cached status, refreshed
 * lazily on the first read and explicitly after anything that could change it
 * (a Settings save). The cache is *why* this needs to be observable too — a
 * component that reads it once during its own render (the input bar) is never
 * told to look again when Settings changes it out from under a panel that
 * stayed mounted the whole time, which is precisely the bug this once caused:
 * the mic stayed disabled, with the stale "add a key" tooltip, until some
 * unrelated re-render happened to occur. `micListeners` is what closes that
 * gap — `setMicStatus` notifies them synchronously on every change.
 */
let micStatus: MicAvailabilityStatus = 'checking';
let micProbe: Promise<boolean> | null = null;
const micListeners = new Set<() => void>();

function setMicStatus(next: MicAvailabilityStatus): void {
  if (next === micStatus) return;
  micStatus = next;
  for (const listener of micListeners) listener();
}

/** `CompanionPorts['onMicAvailabilityChange']`. */
function onMicAvailabilityChange(listener: () => void): () => void {
  micListeners.add(listener);
  return () => {
    micListeners.delete(listener);
  };
}

/** Re-ask main whether an implemented provider has a key stored. Called after a Settings save. */
export function refreshMicAvailability(): Promise<boolean> {
  const companion = bridge()?.companion;
  if (!companion?.sttStatus) {
    setMicStatus('no-bridge');
    return Promise.resolve(false);
  }
  micProbe ??= companion
    .sttStatus()
    .then((status) => {
      const usable = status.configured.some((provider) => status.implemented.includes(provider));
      if (usable) {
        setMicStatus('available');
      } else if (status.configured.length > 0) {
        // A key is stored, but for nothing main can transcribe with — the
        // Deepgram-shaped case, and the one the plain boolean used to hide.
        setMicStatus('not-implemented');
      } else if (!status.encryptionAvailable) {
        // No key *and* no working keychain — the same "add a key" fix, but
        // it will not survive a relaunch, which the tooltip should say.
        setMicStatus('no-key-no-keychain');
      } else {
        setMicStatus('no-key');
      }
      return usable;
    })
    .catch(() => {
      // A bridge that answered nothing is "not configured" — the mic button
      // stays disabled with its reason, which is the honest state.
      setMicStatus('no-key');
      return false;
    })
    .finally(() => {
      micProbe = null;
    });
  return micProbe;
}

function micAvailable(): boolean {
  if (micStatus === 'checking' && micProbe === null) void refreshMicAvailability();
  return micStatus === 'available';
}

/** `CompanionPorts['micUnavailableReason']`. */
function micUnavailableReason(): string {
  switch (micStatus) {
    case 'available':
      // Unspecified per the port's own contract; kept honest rather than
      // returning `''` and inviting a caller to render it by mistake.
      return 'Hold to talk';
    case 'checking':
      return 'Hold to talk — checking your speech key…';
    case 'no-bridge':
      return 'Hold to talk — voice input isn’t available in this build';
    case 'not-implemented':
      return 'Hold to talk — the saved provider isn’t implemented yet. Choose OpenAI Whisper in Settings ▸ Companion';
    case 'no-key-no-keychain':
      return 'Hold to talk — add a speech key in Settings ▸ Companion (this machine has no working keychain, so it won’t be remembered after a relaunch)';
    case 'no-key':
      return 'Hold to talk — add a speech key in Settings ▸ Companion';
  }
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
  stopAll();
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
    micUnavailableReason,
    onMicAvailabilityChange,
    micPressStart: () => {
      void micPressStart();
    },
    micPressEnd: () => {
      void micPressEnd();
    },
  });
  setCompanionVolume(useUiStore.getState().companionVolume);
}

/**
 * The two triggers no gesture can report: the panel closing, and the window
 * going away.
 *
 * The phase requires everything to stop on six things. Four of them are
 * gestures the panel already routes through `interrupt` — a mic press, a
 * keypress, Escape, a read-back starting. These two are *state* changes, and
 * they are watched here rather than in a component because the component in
 * question is the one that unmounts: a cleanup effect inside the panel cannot
 * be relied on to run before the audio it is meant to stop.
 *
 * `visibilitychange` rather than `blur` for the window, matching Phase 36's
 * visibility gates: a window merely behind another is still a window someone
 * is listening to, while a hidden one is not.
 */
export function watchCompanionSilence(): () => void {
  const unsubscribe = useUiStore.subscribe((state, previous) => {
    if (previous.companionPanelOpen && !state.companionPanelOpen) stopAll();
    // Turning the feature off has to silence it mid-sentence.
    if (previous.companionEnabled && !state.companionEnabled) stopAll();
  });

  const onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') stopAll();
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    unsubscribe();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

function stopAll(): void {
  companionTtsSpeaker.cancel();
  stopCompanionPersonality();
  if (isRecording()) cancelRecording();
}

registerVoicePorts();
/**
 * Kept so a test can dispose it. There is exactly one of these for the life of
 * the renderer — the store subscription and the `visibilitychange` listener
 * both outlive every panel — and a test that left it running would see its own
 * `useUiStore.setState` fire the real one.
 */
let moduleWatcher: (() => void) | null = watchCompanionSilence();

/** Reset the availability cache and drop the module-level watcher. Tests only. */
export function __resetVoicePortsForTest(): void {
  micStatus = 'checking';
  micProbe = null;
  micListeners.clear();
  moduleWatcher?.();
  moduleWatcher = null;
}
