import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CAPTURE_RECORDING_CHUNK_MAX_BYTES,
  CAPTURE_RECORDING_MAX_BYTES,
  captureFileName,
  failure,
  ok,
  type CaptureItem,
  type GitOpResult,
} from '@midnite/studio-shared';

import type { CaptureStore } from './capture-store';

/**
 * Recordings (Phase 113 Theme K): the renderer records the armed source's stream with `MediaRecorder`
 * and hands the bytes to main in chunks; main checks and writes them.
 *
 * - The container is checked twice: the declared mime must be WebM (the schema), and the first chunk
 *   must open with the EBML magic every WebM file starts with — a renderer cannot slip another file type
 *   into the capture directory under a `.webm` name.
 * - Each chunk is capped ({@link CAPTURE_RECORDING_CHUNK_MAX_BYTES}) and so is the whole recording
 *   ({@link CAPTURE_RECORDING_MAX_BYTES}); the chunk that would cross the cap is refused and the
 *   recording aborted, so the disk never fills behind the user's back.
 * - The file grows under `.partial/` and is renamed into place only on finish; an aborted or abandoned
 *   recording is removed. The name is generated here, never taken from the renderer.
 * - One recording at a time.
 */
const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
export const PARTIAL_DIR = '.partial';

type Active = {
  id: string;
  captureId: string;
  handle: FileHandle;
  path: string;
  bytes: number;
  chunks: number;
  startedAt: number;
};

export type RecordingWriter = {
  begin: (mime: string) => Promise<GitOpResult<{ recordingId: string }>>;
  chunk: (recordingId: string, bytes: Uint8Array) => Promise<GitOpResult>;
  finish: (
    recordingId: string,
    durationMs: number,
    source: { name: string; mode: 'screen' | 'window' } | null,
  ) => Promise<GitOpResult<CaptureItem>>;
  abort: (recordingId: string) => Promise<GitOpResult>;
  /** Closes and removes an unfinished recording (quit). */
  dispose: () => Promise<void>;
};

export function createRecordingWriter(
  store: CaptureStore,
  options: { maxBytes?: number; chunkMaxBytes?: number; now?: () => number } = {},
): RecordingWriter {
  const maxBytes = options.maxBytes ?? CAPTURE_RECORDING_MAX_BYTES;
  const chunkMax = options.chunkMaxBytes ?? CAPTURE_RECORDING_CHUNK_MAX_BYTES;
  const now = options.now ?? Date.now;
  let active: Active | null = null;

  const drop = async (rec: Active) => {
    if (active === rec) active = null;
    await rec.handle.close().catch(() => undefined);
    await rm(rec.path, { force: true }).catch(() => undefined);
  };

  const writer: RecordingWriter = {
    begin: async () => {
      if (active) return failure('A recording is already in progress.');
      const partial = join(store.dir, PARTIAL_DIR);
      await mkdir(partial, { recursive: true });
      const captureId = store.newId();
      const path = join(partial, captureFileName(captureId, 'video/webm'));
      const handle = await open(path, 'wx');
      active = {
        id: `rec-${randomBytes(6).toString('hex')}`,
        captureId,
        handle,
        path,
        bytes: 0,
        chunks: 0,
        startedAt: now(),
      };
      return ok({ recordingId: active.id });
    },
    chunk: async (recordingId, bytes) => {
      const rec = active;
      if (!rec || rec.id !== recordingId) return failure('No such recording.');
      if (bytes.byteLength > chunkMax) {
        await drop(rec);
        return failure('A recording chunk was larger than allowed; the recording was stopped.');
      }
      if (rec.bytes + bytes.byteLength > maxBytes) {
        await drop(rec);
        return failure('The recording reached its size limit and was stopped.');
      }
      if (rec.chunks === 0 && !EBML_MAGIC.every((b, i) => bytes[i] === b)) {
        await drop(rec);
        return failure('A recording must be WebM.');
      }
      if (bytes.byteLength === 0) return ok();
      await rec.handle.write(bytes);
      rec.bytes += bytes.byteLength;
      rec.chunks += 1;
      return ok();
    },
    finish: async (recordingId, durationMs, source) => {
      const rec = active;
      if (!rec || rec.id !== recordingId) return failure('No such recording.');
      if (rec.bytes === 0) {
        await drop(rec);
        return failure('The recording was empty.');
      }
      active = null;
      await rec.handle.close();
      const fileName = captureFileName(rec.captureId, 'video/webm');
      await rename(rec.path, join(store.dir, fileName));
      const item = await store.record({
        id: rec.captureId,
        kind: 'recording',
        mode: source?.mode ?? 'screen',
        mime: 'video/webm',
        fileName,
        createdAt: rec.startedAt,
        durationMs,
        ...(source ? { sourceName: source.name } : {}),
      });
      return ok(item);
    },
    abort: async (recordingId) => {
      const rec = active;
      if (!rec || rec.id !== recordingId) return ok();
      await drop(rec);
      return ok();
    },
    dispose: async () => {
      if (active) await drop(active);
    },
  };
  return writer;
}
