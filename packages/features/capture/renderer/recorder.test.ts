// vitest/jsdom: the recording flow over a fake stream and recorder — no real screen.
import { describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { pickRecordingMime, startRecording, type RecorderMedia } from './recorder';

function fakeMedia(slices: number[][]): RecorderMedia & { trackStopped: () => boolean } {
  let stopped = false;
  return {
    trackStopped: () => stopped,
    getDisplayMedia: async () => {
      const track = Object.assign(new EventTarget(), { stop: () => (stopped = true) });
      return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    },
    createRecorder: () => {
      const target = new EventTarget();
      const recorder = Object.assign(target, {
        state: 'inactive' as RecordingState,
        ondataavailable: null as ((e: BlobEvent) => void) | null,
        start: () => {
          recorder.state = 'recording';
        },
        stop: () => {
          if (recorder.state === 'inactive') return;
          recorder.state = 'inactive';
          queueMicrotask(() => {
            for (const slice of slices) {
              const bytes = Uint8Array.from(slice);
              recorder.ondataavailable?.({
                data: { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer },
              } as unknown as BlobEvent);
            }
            target.dispatchEvent(new Event('stop'));
          });
        },
      });
      return recorder as unknown as MediaRecorder;
    },
    isTypeSupported: () => false,
    now: () => 0,
  };
}

function api(overrides: Partial<MidniteStudioBridge['capture']> = {}) {
  return {
    recordingArm: vi.fn(async () => ({ ok: true })),
    recordingBegin: vi.fn(async () => ({ ok: true, value: { recordingId: 'rec-abcdef' } })),
    recordingChunk: vi.fn(async () => ({ ok: true })),
    recordingFinish: vi.fn(async () => ({
      ok: true,
      value: { id: 'cap-20261018-093000-abcdef12' },
    })),
    recordingAbort: vi.fn(async () => ({ ok: true })),
    ...overrides,
  } as unknown as MidniteStudioBridge['capture'] & Record<string, ReturnType<typeof vi.fn>>;
}

describe('startRecording', () => {
  it('falls back to plain WebM', () => {
    expect(pickRecordingMime(() => false)).toBe('video/webm');
    expect(pickRecordingMime((m) => m.endsWith('vp8'))).toBe('video/webm;codecs=vp8');
  });

  it('never asks for a stream when main refuses to arm the source', async () => {
    const media = fakeMedia([]);
    const getDisplayMedia = vi.spyOn(media, 'getDisplayMedia');
    const result = await startRecording(
      api({
        recordingArm: vi.fn(async () => ({ ok: false, kind: 'error', message: 'nope' })),
      } as never),
      'screen:1:0',
      media,
    );
    expect(result).toEqual({ ok: false, message: 'nope' });
    expect(getDisplayMedia).not.toHaveBeenCalled();
  });

  it('uploads every slice in order, then finishes once however often stop is pressed', async () => {
    const bridge = api();
    const media = fakeMedia([
      [0x1a, 0x45, 0xdf, 0xa3],
      [1, 2],
    ]);
    const started = await startRecording(bridge, 'screen:1:0', media);
    if (!started.ok) throw new Error(started.message);
    const [a, b] = await Promise.all([started.recording.stop(), started.recording.stop()]);
    expect(a).toEqual({ ok: true, id: 'cap-20261018-093000-abcdef12' });
    expect(b).toBe(a);
    expect(bridge.recordingChunk).toHaveBeenCalledTimes(2);
    expect(bridge.recordingFinish).toHaveBeenCalledTimes(1);
    expect(media.trackStopped()).toBe(true);
  });

  it('aborts when main refuses a slice (a cap, or not WebM)', async () => {
    const bridge = api({
      recordingChunk: vi.fn(async () => ({
        ok: false,
        kind: 'error',
        message: 'A recording must be WebM.',
      })),
    } as never);
    const started = await startRecording(bridge, 'screen:1:0', fakeMedia([[0x89, 0x50]]));
    if (!started.ok) throw new Error(started.message);
    expect(await started.recording.stop()).toEqual({
      ok: false,
      message: 'A recording must be WebM.',
    });
    expect(bridge.recordingAbort).toHaveBeenCalledWith({ recordingId: 'rec-abcdef' });
    expect(bridge.recordingFinish).not.toHaveBeenCalled();
  });
});
