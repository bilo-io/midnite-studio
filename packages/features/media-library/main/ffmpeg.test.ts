// @vitest-environment node
// vitest: finding ffmpeg, reading its banner and building its arguments are pure logic — no ffmpeg is run.
import { describe, expect, it } from 'vitest';

import {
  FFMPEG_CANDIDATES,
  isFfmpegPathShaped,
  locateFfmpeg,
  parseProbe,
  playbackPlan,
  transcodeArgs,
  FFMPEG_INPUT_GUARD,
  probeArgs,
} from './ffmpeg';

/** Captured from a real `ffmpeg -hide_banner -nostdin -i` over tiny generated fixtures (SCRATCHPAD.md). */
const MKV_HEVC = `Input #0, matroska,webm, from 'fixture.mkv':
  Metadata:
    ENCODER         : Lavf63.1.102
  Duration: 00:00:01.01, start: 0.000000, bitrate: 111 kb/s
  Stream #0:0: Video: hevc (Rext), gbrp(pc, gbr/unknown/unknown, progressive), 64x48 [SAR 1:1 DAR 4:3], 10 fps, 10 tbr, 1k tbn
  Stream #0:1: Audio: opus, 48000 Hz, mono, fltp
At least one output file must be specified`;
const MP4_H264 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'fixture-h264.mp4':
  Duration: 00:00:01.00, start: 0.000000, bitrate: 102 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 64x48, 14 kb/s, 10 fps (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 70 kb/s (default)
At least one output file must be specified`;
const WMA = `Input #0, asf, from 'fixture.wma':
  Duration: 00:00:01.02, start: 0.000000, bitrate: 154 kb/s
  Stream #0:0: Audio: wmav2 (a[1][0][0] / 0x0161), 44100 Hz, mono, fltp, 128 kb/s
At least one output file must be specified`;
const MP3_WITH_COVER = `Input #0, mp3, from 'song.mp3':
  Duration: 00:03:00.00, start: 0.025057, bitrate: 320 kb/s
  Stream #0:0: Audio: mp3 (mp3float), 44100 Hz, stereo, fltp, 320 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 500x500, 90k tbr, 90k tbn (attached pic)`;

const FILE = { size: 10, mtimeMs: 20 };

describe('locateFfmpeg', () => {
  const only =
    (...paths: string[]) =>
    async (path: string) =>
      paths.includes(path);

  it('prefers Homebrew, then MacPorts, then PATH', async () => {
    expect(
      await locateFfmpeg({
        configured: null,
        isExecutable: only('/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg'),
      }),
    ).toEqual({ found: true, path: '/opt/homebrew/bin/ffmpeg', source: 'homebrew' });
    expect(
      await locateFfmpeg({ configured: null, isExecutable: only('/opt/local/bin/ffmpeg') }),
    ).toEqual({
      found: true,
      path: '/opt/local/bin/ffmpeg',
      source: 'macports',
    });
    expect(
      await locateFfmpeg({
        configured: null,
        isExecutable: only('/custom/bin/ffmpeg'),
        pathEnv: 'relative/bin:/custom/bin',
      }),
    ).toEqual({ found: true, path: '/custom/bin/ffmpeg', source: 'path' });
    expect(FFMPEG_CANDIDATES.map((c) => c.path)).not.toContain('ffmpeg');
  });

  it('says why when it is missing', async () => {
    const answer = await locateFfmpeg({
      configured: null,
      isExecutable: only(),
      pathEnv: '/usr/bin',
    });
    expect(answer.found).toBe(false);
    expect(answer.reason).toMatch(/not found/);
  });

  it('uses a user-set path as it is — no fall-back, and only a binary named ffmpeg', async () => {
    expect(
      await locateFfmpeg({ configured: '/tools/ffmpeg', isExecutable: only('/tools/ffmpeg') }),
    ).toEqual({ found: true, path: '/tools/ffmpeg', source: 'setting' });
    const missing = await locateFfmpeg({
      configured: '/tools/ffmpeg',
      isExecutable: only('/opt/homebrew/bin/ffmpeg'),
    });
    expect(missing.found).toBe(false);
    const shell = await locateFfmpeg({ configured: '/bin/sh', isExecutable: only('/bin/sh') });
    expect(shell.found).toBe(false);
    expect(isFfmpegPathShaped('ffmpeg')).toBe(false);
    expect(isFfmpegPathShaped('/usr/bin/ffmpeg-evil')).toBe(false);
    expect(isFfmpegPathShaped('/opt/homebrew/bin/ffmpeg')).toBe(true);
  });
});

describe('parseProbe', () => {
  it('reads container, codecs and duration from the banner', () => {
    expect(parseProbe(MKV_HEVC, FILE)).toEqual({
      ...FILE,
      container: 'matroska,webm',
      video: 'hevc',
      audio: 'opus',
      durationS: 1.01,
    });
    expect(parseProbe(MP4_H264, FILE)).toMatchObject({
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      video: 'h264',
      audio: 'aac',
    });
    expect(parseProbe(WMA, FILE)).toMatchObject({ container: 'asf', video: null, audio: 'wmav2' });
  });

  it('does not count a cover picture as video', () => {
    expect(parseProbe(MP3_WITH_COVER, FILE)).toMatchObject({
      video: null,
      audio: 'mp3',
      durationS: 180,
    });
  });

  it('reads nothing from a banner it does not recognise', () => {
    expect(parseProbe('No such file or directory', FILE)).toMatchObject({
      container: null,
      video: null,
      audio: null,
    });
  });
});

describe('playbackPlan', () => {
  const film = (path: string) => ({ kind: 'film' as const, path });
  const song = (path: string) => ({ kind: 'music' as const, path });

  it('serves browser formats directly and transcodes the rest when it can', () => {
    expect(playbackPlan(film('a.mp4'), parseProbe(MP4_H264, FILE), true)).toBe('direct');
    expect(playbackPlan(film('a.mkv'), parseProbe(MKV_HEVC, FILE), true)).toBe('transcode');
    expect(playbackPlan(film('a.mkv'), parseProbe(MKV_HEVC, FILE), false)).toBe('unplayable');
    expect(playbackPlan(song('a.wma'), parseProbe(WMA, FILE), true)).toBe('transcode');
    expect(playbackPlan(song('a.mp3'), parseProbe(MP3_WITH_COVER, FILE), true)).toBe('direct');
  });

  it('falls back to the extension without a probe, and marks what it cannot vouch for unplayable', () => {
    expect(playbackPlan(film('a.mp4'), null, false)).toBe('direct');
    expect(playbackPlan(film('a.avi'), null, false)).toBe('unplayable');
    expect(playbackPlan(film('a.avi'), null, true)).toBe('transcode');
    expect(playbackPlan(song('a.flac'), null, false)).toBe('direct');
    expect(playbackPlan(song('a.aiff'), null, false)).toBe('unplayable');
    expect(playbackPlan({ kind: 'photo', path: 'a.jpg' }, null, false)).toBe('direct');
  });
});

describe('transcodeArgs', () => {
  it('is an argument array with the jailed input after -i, ending in fragmented MP4 on stdout', () => {
    const args = transcodeArgs('/lib/Films/A; rm -rf ~.mkv', 'film', parseProbe(MKV_HEVC, FILE));
    expect(args[args.indexOf('-i') + 1]).toBe('/lib/Films/A; rm -rf ~.mkv');
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac']));
    expect(args.slice(-3)).toEqual(['-f', 'mp4', 'pipe:1']);
    expect(args.join(' ')).toContain(
      '-movflags frag_keyframe+empty_moov+default_base_moof -f mp4 pipe:1',
    );
    expect(args).toContain('-nostdin');
  });

  it('copies what is already H.264/AAC and maps audio only for music', () => {
    const copy = transcodeArgs('/x/a.mkv', 'film', { ...parseProbe(MP4_H264, FILE) });
    expect(copy.join(' ')).toContain('-c:v copy');
    expect(copy.join(' ')).toContain('-c:a copy');
    const music = transcodeArgs('/x/a.wma', 'music', parseProbe(WMA, FILE));
    expect(music).toContain('-vn');
    expect(music).not.toContain('0:v:0');
  });

  it('puts the input guard before -i in every plan', () => {
    const plans = [
      transcodeArgs('/x/a.mkv', 'film', parseProbe(MKV_HEVC, FILE)),
      transcodeArgs('/x/a.mkv', 'film', parseProbe(MP4_H264, FILE)),
      transcodeArgs('/x/a.mkv', 'film', null),
      transcodeArgs('/x/a.wma', 'music', parseProbe(WMA, FILE)),
    ];
    for (const args of plans) expectGuardBeforeInput(args);
  });

  it('refuses a relative input (it could be read as an option)', () => {
    expect(() => transcodeArgs('-f', 'film', null)).toThrow();
  });
});

function expectGuardBeforeInput(args: string[]): void {
  const input = args.indexOf('-i');
  expect(input).toBeGreaterThan(-1);
  const whitelist = args.indexOf('-protocol_whitelist');
  const formats = args.indexOf('-format_whitelist');
  expect(whitelist).toBeGreaterThan(-1);
  expect(whitelist).toBeLessThan(input);
  expect(args[whitelist + 1]).toBe('file');
  expect(formats).toBeGreaterThan(-1);
  expect(formats).toBeLessThan(input);
  expect(args[formats + 1]).not.toMatch(/hls|concat/);
}

describe('probeArgs', () => {
  it('puts the input guard before -i', () => {
    const args = probeArgs('/lib/a.mkv');
    expectGuardBeforeInput(args);
    expect(args).toEqual(expect.arrayContaining([...FFMPEG_INPUT_GUARD]));
    expect(args.slice(-2)).toEqual(['-i', '/lib/a.mkv']);
  });
});
