import type { MidniteStudioBridge } from '@midnite/studio-shared';

/**
 * A screen recording, renderer side (Phase 113 Theme K). The user picked a source and pressed Record:
 *
 * 1. main **arms** that source (one-shot, a few seconds);
 * 2. `getDisplayMedia` asks for a stream — main's display-media handler answers with the armed source
 *    only, video only; there is no picker and no other source it could hand out;
 * 3. `MediaRecorder` writes WebM in one-second slices, each sent to main in order — main checks the
 *    container, the slice size and the running total, and stops the recording past its cap;
 * 4. Stop (or the source going away) finishes it: main renames the file into place and lists it.
 *
 * The media APIs are injected so the flow is tested without a real stream.
 */
export type RecorderMedia = {
  getDisplayMedia: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mimeType: string) => MediaRecorder;
  isTypeSupported: (mime: string) => boolean;
  now: () => number;
};

export const browserRecorderMedia = (): RecorderMedia => ({
  getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
  createRecorder: (stream, mimeType) => new MediaRecorder(stream, { mimeType }),
  isTypeSupported: (mime) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime),
  now: () => Date.now(),
});

export const RECORDING_SLICE_MS = 1_000;

export function pickRecordingMime(isTypeSupported: (mime: string) => boolean): string {
  for (const mime of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
    if (isTypeSupported(mime)) return mime;
  return 'video/webm';
}

export type ActiveRecording = {
  /** Stops recording and resolves once main has the whole file. */
  stop: () => Promise<{ ok: true; id: string } | { ok: false; message: string }>;
  /** Resolves when the recording ends on its own (the source closed, a cap was reached). */
  ended: Promise<void>;
};

type CaptureApi = MidniteStudioBridge['capture'];

export async function startRecording(
  api: CaptureApi,
  sourceId: string,
  media: RecorderMedia,
): Promise<{ ok: true; recording: ActiveRecording } | { ok: false; message: string }> {
  const armed = await api.recordingArm({ sourceId });
  if (!armed.ok)
    return {
      ok: false,
      message: armed.kind === 'error' ? armed.message : 'Could not start recording.',
    };

  let stream: MediaStream;
  try {
    stream = await media.getDisplayMedia({ video: true, audio: false });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The screen stream was refused.',
    };
  }
  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());

  const mime = pickRecordingMime(media.isTypeSupported);
  const begun = await api.recordingBegin({ mime });
  if (!begun.ok) {
    stopTracks();
    return {
      ok: false,
      message: begun.kind === 'error' ? begun.message : 'Could not start recording.',
    };
  }
  const { recordingId } = begun.value;
  const startedAt = media.now();
  const recorder = media.createRecorder(stream, mime);

  let failed: string | null = null;
  let uploads: Promise<void> = Promise.resolve();
  let resolveEnded: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  recorder.ondataavailable = (event: BlobEvent) => {
    const blob = event.data;
    if (!blob || blob.size === 0) return;
    uploads = uploads.then(async () => {
      if (failed) return;
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const result = await api.recordingChunk({ recordingId, bytes });
        if (result.ok) return;
        failed = result.kind === 'error' ? result.message : 'The recording was stopped.';
      } catch (error) {
        failed = error instanceof Error ? error.message : 'The recording was stopped.';
      }
      if (recorder.state !== 'inactive') recorder.stop();
    });
  };

  recorder.addEventListener('stop', () => {
    stopTracks();
    resolveEnded();
  });
  // The user closing the shared window, or the display going away, ends the track: stop with it.
  for (const track of stream.getVideoTracks())
    track.addEventListener('ended', () => {
      if (recorder.state !== 'inactive') recorder.stop();
    });

  recorder.start(RECORDING_SLICE_MS);

  type Outcome = { ok: true; id: string } | { ok: false; message: string };
  let outcome: Promise<Outcome> | null = null;
  const finish = async (): Promise<Outcome> => {
    if (recorder.state !== 'inactive') recorder.stop();
    // `stop()` flips the state at once but delivers the last slice, then `stop`, later: wait for the event.
    await ended;
    await uploads;
    if (failed) {
      await api.recordingAbort({ recordingId });
      return { ok: false, message: failed };
    }
    const done = await api.recordingFinish({
      recordingId,
      durationMs: Math.max(0, Math.round(media.now() - startedAt)),
    });
    return done.ok
      ? { ok: true, id: done.value.id }
      : {
          ok: false,
          message: done.kind === 'error' ? done.message : 'The recording could not be saved.',
        };
  };

  return {
    ok: true,
    // Stop is idempotent: the button and a recording that ended on its own both finish it once.
    recording: { ended, stop: () => (outcome ??= finish()) },
  };
}
