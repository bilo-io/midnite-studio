import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';

import {
  failure,
  ok,
  type GitOpResult,
  type MediaExportFormat,
  type MediaExportOptions,
  type MediaExportProgressEvent,
} from '@midnite/studio-shared';

/**
 * The ffmpeg export service (Phase 99 Theme A). ffmpeg is a required
 * *external* tool — probed, never bundled (Phase 44's no-binaries rule).
 *
 * Always an argv array handed to `spawn` with no shell, so a file name can
 * never become a command. The per-format presets are the one table below;
 * Themes C–E add knobs through `MediaExportOptions`, not new code paths.
 */

type FfmpegFormat = Exclude<MediaExportFormat, 'md' | 'html' | 'pdf' | 'obj' | 'fbx'>;

/** jpeg's `-q:v` runs 2 (best) … 31 (worst); map a 1–100 quality onto it. */
export const jpegQscale = (quality: number): number =>
  Math.round(31 - (Math.min(Math.max(quality, 1), 100) / 100) * 29);

const videoScale = (scale: number | undefined): string[] =>
  scale && scale !== 1 ? ['-vf', `scale=trunc(iw*${scale}/2)*2:-2`] : [];

/** Codec args per format, between `-i <input>` and the output path. */
export const FFMPEG_PRESETS: Record<FfmpegFormat, (options: MediaExportOptions) => string[]> = {
  png: () => ['-frames:v', '1', '-c:v', 'png'],
  jpeg: (o) => ['-frames:v', '1', '-q:v', String(jpegQscale(o.quality ?? 90))],
  webp: (o) => ['-frames:v', '1', '-c:v', 'libwebp', '-quality', String(o.quality ?? 90)],
  mp4: (o) => [
    ...videoScale(o.scale),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
  ],
  webm: (o) => [...videoScale(o.scale), '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus'],
  gif: (o) => ['-vf', `fps=12,scale=trunc(iw*${o.scale ?? 1}/2)*2:-2:flags=lanczos`, '-loop', '0'],
  prores: (o) => [...videoScale(o.scale), '-c:v', 'prores_ks', '-profile:v', '3', '-c:a', 'pcm_s16le'],
  mp3: (o) => ['-vn', '-c:a', 'libmp3lame', '-b:a', `${o.bitrateKbps ?? 192}k`],
  wav: () => ['-vn', '-c:a', 'pcm_s16le'],
  flac: () => ['-vn', '-c:a', 'flac'],
};

export const isFfmpegFormat = (format: MediaExportFormat): format is FfmpegFormat =>
  format in FFMPEG_PRESETS;

/** The full argv (without the binary itself) for one export. */
export function buildFfmpegArgs(
  format: FfmpegFormat,
  input: string,
  output: string,
  options: MediaExportOptions = {},
): string[] {
  return ['-hide_banner', '-nostdin', '-y', '-i', input, ...FFMPEG_PRESETS[format](options), output];
}

const toSeconds = (h: string, m: string, s: string): number => Number(h) * 3600 + Number(m) * 60 + Number(s);

/** `Duration: 00:01:02.50` in ffmpeg's banner → seconds. */
export function parseFfmpegDuration(chunk: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(chunk);
  return match ? toSeconds(match[1]!, match[2]!, match[3]!) : null;
}

/** The last `time=00:00:10.00` in a stderr chunk → seconds. */
export function parseFfmpegTime(chunk: string): number | null {
  let last: number | null = null;
  for (const match of chunk.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)) {
    last = toSeconds(match[1]!, match[2]!, match[3]!);
  }
  return last;
}

export type SpawnFn = (command: string, args: string[]) => ChildProcess;

export type ExportDeps = {
  ffmpegPath: string;
  emit: (event: MediaExportProgressEvent) => void;
  spawn?: SpawnFn;
};

const running = new Map<string, ChildProcess>();
const cancelled = new Set<string>();

/**
 * Run one export to completion. Resolves (never rejects) with `{dest}` or a
 * failure; progress streams through `deps.emit`. Cancellable by `exportId`.
 */
export function runFfmpegExport(
  req: { exportId: string; format: FfmpegFormat; input: string; dest: string; options?: MediaExportOptions },
  deps: ExportDeps,
): Promise<GitOpResult<{ dest: string }>> {
  const spawn = deps.spawn ?? ((cmd, args) => nodeSpawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }));
  const args = buildFfmpegArgs(req.format, req.input, req.dest, req.options);
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(deps.ffmpegPath, args);
    } catch (error) {
      resolve(failure(error instanceof Error ? error.message : String(error)));
      return;
    }
    running.set(req.exportId, child);
    deps.emit({ exportId: req.exportId, status: 'running' });

    let duration: number | null = null;
    let tail = '';
    child.stderr?.on('data', (buf: Buffer) => {
      const chunk = buf.toString();
      tail = (tail + chunk).slice(-4000);
      duration ??= parseFfmpegDuration(tail);
      const time = parseFfmpegTime(chunk);
      if (duration && time !== null) {
        deps.emit({
          exportId: req.exportId,
          status: 'running',
          progress: Math.min(1, Math.max(0, time / duration)),
        });
      }
    });

    const finish = (result: GitOpResult<{ dest: string }>, event: MediaExportProgressEvent): void => {
      running.delete(req.exportId);
      cancelled.delete(req.exportId);
      deps.emit(event);
      resolve(result);
    };

    child.on('error', (error) =>
      finish(failure(error.message), { exportId: req.exportId, status: 'failed', error: error.message }),
    );
    child.on('close', (code) => {
      if (cancelled.has(req.exportId)) {
        finish(failure('cancelled'), { exportId: req.exportId, status: 'cancelled' });
      } else if (code === 0) {
        finish(ok({ dest: req.dest }), { exportId: req.exportId, status: 'succeeded', progress: 1 });
      } else {
        const error = tail.trim().split('\n').slice(-3).join('\n') || `ffmpeg exited with ${code}`;
        finish(failure(error), { exportId: req.exportId, status: 'failed', error });
      }
    });
  });
}

export function cancelFfmpegExport(exportId: string): GitOpResult {
  const child = running.get(exportId);
  if (!child) return failure('No such export.');
  cancelled.add(exportId);
  child.kill('SIGTERM');
  return ok();
}

/** Tests only. */
export function resetExportsForTest(): void {
  running.clear();
  cancelled.clear();
}
