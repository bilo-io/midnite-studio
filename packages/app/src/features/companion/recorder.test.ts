import { COMPANION_RECORDER_MIME, COMPANION_RECORDER_TIMESLICE_MS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import {
  RecorderError,
  classifyMediaError,
  createRecorder,
  preferredRecorderMime,
  recorderErrorMessage,
  type RecorderDeps,
} from './recorder';

/**
 * Phase 79 Theme F — push-to-talk capture.
 *
 * jsdom has neither `getUserMedia` nor `MediaRecorder`, so both are faked. The
 * behaviour worth pinning is what happens around them: the stream being
 * released, the *actual* mime travelling with the bytes, and every failure
 * arriving as a sentence rather than a DOM error name.
 */

type FakeRecorder = {
  state: string;
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start: (timeslice?: number) => void;
  stop: () => void;
};

function harness(over: { mimeType?: string; supported?: string[] } = {}) {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const recorders: FakeRecorder[] = [];
  const transcribed: { audio: Uint8Array; mime: string }[] = [];

  const createRecorderFn = vi.fn((_stream: MediaStream, options: { mimeType?: string }) => {
    const instance: FakeRecorder = {
      state: 'inactive',
      mimeType: over.mimeType ?? options.mimeType ?? '',
      ondataavailable: null,
      onstop: null,
      start: vi.fn(() => {
        instance.state = 'recording';
      }),
      stop: vi.fn(() => {
        instance.state = 'inactive';
        instance.onstop?.();
      }),
    };
    recorders.push(instance);
    return instance as unknown as MediaRecorder;
  });

  const deps: Partial<RecorderDeps> = {
    getUserMedia: vi.fn(async () => stream),
    createRecorder: createRecorderFn,
    isTypeSupported: (mime) => (over.supported ?? [COMPANION_RECORDER_MIME]).includes(mime),
    transcribe: async (req) => {
      transcribed.push({ audio: req.audio, mime: req.mime });
      return { ok: true, value: { text: 'start an adhoc task' } };
    },
  };

  return { deps, tracks, recorders, transcribed, createRecorderFn, stream };
}

/**
 * A `Blob` with a working `arrayBuffer()`.
 *
 * jsdom's `Blob` has `size` and `type` but no `arrayBuffer()` — a jsdom gap,
 * not a product one, and patching it here is narrower than injecting a
 * byte-reader into the recorder purely so a test environment can be satisfied.
 */
function blobOf(bytes: number[], type = ''): Blob {
  const blob = new Blob([new Uint8Array(bytes)], type.length > 0 ? { type } : {});
  Object.defineProperty(blob, 'arrayBuffer', {
    value: async () => new Uint8Array(bytes).buffer,
  });
  return blob;
}

/** Feed a chunk to the recorder the way a 250 ms timeslice would. */
const emit = (recorder: FakeRecorder, text: string): void =>
  recorder.ondataavailable?.({ data: new Blob([text]) });

describe('createRecorder', () => {
  it('asks for audio only — video would be refused outright by the carve-out', async () => {
    const h = harness();
    await createRecorder(h.deps).startRecording();
    expect(h.deps.getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
  });

  it('starts with the timeslice, so a very short press still carries audio', async () => {
    const h = harness();
    await createRecorder(h.deps).startRecording();
    expect(h.recorders[0]?.start).toHaveBeenCalledWith(COMPANION_RECORDER_TIMESLICE_MS);
  });

  it('reports whether it is recording', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    expect(recorder.isRecording()).toBe(false);
    await recorder.startRecording();
    expect(recorder.isRecording()).toBe(true);
    await recorder.stopRecording();
    expect(recorder.isRecording()).toBe(false);
  });

  it('collects the chunks into one blob on stop', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    emit(h.recorders[0]!, 'aaa');
    emit(h.recorders[0]!, 'bb');

    const blob = await recorder.stopRecording();
    expect(blob.size).toBe(5);
  });

  it('drops empty chunks rather than padding the blob with them', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    h.recorders[0]?.ondataavailable?.({ data: new Blob([]) });
    emit(h.recorders[0]!, 'aa');
    expect((await recorder.stopRecording()).size).toBe(2);
  });

  /*
    The whole reason `mime` is a wire field: Chromium may hand back plain
    `audio/webm` where `audio/webm;codecs=opus` was requested, and a provider
    told the wrong container answers 400. The recorder's own `mimeType` is the
    only place that truth exists.
  */
  it('stamps the blob with what the recorder actually produced, not what was asked for', async () => {
    const h = harness({ mimeType: 'audio/webm' });
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    emit(h.recorders[0]!, 'aa');
    expect((await recorder.stopRecording()).type).toBe('audio/webm');
  });

  /*
    An open `MediaStream` between utterances leaves the OS microphone
    indicator lit for the life of the app — for a default-off companion, the
    most alarming thing it could do.
  */
  it('releases every track on stop, so the mic indicator goes out', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    await recorder.stopRecording();
    for (const track of h.tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('releases every track on cancel too', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    recorder.cancelRecording();
    for (const track of h.tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    expect(recorder.isRecording()).toBe(false);
  });

  it('discards what was captured on cancel', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    emit(h.recorders[0]!, 'aaa');
    recorder.cancelRecording();
    expect((await recorder.stopRecording()).size).toBe(0);
  });

  it('answers an empty blob when nothing was recording', async () => {
    const h = harness();
    expect((await createRecorder(h.deps).stopRecording()).size).toBe(0);
  });

  it('refuses a second start rather than orphaning the first stream', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    await expect(recorder.startRecording()).rejects.toMatchObject({ kind: 'busy' });
    expect(h.deps.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('can record again after a stop', async () => {
    const h = harness();
    const recorder = createRecorder(h.deps);
    await recorder.startRecording();
    await recorder.stopRecording();
    await recorder.startRecording();
    expect(h.recorders).toHaveLength(2);
  });

  describe('failures', () => {
    it('maps a refused permission to the System Settings step', async () => {
      const h = harness();
      const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      const recorder = createRecorder({
        ...h.deps,
        getUserMedia: async () => {
          throw denied;
        },
      });

      await expect(recorder.startRecording()).rejects.toBeInstanceOf(RecorderError);
      await expect(recorder.startRecording()).rejects.toMatchObject({
        kind: 'denied',
        message: expect.stringContaining('System Settings'),
      });
      expect(recorder.isRecording()).toBe(false);
    });

    it('says so when there is no microphone at all', async () => {
      const h = harness();
      const recorder = createRecorder({
        ...h.deps,
        getUserMedia: async () => {
          throw Object.assign(new Error('no device'), { name: 'NotFoundError' });
        },
      });
      await expect(recorder.startRecording()).rejects.toMatchObject({ kind: 'no-device' });
    });

    it('says so when the build cannot record at all', async () => {
      const h = harness();
      await expect(
        createRecorder({ ...h.deps, createRecorder: null }).startRecording(),
      ).rejects.toMatchObject({ kind: 'unsupported' });
      await expect(
        createRecorder({ ...h.deps, getUserMedia: null }).startRecording(),
      ).rejects.toMatchObject({ kind: 'unsupported' });
    });

    it('releases the stream when the recorder itself refuses to construct', async () => {
      const h = harness();
      const recorder = createRecorder({
        ...h.deps,
        createRecorder: () => {
          throw new Error('mimeType not supported');
        },
      });

      await expect(recorder.startRecording()).rejects.toMatchObject({ kind: 'failed' });
      for (const track of h.tracks) expect(track.stop).toHaveBeenCalledTimes(1);
      expect(recorder.isRecording()).toBe(false);
    });
  });

  describe('transcribe', () => {
    it('sends raw bytes and the blob\'s own mime, never base64', async () => {
      const h = harness();
      const recorder = createRecorder(h.deps);
      const blob = blobOf([7, 8, 9], 'audio/webm;codecs=opus');

      expect(await recorder.transcribe(blob)).toEqual({
        ok: true,
        value: { text: 'start an adhoc task' },
      });
      expect(h.transcribed[0]?.audio).toBeInstanceOf(Uint8Array);
      expect([...(h.transcribed[0]?.audio ?? [])]).toEqual([7, 8, 9]);
      expect(h.transcribed[0]?.mime).toBe('audio/webm;codecs=opus');
    });

    it('falls back to the requested mime when the blob has none', async () => {
      const h = harness();
      await createRecorder(h.deps).transcribe(blobOf([1]));
      expect(h.transcribed[0]?.mime).toBe(COMPANION_RECORDER_MIME);
    });

    it('refuses an empty blob locally rather than spending a request on it', async () => {
      const h = harness();
      const result = await createRecorder(h.deps).transcribe(new Blob([]));
      expect(result).toMatchObject({ ok: false, kind: 'error' });
      expect(h.transcribed).toEqual([]);
    });

    it('forwards an explicit provider id, for the Settings Test path', async () => {
      const h = harness();
      const forwarded: (string | undefined)[] = [];
      const recorder = createRecorder({
        ...h.deps,
        transcribe: async (req) => {
          forwarded.push(req.providerId);
          return { ok: true, value: { text: '' } };
        },
      });
      await recorder.transcribe(blobOf([1]), 'deepgram');
      expect(forwarded).toEqual(['deepgram']);
    });

    /*
      The default dep, unoverridden: in jsdom there is no `window.midniteStudio`
      at all, which is exactly the state a detached window or a plain-browser
      test run is in. It has to answer the envelope rather than throw.
    */
    it('answers the error arm when no bridge is there at all', async () => {
      const recorder = createRecorder();
      await expect(recorder.transcribe(blobOf([1]))).resolves.toMatchObject({
        ok: false,
        kind: 'error',
      });
    });
  });
});

describe('preferredRecorderMime', () => {
  it('prefers the container OpenAI Whisper takes as-is', () => {
    expect(preferredRecorderMime(() => true)).toBe(COMPANION_RECORDER_MIME);
  });

  it('walks down the list when the first choice is unsupported', () => {
    expect(preferredRecorderMime((mime) => mime === 'audio/mp4')).toBe('audio/mp4');
  });

  /*
    Empty string, not a guess: the recorder then picks its own container and
    the *actual* type travels with the bytes, so a provider is never told the
    wrong one.
  */
  it('yields to the browser rather than asserting a container it cannot produce', () => {
    expect(preferredRecorderMime(() => false)).toBe('');
  });
});

describe('classifyMediaError', () => {
  it('reads the DOM error name, not the per-platform message', () => {
    const named = (name: string): Error => Object.assign(new Error('whatever'), { name });
    expect(classifyMediaError(named('NotAllowedError'))).toBe('denied');
    expect(classifyMediaError(named('SecurityError'))).toBe('denied');
    expect(classifyMediaError(named('NotFoundError'))).toBe('no-device');
    expect(classifyMediaError(named('OverconstrainedError'))).toBe('no-device');
    expect(classifyMediaError(named('NotSupportedError'))).toBe('unsupported');
    expect(classifyMediaError(named('AbortError'))).toBe('failed');
    expect(classifyMediaError('a string')).toBe('failed');
  });
});

describe('recorderErrorMessage', () => {
  it('gives every kind a sentence with a recovery step in it', () => {
    for (const kind of ['denied', 'no-device', 'unsupported', 'failed'] as const) {
      const message = recorderErrorMessage(kind);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toContain('Error');
    }
  });
});
