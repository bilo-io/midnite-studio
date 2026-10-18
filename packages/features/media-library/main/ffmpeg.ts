import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { basename, delimiter, isAbsolute, join } from 'node:path';
import type { Readable } from 'node:stream';

import type { LibraryFfmpegStatus, LibraryItem } from '@midnite/studio-shared';

import { extensionOf } from './classify';
import type { MediaProbe } from './index-store';

/**
 * The library's use of a **system ffmpeg** (Phase 113 Theme R slice 2) — found on the machine, never bundled
 * (no `ffmpeg-static`, no libav build in the repo or the app: licensing). It does two things, both only for the
 * LAN server and only when the user has switched transcoding on: read what a file holds (`probe`), and stream
 * one a browser cannot play as fragmented MP4 (H.264 + AAC). Every spawn is an argument array — never a shell
 * string — with an input path that came from `LibraryService.resolveFile`.
 */

// --- finding it -------------------------------------------------------------------

/** Where Homebrew (Apple silicon, then Intel) and MacPorts put it, in that order, before `PATH`. */
export const FFMPEG_CANDIDATES: ReadonlyArray<{ path: string; source: 'homebrew' | 'macports' }> = [
  { path: '/opt/homebrew/bin/ffmpeg', source: 'homebrew' },
  { path: '/usr/local/bin/ffmpeg', source: 'homebrew' },
  { path: '/opt/local/bin/ffmpeg', source: 'macports' },
];

/** A user-set ffmpeg must be an absolute path to a file named `ffmpeg` — the setting cannot run anything else. */
export function isFfmpegPathShaped(path: string): boolean {
  return isAbsolute(path) && /^ffmpeg(\.exe)?$/i.test(basename(path));
}

export type LocateDeps = {
  /** The user's path from settings, or null. */
  configured: string | null;
  /** Whether a path is an executable file. */
  isExecutable?: (path: string) => Promise<boolean>;
  /** `PATH`, as main sees it. */
  pathEnv?: string;
};

export const isExecutableFile = async (path: string): Promise<boolean> => {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Where ffmpeg is. A path the user set is used as it is — when it is missing or not executable the answer is "not
 * found", with that reason, rather than a silent fall-back to some other binary.
 */
export async function locateFfmpeg(deps: LocateDeps): Promise<LibraryFfmpegStatus> {
  const executable = deps.isExecutable ?? isExecutableFile;
  if (deps.configured !== null) {
    if (!isFfmpegPathShaped(deps.configured))
      return {
        found: false,
        path: null,
        source: null,
        reason: 'The ffmpeg path in settings must be an absolute path to a file named ffmpeg.',
      };
    return (await executable(deps.configured))
      ? { found: true, path: deps.configured, source: 'setting' }
      : {
          found: false,
          path: null,
          source: null,
          reason: 'No runnable ffmpeg at the path in settings.',
        };
  }
  for (const candidate of FFMPEG_CANDIDATES)
    if (await executable(candidate.path))
      return { found: true, path: candidate.path, source: candidate.source };
  for (const dir of (deps.pathEnv ?? '').split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    const path = join(dir, 'ffmpeg');
    if (await executable(path)) return { found: true, path, source: 'path' };
  }
  return {
    found: false,
    path: null,
    source: null,
    reason: 'ffmpeg was not found. Install it (for example `brew install ffmpeg`) or set its path.',
  };
}

// --- reading what a file holds -----------------------------------------------------

/**
 * `ffmpeg -i <file>`'s stderr → container and codecs. ffmpeg with an input and no output prints the input's
 * streams and exits non-zero; that banner is all a probe needs, so no `ffprobe` is required. An attached picture
 * (an MP3's cover, an MKV's poster) is not counted as the video stream.
 */
export function parseProbe(stderr: string, file: { size: number; mtimeMs: number }): MediaProbe {
  const container = /^Input #0, (.+?), from /m.exec(stderr)?.[1]?.trim() ?? null;
  let video: string | null = null;
  let audio: string | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const match = /^\s*Stream #\d+:\d+[^:]*: (Video|Audio): ([A-Za-z0-9_]+)/.exec(line);
    if (!match) continue;
    const codec = (match[2] ?? '').toLowerCase();
    if (match[1] === 'Video') {
      if (video === null && !/attached pic/i.test(line)) video = codec;
    } else if (audio === null) audio = codec;
  }
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const durationS = duration
    ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
    : null;
  return {
    size: file.size,
    mtimeMs: file.mtimeMs,
    container,
    video,
    audio,
    durationS: durationS !== null && Number.isFinite(durationS) ? durationS : null,
  };
}

// --- what a browser plays ------------------------------------------------------------

/**
 * Formats every current browser plays — Safari on a phone or a TV's browser as much as Chrome — so "direct"
 * means the file goes out as it is. Conservative on purpose: HEVC plays in Safari but not everywhere, so it is
 * transcoded; Matroska is transcoded even holding H.264 (a remux, `-c:v copy`, is cheap).
 */
const DIRECT_VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm']);
const DIRECT_AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wav']);
const MP4_VIDEO = new Set(['h264']);
const MP4_AUDIO = new Set(['aac', 'mp3']);
const WEBM_VIDEO = new Set(['vp8', 'vp9', 'av1']);
const WEBM_AUDIO = new Set(['opus', 'vorbis']);
const DIRECT_MUSIC_CODECS = new Set([
  'mp3',
  'aac',
  'flac',
  'opus',
  'vorbis',
  'pcm_s16le',
  'pcm_s24le',
]);

/** How the LAN server hands an item out: as it is, through ffmpeg, or not at all. */
export type PlaybackPlan = 'direct' | 'transcode' | 'unplayable';

/** Whether, by what ffmpeg read, a browser plays the file as it is. */
export function browserPlays(item: Pick<LibraryItem, 'kind' | 'path'>, probe: MediaProbe): boolean {
  const ext = extensionOf(item.path.split('/').at(-1) ?? item.path);
  const container = probe.container ?? '';
  if (item.kind === 'music')
    return (
      probe.audio !== null && DIRECT_MUSIC_CODECS.has(probe.audio) && DIRECT_AUDIO_EXT.has(ext)
    );
  if (probe.video === null) return false;
  const audioOk = (allowed: Set<string>) => probe.audio === null || allowed.has(probe.audio);
  if (container.startsWith('mov,mp4') && (ext === 'mp4' || ext === 'm4v' || ext === 'mov'))
    return MP4_VIDEO.has(probe.video) && audioOk(MP4_AUDIO);
  if (container.startsWith('matroska,webm') && ext === 'webm')
    return WEBM_VIDEO.has(probe.video) && audioOk(WEBM_AUDIO);
  return false;
}

/**
 * The plan for one item. With a probe (ffmpeg found), the probe decides; without one, the file's extension does
 * — and what the extension cannot vouch for is unplayable, since nothing could convert it.
 */
export function playbackPlan(
  item: Pick<LibraryItem, 'kind' | 'path'>,
  probe: MediaProbe | null,
  canTranscode: boolean,
): PlaybackPlan {
  if (item.kind === 'photo') return 'direct';
  if (probe) {
    if (browserPlays(item, probe)) return 'direct';
    const hasStream = item.kind === 'music' ? probe.audio !== null : probe.video !== null;
    return canTranscode && hasStream ? 'transcode' : 'unplayable';
  }
  const ext = extensionOf(item.path.split('/').at(-1) ?? item.path);
  const direct = item.kind === 'music' ? DIRECT_AUDIO_EXT.has(ext) : DIRECT_VIDEO_EXT.has(ext);
  if (direct) return 'direct';
  return canTranscode ? 'transcode' : 'unplayable';
}

// --- what ffmpeg may open ------------------------------------------------------------

/**
 * Input options placed before every `-i`. ffmpeg picks a demuxer by a file's *content*, not its extension, so a
 * library file that is really an HLS playlist or a `concat` script (saved as `.mkv`) could make it fetch URLs or
 * read other local files. `file` is the only protocol it may use, and the format whitelist names real media
 * containers only — `hls` and `concat` are deliberately absent.
 */
export const FFMPEG_INPUT_GUARD: readonly string[] = [
  '-protocol_whitelist',
  'file',
  '-format_whitelist',
  'matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,avi,mpegts,mpeg,flv,asf,ogg,mp3,flac,wav,aiff,aac',
];

/** The probe's arguments: the guard, then `-i <input>`; no output, so ffmpeg prints the banner and exits. */
export function probeArgs(input: string): string[] {
  return ['-hide_banner', '-nostdin', ...FFMPEG_INPUT_GUARD, '-i', input];
}

// --- converting --------------------------------------------------------------------------

/** Fragmented MP4 that a `<video>` can start playing before ffmpeg has finished. */
const FRAGMENTED = [
  '-movflags',
  'frag_keyframe+empty_moov+default_base_moof',
  '-f',
  'mp4',
  'pipe:1',
];

/**
 * ffmpeg's arguments for one transcode — an array, never a shell string. `input` is `resolveFile`'s absolute
 * path (so it can never be read as an option); what is already H.264 or AAC is copied, not re-encoded.
 */
export function transcodeArgs(
  input: string,
  kind: LibraryItem['kind'],
  probe: MediaProbe | null,
): string[] {
  if (!isAbsolute(input)) throw new Error('transcode input must be an absolute path');
  const head = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    ...FFMPEG_INPUT_GUARD,
    '-i',
    input,
  ];
  if (kind === 'music')
    return [
      ...head,
      '-map',
      '0:a:0',
      '-vn',
      '-sn',
      '-dn',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      ...FRAGMENTED,
    ];
  const video =
    probe?.video === 'h264'
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
  const audio =
    probe?.audio === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'];
  return [
    ...head,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-sn',
    '-dn',
    ...video,
    ...audio,
    ...FRAGMENTED,
  ];
}

/** The content type a transcode answers with. */
export const transcodeContentType = (kind: LibraryItem['kind']): string =>
  kind === 'music' ? 'audio/mp4' : 'video/mp4';

// --- the process port ---------------------------------------------------------------------

/** A running transcode: its stdout is the stream; `kill` ends it. */
export type TranscodeProcess = {
  stdout: Readable;
  kill: () => void;
  onExit: (listener: () => void) => void;
};

/** How the library runs ffmpeg — injected, so no test ever spawns the real one. */
export type FfmpegPort = {
  /** `ffmpeg -hide_banner -nostdin -i <input>`'s stderr. */
  probe: (ffmpegPath: string, input: string) => Promise<string>;
  transcode: (ffmpegPath: string, args: string[]) => TranscodeProcess;
};

const PROBE_TIMEOUT_MS = 15_000;
const PROBE_STDERR_CAP = 64 * 1024;

/** The real port: `child_process.spawn` with an argument array and no shell. */
export const nodeFfmpegPort: FfmpegPort = {
  probe: (ffmpegPath, input) =>
    new Promise((resolve) => {
      if (!isAbsolute(input)) {
        resolve('');
        return;
      }
      const child = spawn(ffmpegPath, probeArgs(input), {
        shell: false,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS);
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        if (stderr.length < PROBE_STDERR_CAP) stderr += chunk;
      });
      const done = () => {
        clearTimeout(timer);
        resolve(stderr.slice(0, PROBE_STDERR_CAP));
      };
      child.on('error', done);
      child.on('close', done);
    }),
  transcode: (ffmpegPath, args) => {
    const child = spawn(ffmpegPath, args, { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    child.on('error', () => undefined);
    return {
      stdout: child.stdout as Readable,
      kill: () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      },
      onExit: (listener) => {
        child.once('close', listener);
        child.once('error', listener);
      },
    };
  },
};
