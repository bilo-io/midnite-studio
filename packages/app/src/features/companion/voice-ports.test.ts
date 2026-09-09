import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { companionPorts, resetCompanionPorts, setCompanionPorts } from './companion-ports';
import {
  __resetVoicePortsForTest,
  refreshMicAvailability,
  registerVoicePorts,
  watchCompanionSilence,
} from './voice-ports';

/**
 * Phase 79 Themes F and G — the seam into Theme C's panel.
 *
 * Every collaborator is mocked, because what is under test is the *wiring*:
 * which port each gesture lands on, what a mode change means for a release,
 * and where a transcript goes. The recorder, the speaker and the scheduler
 * each have their own file.
 */

/*
  `vi.hoisted`, because vitest lifts every `vi.mock` above the imports and a
  factory that closed over an ordinary `const` would run before it existed —
  the same reason `credential-vault.test.ts` hoists its `safeStorage` doubles.
*/
const { speaker, stopCompanionPersonality, setCompanionVolume, recorder } = vi.hoisted(() => ({
  speaker: { speak: vi.fn(() => Promise.resolve()), cancel: vi.fn() },
  stopCompanionPersonality: vi.fn(),
  setCompanionVolume: vi.fn(),
  recorder: {
    startRecording: vi.fn(() => Promise.resolve()),
    stopRecording: vi.fn(() => Promise.resolve(new Blob([]))),
    cancelRecording: vi.fn(),
    isRecording: vi.fn(() => false),
    transcribe: vi.fn((_blob: Blob) =>
      Promise.resolve({ ok: true as const, value: { text: 'hello there' } }),
    ),
  },
}));

vi.mock('./speaker', () => ({ companionTtsSpeaker: speaker }));
vi.mock('./filler', () => ({ stopCompanionPersonality: () => stopCompanionPersonality() }));
vi.mock('./audio/context', () => ({ setCompanionVolume: (v: number) => setCompanionVolume(v) }));
vi.mock('./recorder', async () => {
  const actual = await vi.importActual<typeof import('./recorder')>('./recorder');
  return {
    RecorderError: actual.RecorderError,
    recorderErrorMessage: actual.recorderErrorMessage,
    startRecording: () => recorder.startRecording(),
    stopRecording: () => recorder.stopRecording(),
    cancelRecording: () => recorder.cancelRecording(),
    isRecording: () => recorder.isRecording(),
    transcribe: (blob: Blob) => recorder.transcribe(blob),
  };
});

/*
  Statically imported, and re-registered per test rather than reset through
  `vi.resetModules()`. Resetting the module graph would give `voice-ports` a
  different copy of `companion-ports` and of the two stores than this file
  holds — the registrations would land somewhere the assertions cannot see.
*/
beforeEach(() => {
  vi.clearAllMocks();
  recorder.isRecording.mockReturnValue(false);
  useCompanionStore.setState({ state: 'idle', transcript: [] });
  useUiStore.setState({ companionMicMode: 'push', companionVolume: 0.7 });
  resetCompanionPorts();
  __resetVoicePortsForTest();
  registerVoicePorts();
});

afterEach(() => {
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const installBridge = (
  configured: string[],
  options: { fail?: boolean; implemented?: string[]; encryptionAvailable?: boolean } = {},
): void => {
  const { fail = false, implemented = ['openai-whisper'], encryptionAvailable = true } = options;
  (window as unknown as { midniteStudio: unknown }).midniteStudio = {
    companion: {
      sttStatus: fail
        ? vi.fn(() => Promise.reject(new Error('gone')))
        : vi.fn(() => Promise.resolve({ configured, encryptionAvailable, implemented })),
    },
  };
};

/** Let the port's fire-and-forget promise chain settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the registered ports', () => {
  it('claims exactly the voice half, leaving Theme D/E\'s members alone', () => {
    const ports = companionPorts();
    expect(typeof ports.interrupt).toBe('function');
    expect(typeof ports.micPressStart).toBe('function');
    expect(typeof ports.micPressEnd).toBe('function');
    expect(typeof ports.micAvailable).toBe('function');
    expect(typeof ports.micUnavailableReason).toBe('function');
    expect(typeof ports.onMicAvailabilityChange).toBe('function');
  });

  it('applies the persisted companion volume when it registers', () => {
    expect(setCompanionVolume).toHaveBeenCalledWith(0.7);
  });
});

describe('interrupt', () => {
  it('stops the voice, the personality and a recording in progress', () => {
    recorder.isRecording.mockReturnValue(true);
    companionPorts().interrupt();

    expect(speaker.cancel).toHaveBeenCalledTimes(1);
    expect(stopCompanionPersonality).toHaveBeenCalledTimes(1);
    // Cancel, not stop: an interrupt means the utterance is not wanted, and
    // stopping would send it to be transcribed.
    expect(recorder.cancelRecording).toHaveBeenCalledTimes(1);
    expect(recorder.stopRecording).not.toHaveBeenCalled();
  });

  it('does not touch the recorder when nothing is recording', () => {
    companionPorts().interrupt();
    expect(recorder.cancelRecording).not.toHaveBeenCalled();
  });
});

describe('micAvailable', () => {
  it('is false until main says a key is stored', async () => {
    installBridge(['openai-whisper']);
    expect(companionPorts().micAvailable()).toBe(false);
    await expect(refreshMicAvailability()).resolves.toBe(true);
    expect(companionPorts().micAvailable()).toBe(true);
  });

  it('stays false with no key configured', async () => {
    installBridge([]);
    await expect(refreshMicAvailability()).resolves.toBe(false);
    expect(companionPorts().micAvailable()).toBe(false);
  });

  it('reads a bridge that rejects as "not configured"', async () => {
    installBridge([], { fail: true });
    await expect(refreshMicAvailability()).resolves.toBe(false);
  });

  it('reads no bridge at all as "not configured"', async () => {
    await expect(refreshMicAvailability()).resolves.toBe(false);
  });

  // The reactivity bug this file guards against: `micAvailable()` used to be
  // a plain cached boolean nobody was told to re-read. `onMicAvailabilityChange`
  // is the fix, so it gets exercised directly here rather than only through a
  // component's re-render.
  it('notifies a subscriber the moment availability changes, not on a timer or a poll', async () => {
    installBridge(['openai-whisper']);
    const listener = vi.fn();
    const unsubscribe = companionPorts().onMicAvailabilityChange(listener);

    await refreshMicAvailability();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not notify twice for the same answer', async () => {
    installBridge([]);
    await refreshMicAvailability();
    const listener = vi.fn();
    companionPorts().onMicAvailabilityChange(listener);

    await refreshMicAvailability();

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying once unsubscribed', async () => {
    installBridge(['openai-whisper']);
    const listener = vi.fn();
    const unsubscribe = companionPorts().onMicAvailabilityChange(listener);
    unsubscribe();

    await refreshMicAvailability();

    expect(listener).not.toHaveBeenCalled();
  });

  // A key stored for a provider `sttStatus` reports as `configured` but not
  // `implemented` (Deepgram, today) must not light the mic up — it would
  // work exactly once, until the user presses it and every transcription
  // fails with "not implemented yet".
  it('stays unavailable when the only configured provider has no factory behind it', async () => {
    installBridge(['deepgram'], { implemented: ['openai-whisper'] });
    await expect(refreshMicAvailability()).resolves.toBe(false);
    expect(companionPorts().micAvailable()).toBe(false);
    expect(companionPorts().micUnavailableReason()).toContain('implemented yet');
  });

  it('is available when at least one configured provider is implemented', async () => {
    installBridge(['deepgram', 'openai-whisper'], { implemented: ['openai-whisper'] });
    await expect(refreshMicAvailability()).resolves.toBe(true);
  });

  it('names the missing keychain when nothing is configured and encryption is unavailable', async () => {
    installBridge([], { encryptionAvailable: false });
    await refreshMicAvailability();
    expect(companionPorts().micUnavailableReason()).toContain('keychain');
  });

  it('gives the plain "add a key" reason with no other explanation needed', async () => {
    installBridge([], { encryptionAvailable: true });
    await refreshMicAvailability();
    expect(companionPorts().micUnavailableReason()).toBe(
      'Hold to talk — add a speech key in Settings ▸ Companion',
    );
  });

  it('reports "checking" before the first probe resolves', () => {
    installBridge(['openai-whisper']);
    // No `await` — the probe is in flight, and the reason has to say so
    // rather than accusing the user of never having configured anything.
    void refreshMicAvailability();
    expect(companionPorts().micUnavailableReason()).toContain('checking');
  });
});

describe('push-to-talk', () => {
  it('takes the floor and starts recording on a press', async () => {
    companionPorts().micPressStart();
    await settle();

    expect(speaker.cancel).toHaveBeenCalledTimes(1);
    expect(stopCompanionPersonality).toHaveBeenCalledTimes(1);
    expect(recorder.startRecording).toHaveBeenCalledTimes(1);
    expect(useCompanionStore.getState().state).toBe('listening');
  });

  it('transcribes on release and lands the text in the textarea, unsent', async () => {
    const transcriptSink = vi.fn();
    const submit = vi.fn();
    setCompanionPorts({ transcriptSink, submit });
    recorder.isRecording.mockReturnValue(true);

    companionPorts().micPressEnd();
    await settle();

    expect(recorder.stopRecording).toHaveBeenCalledTimes(1);
    expect(transcriptSink).toHaveBeenCalledExactlyOnceWith('hello there');
    // Never sent: recognition is wrong often enough that a command sent
    // unread is a command nobody authorised.
    expect(submit).not.toHaveBeenCalled();
    expect(useCompanionStore.getState().state).toBe('idle');
  });

  it('speaks and writes a mic failure once, with its recovery step', async () => {
    const { RecorderError } = await import('./recorder');
    recorder.startRecording.mockRejectedValueOnce(
      new RecorderError('denied', 'permission was refused. Allow microphone access.'),
    );

    companionPorts().micPressStart();
    await settle();

    const turns = useCompanionStore.getState().transcript;
    expect(turns).toHaveLength(1);
    expect(turns[0]?.text).toContain('permission was refused');
    expect(speaker.speak).toHaveBeenCalledTimes(1);
    expect(useCompanionStore.getState().state).toBe('idle');
  });

  it('reports a failed transcription rather than silently dropping it', async () => {
    const transcriptSink = vi.fn();
    setCompanionPorts({ transcriptSink });
    recorder.isRecording.mockReturnValue(true);
    recorder.transcribe.mockResolvedValueOnce({
      ok: false,
      kind: 'error',
      message: 'The transcription service rejected the key.',
    } as never);

    companionPorts().micPressEnd();
    await settle();

    expect(transcriptSink).not.toHaveBeenCalled();
    expect(useCompanionStore.getState().transcript[0]?.text).toContain('rejected the key');
  });

  it('says so when the recogniser heard nothing', async () => {
    const transcriptSink = vi.fn();
    setCompanionPorts({ transcriptSink });
    recorder.isRecording.mockReturnValue(true);
    recorder.transcribe.mockResolvedValueOnce({ ok: true, value: { text: '' } } as never);

    companionPorts().micPressEnd();
    await settle();

    expect(transcriptSink).not.toHaveBeenCalled();
    expect(useCompanionStore.getState().transcript[0]?.text).toContain('did not catch that');
  });

  it('leaves listening even when the release finds nothing recording', async () => {
    useCompanionStore.setState({ state: 'listening' });
    companionPorts().micPressEnd();
    await settle();
    expect(useCompanionStore.getState().state).toBe('idle');
    expect(recorder.stopRecording).not.toHaveBeenCalled();
  });
});

describe('tap-to-toggle', () => {
  beforeEach(() => {
    useUiStore.setState({ companionMicMode: 'toggle' });
  });

  /*
    The mode is honoured here rather than in the input bar so Theme C's
    component stays as it shipped: it emits a press and a release, and what
    those *mean* is a preference this layer owns.
  */
  it('ignores the release entirely', async () => {
    recorder.isRecording.mockReturnValue(true);
    companionPorts().micPressEnd();
    await settle();
    expect(recorder.stopRecording).not.toHaveBeenCalled();
  });

  it('stops on the next press instead', async () => {
    const transcriptSink = vi.fn();
    setCompanionPorts({ transcriptSink });

    companionPorts().micPressStart();
    await settle();
    expect(recorder.startRecording).toHaveBeenCalledTimes(1);

    recorder.isRecording.mockReturnValue(true);
    companionPorts().micPressStart();
    await settle();

    expect(recorder.stopRecording).toHaveBeenCalledTimes(1);
    expect(transcriptSink).toHaveBeenCalledWith('hello there');
    // And it did not start a second recording on that press.
    expect(recorder.startRecording).toHaveBeenCalledTimes(1);
  });

  it('reads the mode per gesture, so a Settings change takes effect at once', async () => {
    recorder.isRecording.mockReturnValue(true);
    useUiStore.setState({ companionMicMode: 'push' });
    companionPorts().micPressEnd();
    await settle();
    expect(recorder.stopRecording).toHaveBeenCalledTimes(1);
  });
});

describe('watchCompanionSilence', () => {
  /*
    The two triggers no gesture can report. They are watched from here rather
    than from a cleanup effect inside the panel because the panel is the thing
    that unmounts — its cleanup cannot be relied on to run before the audio it
    is meant to stop.
  */
  it('silences everything when the panel closes', () => {
    useUiStore.setState({ companionPanelOpen: true, companionEnabled: true });
    const stop = watchCompanionSilence();
    try {
      useUiStore.setState({ companionPanelOpen: false });
      expect(speaker.cancel).toHaveBeenCalledTimes(1);
      expect(stopCompanionPersonality).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it('silences everything when the feature is switched off mid-sentence', () => {
    useUiStore.setState({ companionPanelOpen: true, companionEnabled: true });
    const stop = watchCompanionSilence();
    try {
      useUiStore.setState({ companionEnabled: false });
      expect(speaker.cancel).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it('says nothing on the panel merely opening', () => {
    useUiStore.setState({ companionPanelOpen: false });
    const stop = watchCompanionSilence();
    try {
      useUiStore.setState({ companionPanelOpen: true });
      expect(speaker.cancel).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('silences a hidden window, and cancels a recording with it', () => {
    const stop = watchCompanionSilence();
    recorder.isRecording.mockReturnValue(true);
    try {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(speaker.cancel).toHaveBeenCalledTimes(1);
      expect(recorder.cancelRecording).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      stop();
    }
  });

  it('leaves a merely-backgrounded visible window alone', () => {
    const stop = watchCompanionSilence();
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      expect(speaker.cancel).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('stops watching once unsubscribed', () => {
    useUiStore.setState({ companionPanelOpen: true });
    watchCompanionSilence()();
    useUiStore.setState({ companionPanelOpen: false });
    expect(speaker.cancel).not.toHaveBeenCalled();
  });
});
