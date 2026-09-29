import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

import { FFMPEG_EXPORT_FORMATS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildFfmpegArgs,
  cancelFfmpegExport,
  jpegQscale,
  parseFfmpegDuration,
  parseFfmpegTime,
  resetExportsForTest,
  runFfmpegExport,
} from './export-service';

afterEach(() => resetExportsForTest());

describe('buildFfmpegArgs', () => {
  const cases: Record<string, string[]> = {
    png: ['-frames:v', '1', '-c:v', 'png'],
    jpeg: ['-frames:v', '1', '-q:v', String(jpegQscale(90))],
    webp: ['-frames:v', '1', '-c:v', 'libwebp', '-quality', '90'],
    mp4: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart'],
    webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus'],
    gif: ['-vf', 'fps=12,scale=trunc(iw*1/2)*2:-2:flags=lanczos', '-loop', '0'],
    prores: ['-c:v', 'prores_ks', '-profile:v', '3', '-c:a', 'pcm_s16le'],
    mp3: ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'],
    wav: ['-vn', '-c:a', 'pcm_s16le'],
    flac: ['-vn', '-c:a', 'flac'],
  };

  it('has one case per ffmpeg format', () => {
    expect(Object.keys(cases).sort()).toEqual([...FFMPEG_EXPORT_FORMATS].sort());
  });

  for (const [format, codec] of Object.entries(cases)) {
    it(`builds an argv array for ${format}`, () => {
      const args = buildFfmpegArgs(format as never, '/in/a b.src', '/out/x; rm -rf ~');
      expect(args).toEqual(['-hide_banner', '-nostdin', '-y', '-i', '/in/a b.src', ...codec, '/out/x; rm -rf ~']);
    });
  }

  it('honours options', () => {
    expect(buildFfmpegArgs('mp3', 'i', 'o', { bitrateKbps: 320 })).toContain('320k');
    expect(buildFfmpegArgs('mp4', 'i', 'o', { scale: 0.5 })).toContain('scale=trunc(iw*0.5/2)*2:-2');
    expect(jpegQscale(100)).toBe(2);
    expect(jpegQscale(1)).toBe(31);
  });
});

describe('progress parsing', () => {
  it('reads duration and the last time=', () => {
    expect(parseFfmpegDuration('  Duration: 00:01:02.50, start')).toBeCloseTo(62.5);
    expect(parseFfmpegTime('time=00:00:01.00 x time=00:00:30.00')).toBe(30);
    expect(parseFfmpegTime('nothing')).toBeNull();
  });
});

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => child.emit('close', null));
  return child;
}

describe('runFfmpegExport', () => {
  it('streams progress and resolves on exit 0', async () => {
    const child = fakeChild();
    const emit = vi.fn();
    const done = runFfmpegExport(
      { exportId: 'e1', format: 'wav', input: 'i', dest: 'o.wav' },
      { ffmpegPath: '/ffmpeg', emit, spawn: () => child as unknown as ChildProcess },
    );
    child.stderr.emit('data', Buffer.from('Duration: 00:00:10.00,'));
    child.stderr.emit('data', Buffer.from('time=00:00:05.00'));
    child.emit('close', 0);
    expect(await done).toEqual({ ok: true, value: { dest: 'o.wav' } });
    expect(emit).toHaveBeenCalledWith({ exportId: 'e1', status: 'running', progress: 0.5 });
    expect(emit).toHaveBeenLastCalledWith({ exportId: 'e1', status: 'succeeded', progress: 1 });
  });

  it('is cancellable', async () => {
    const child = fakeChild();
    const emit = vi.fn();
    const done = runFfmpegExport(
      { exportId: 'e2', format: 'mp4', input: 'i', dest: 'o.mp4' },
      { ffmpegPath: '/ffmpeg', emit, spawn: () => child as unknown as ChildProcess },
    );
    expect(cancelFfmpegExport('e2').ok).toBe(true);
    expect((await done).ok).toBe(false);
    expect(emit).toHaveBeenLastCalledWith({ exportId: 'e2', status: 'cancelled' });
    expect(cancelFfmpegExport('e2').ok).toBe(false);
  });

  it('reports a non-zero exit with stderr', async () => {
    const child = fakeChild();
    const done = runFfmpegExport(
      { exportId: 'e3', format: 'png', input: 'i', dest: 'o.png' },
      { ffmpegPath: '/ffmpeg', emit: vi.fn(), spawn: () => child as unknown as ChildProcess },
    );
    child.stderr.emit('data', Buffer.from('Invalid data found'));
    child.emit('close', 1);
    const result = await done;
    expect(result.ok === false && result.message).toContain('Invalid data');
  });
});
