import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_ENGINE,
  VIDEO_APP_DIRS,
  VIDEO_CONFIG_FILE,
  VIDEO_ENGINES,
  VIDEO_ENGINE_INFO,
  VideoConfigSchema,
  VideoEngineSchema,
  VideoEngineStateSchema,
  VideoRootResolutionSchema,
  VideoToolchainSchema,
  parseVideoConfig,
  serializeVideoConfig,
  studioCompositionUrl,
  videoEngineIssues,
  videoEngineOf,
} from './video';

describe('video engine (Phase 99 Theme H)', () => {
  it('offers exactly Remotion and HyperFrames, defaulting to Remotion', () => {
    expect([...VIDEO_ENGINES]).toEqual(['remotion', 'hyperframes']);
    expect(DEFAULT_VIDEO_ENGINE).toBe('remotion');
    expect(VideoEngineSchema.safeParse('premiere').success).toBe(false);
  });

  it('gives each engine its own editor app, and the layout check knows both', () => {
    expect(VIDEO_ENGINE_INFO.remotion.appDir).toBe('video-editor');
    expect(VIDEO_ENGINE_INFO.hyperframes.appDir).toBe('hyperframes-editor');
    expect([...VIDEO_APP_DIRS]).toEqual(VIDEO_ENGINES.map((e) => VIDEO_ENGINE_INFO[e].appDir));
  });

  describe('parseVideoConfig — persistence and migration', () => {
    it('reads the recorded engine', () => {
      expect(parseVideoConfig('{"engine":"hyperframes"}').engine).toBe('hyperframes');
      expect(parseVideoConfig('{"engine":"remotion"}').engine).toBe('remotion');
    });

    it('a missing or empty config is Remotion — the migration rule for every pre-engine root', () => {
      expect(parseVideoConfig(null).engine).toBe('remotion');
      expect(parseVideoConfig(undefined).engine).toBe('remotion');
      expect(parseVideoConfig('').engine).toBe('remotion');
      expect(parseVideoConfig('{}').engine).toBe('remotion');
    });

    it('never throws on a malformed or unknown-engine config', () => {
      expect(parseVideoConfig('{nope').engine).toBe('remotion');
      expect(parseVideoConfig('{"engine":"premiere"}').engine).toBe('remotion');
      expect(parseVideoConfig('[]').engine).toBe('remotion');
    });

    it('round-trips through serializeVideoConfig, newline-terminated', () => {
      const text = serializeVideoConfig({ engine: 'hyperframes' });
      expect(text.endsWith('\n')).toBe(true);
      expect(parseVideoConfig(text)).toEqual({ engine: 'hyperframes' });
      expect(VIDEO_CONFIG_FILE).toBe('video.config.json');
      expect(VideoConfigSchema.parse({})).toEqual({ engine: 'remotion' });
    });
  });

  it('videoEngineOf treats a pre-engine payload as Remotion', () => {
    expect(videoEngineOf(null)).toBe('remotion');
    expect(videoEngineOf({})).toBe('remotion');
    expect(videoEngineOf({ engine: 'hyperframes' })).toBe('hyperframes');
  });

  it('the resolution accepts a pre-engine payload (no engine) and one with it', () => {
    const base = { root: '/r', source: 'repo-media' as const, setupTarget: '/t' };
    expect(VideoRootResolutionSchema.parse(base)).toEqual(base);
    expect(VideoRootResolutionSchema.parse({ ...base, engine: 'hyperframes' }).engine).toBe(
      'hyperframes',
    );
  });

  it('VideoEngineStateSchema carries what the UI needs to offer the install', () => {
    const state = {
      root: '/r',
      engine: 'hyperframes',
      needsInstall: true,
      appDir: '/r/hyperframes-editor',
    };
    expect(VideoEngineStateSchema.parse(state)).toEqual(state);
  });

  it('studioCompositionUrl appends the composition only for Remotion', () => {
    expect(studioCompositionUrl('http://localhost:3000', 'Main')).toBe(
      'http://localhost:3000/Main',
    );
    expect(studioCompositionUrl('http://localhost:3000', 'Main', 'remotion')).toBe(
      'http://localhost:3000/Main',
    );
    expect(studioCompositionUrl('http://localhost:3002/#project/x', 'Main', 'hyperframes')).toBe(
      'http://localhost:3002/#project/x',
    );
  });

  it('the toolchain schema carries engine, hyperframesVersion and nodeVersion as optional extras', () => {
    const toolchain = {
      node: { found: true as const, path: '/n' },
      npx: { found: true as const, path: '/x' },
      engine: 'hyperframes' as const,
      hyperframesVersion: '0.8.114',
      nodeVersion: '22.12.0',
      skills: {
        videoWriteScript: { found: true as const, path: '/a' },
        videoExecuteScript: { found: true as const, path: '/b' },
      },
    };
    expect(VideoToolchainSchema.parse(toolchain)).toEqual(toolchain);
  });
});

describe('videoEngineIssues', () => {
  const found = (path: string) => ({ found: true as const, path });
  const missing = (reason: string) => ({ found: false as const, reason });
  const ok = { node: found('/n'), npx: found('/x'), ffmpeg: found('/f'), nodeVersion: '22.12.0' };

  it('has nothing to say when the machine has everything', () => {
    expect(videoEngineIssues('remotion', ok)).toEqual([]);
    expect(videoEngineIssues('hyperframes', ok)).toEqual([]);
  });

  it('reports node/npx for both engines', () => {
    const toolchain = {
      ...ok,
      node: missing('node was not found on PATH.'),
      npx: missing('npx was not found on PATH.'),
    };
    expect(videoEngineIssues('remotion', toolchain).map((i) => i.id)).toEqual(['node', 'npx']);
    expect(videoEngineIssues('hyperframes', toolchain).map((i) => i.id)).toEqual(['node', 'npx']);
  });

  it('needs ffmpeg for HyperFrames only, with the install command', () => {
    const toolchain = { ...ok, ffmpeg: missing('ffmpeg was not found on PATH.') };
    expect(videoEngineIssues('remotion', toolchain)).toEqual([]);
    expect(videoEngineIssues('hyperframes', toolchain)).toEqual([
      { id: 'ffmpeg', message: expect.stringContaining('ffmpeg'), command: 'brew install ffmpeg' },
    ]);
  });

  it('needs Node 22+ for HyperFrames only', () => {
    const old = { ...ok, nodeVersion: '20.11.1' };
    expect(videoEngineIssues('remotion', old)).toEqual([]);
    const issues = videoEngineIssues('hyperframes', old);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ id: 'node-version' });
    expect(issues[0]!.message).toContain('22');
    expect(issues[0]!.message).toContain('20.11.1');
  });

  it('does not guess when the node version is unknown, or ffmpeg was not probed', () => {
    const { nodeVersion: _unused, ...unknownVersion } = ok;
    expect(videoEngineIssues('hyperframes', unknownVersion)).toEqual([]);
    const { ffmpeg: _ffmpeg, ...noFfmpegProbe } = ok;
    expect(videoEngineIssues('hyperframes', noFfmpegProbe)).toEqual([]);
  });
});
