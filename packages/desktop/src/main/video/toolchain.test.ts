import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildToolchainProbeScript,
  parseHyperframesVersion,
  parseRemotionVersion,
  parseToolchainProbeOutput,
  probeVideoSkills,
  probeVideoToolchain,
  resetVideoToolchainCache,
} from './toolchain';

/**
 * Tested against captured shell output, the same posture as
 * `agent-probe.test.ts` — an rc-file banner, a dead shell, and a shell
 * function rather than a file are all things a probe on a working laptop
 * will never actually produce.
 */

const frame = (name: string, body: string): string =>
  `\n__MSTUDIO_VIDEO_${name}_START__\n${body}\n__MSTUDIO_VIDEO_${name}_END__\n`;

beforeEach(() => {
  resetVideoToolchainCache();
});

describe('buildToolchainProbeScript', () => {
  it('frames both binaries in one shell command', () => {
    const script = buildToolchainProbeScript();
    expect(script).toContain('command -v node');
    expect(script).toContain('command -v npx');
    expect(script).toContain('__MSTUDIO_VIDEO_node_START__');
    expect(script).toContain('__MSTUDIO_VIDEO_npx_END__');
    expect(script).toContain('command -v ffmpeg');
  });
});

describe('parseToolchainProbeOutput', () => {
  it('resolves an installed binary to its absolute path', () => {
    const output = frame('node', '/opt/homebrew/bin/node') + frame('npx', '/opt/homebrew/bin/npx');
    const result = parseToolchainProbeOutput(output);
    expect(result.node).toEqual({ found: true, path: '/opt/homebrew/bin/node' });
    expect(result.npx).toEqual({ found: true, path: '/opt/homebrew/bin/npx' });
  });

  it('reports a missing binary as not found, never a crash', () => {
    const output = frame('node', '') + frame('npx', '');
    const result = parseToolchainProbeOutput(output);
    expect(result.node).toEqual({ found: false, reason: 'node was not found on PATH.' });
  });

  it('reads past an rc-file banner printed before the real answer', () => {
    const output =
      frame('node', 'Welcome to fish\n/opt/homebrew/bin/node') +
      frame('npx', '/opt/homebrew/bin/npx');
    const result = parseToolchainProbeOutput(output);
    expect(result.node).toEqual({ found: true, path: '/opt/homebrew/bin/node' });
  });

  it('marks a binary unresolved when its frame never arrived (shell died mid-batch)', () => {
    const output = frame('node', '/opt/homebrew/bin/node'); // no npx frame at all
    const result = parseToolchainProbeOutput(output);
    expect(result.npx.found).toBe(false);
  });
});

describe('parseRemotionVersion', () => {
  it('reads a pinned dependency version', () => {
    expect(parseRemotionVersion('{"dependencies":{"remotion":"4.0.230"}}')).toBe('4.0.230');
  });

  it('falls back to devDependencies', () => {
    expect(parseRemotionVersion('{"devDependencies":{"remotion":"4.0.230"}}')).toBe('4.0.230');
  });

  it('is undefined for malformed JSON rather than throwing', () => {
    expect(parseRemotionVersion('not json')).toBeUndefined();
  });

  it('is undefined when remotion is not a dependency at all', () => {
    expect(parseRemotionVersion('{"dependencies":{}}')).toBeUndefined();
  });
});

describe('probeVideoToolchain', () => {
  it('caches the probe across calls until an explicit reset', async () => {
    const run = vi.fn().mockResolvedValue({
      output: frame('node', '/opt/homebrew/bin/node') + frame('npx', '/opt/homebrew/bin/npx'),
    });
    await probeVideoToolchain(undefined, { run });
    await probeVideoToolchain(undefined, { run });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('re-probes after resetVideoToolchainCache', async () => {
    const run = vi.fn().mockResolvedValue({
      output: frame('node', '/opt/homebrew/bin/node') + frame('npx', '/opt/homebrew/bin/npx'),
    });
    await probeVideoToolchain(undefined, { run });
    resetVideoToolchainCache();
    await probeVideoToolchain(undefined, { run });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reads remotionVersion from the given app directory, per call, even from a cached probe', async () => {
    const run = vi.fn().mockResolvedValue({
      output: frame('node', '/opt/homebrew/bin/node') + frame('npx', '/opt/homebrew/bin/npx'),
    });
    const readFile = vi.fn().mockResolvedValue('{"dependencies":{"remotion":"4.0.230"}}');
    const result = await probeVideoToolchain('/repo/video-editor', { run, readFile });
    expect(result.remotionVersion).toBe('4.0.230');
    expect(readFile).toHaveBeenCalledWith('/repo/video-editor/package.json');
  });

  it('omits remotionVersion when the app directory has no readable package.json', async () => {
    const run = vi.fn().mockResolvedValue({
      output: frame('node', '/opt/homebrew/bin/node') + frame('npx', '/opt/homebrew/bin/npx'),
    });
    const readFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await probeVideoToolchain('/repo/video-editor', { run, readFile });
    expect(result.remotionVersion).toBeUndefined();
  });
});

describe('probeVideoSkills', () => {
  it('reports both skills found when their SKILL.md is readable in the video root', async () => {
    const readFile = vi.fn().mockResolvedValue('# a skill');
    const result = await probeVideoSkills('/Users/bilo/Dev/ekko-videos', { readFile });

    expect(result.videoWriteScript).toEqual({
      found: true,
      path: '/Users/bilo/Dev/ekko-videos/.claude/skills/midnite-media-video-write-editorial-script/SKILL.md',
    });
    expect(result.videoExecuteScript).toEqual({
      found: true,
      path: '/Users/bilo/Dev/ekko-videos/.claude/skills/midnite-media-video-execute-editorial-script/SKILL.md',
    });
  });

  it('reports a skill not found, with a reason naming ekko-videos, when its SKILL.md cannot be read', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await probeVideoSkills('/videos', { readFile });

    expect(result.videoWriteScript.found).toBe(false);
    expect(result.videoWriteScript).toMatchObject({
      reason: expect.stringContaining('ekko-videos') as unknown as string,
    });
  });

  it('reports both skills not found when no video root is configured yet', async () => {
    const readFile = vi.fn();
    const result = await probeVideoSkills(undefined, { readFile });

    expect(readFile).not.toHaveBeenCalled();
    expect(result.videoWriteScript).toEqual({
      found: false,
      reason: 'Configure a video root in Settings first.',
    });
    expect(result.videoExecuteScript).toEqual({
      found: false,
      reason: 'Configure a video root in Settings first.',
    });
  });

  it('checks each skill against its own directory name, not a shared path', async () => {
    const readFile = vi
      .fn()
      .mockImplementation((path: string) =>
        path.includes('midnite-media-video-write-editorial-script')
          ? Promise.resolve('# write')
          : Promise.reject(new Error('ENOENT')),
      );
    const result = await probeVideoSkills('/videos', { readFile });

    expect(result.videoWriteScript.found).toBe(true);
    expect(result.videoExecuteScript.found).toBe(false);
  });
});

describe('HyperFrames toolchain (Phase 99 Theme H)', () => {
  const output =
    frame('node', '/opt/homebrew/bin/node') +
    frame('npx', '/opt/homebrew/bin/npx') +
    frame('ffmpeg', '/opt/homebrew/bin/ffmpeg') +
    frame('nodeversion', '22.12.0');

  it('probes the node version in the same shell command', () => {
    expect(buildToolchainProbeScript()).toContain('node -p process.versions.node');
  });

  it('reads the node version, and omits it when the frame is missing or junk', () => {
    expect(parseToolchainProbeOutput(output).nodeVersion).toBe('22.12.0');
    expect(parseToolchainProbeOutput(frame('node', '/n')).nodeVersion).toBeUndefined();
    expect(
      parseToolchainProbeOutput(frame('nodeversion', 'command not found')).nodeVersion,
    ).toBeUndefined();
  });

  it('reports a missing ffmpeg as not found — HyperFrames cannot render without it', () => {
    const result = parseToolchainProbeOutput(
      frame('node', '/n') + frame('npx', '/x') + frame('ffmpeg', ''),
    );
    expect(result.ffmpeg).toEqual({ found: false, reason: 'ffmpeg was not found on PATH.' });
  });

  it('parses the pinned hyperframes dependency', () => {
    expect(parseHyperframesVersion('{"devDependencies":{"hyperframes":"0.8.114"}}')).toBe(
      '0.8.114',
    );
    expect(
      parseHyperframesVersion(
        '{"dependencies":{"hyperframes":"0.9.0"},"devDependencies":{"hyperframes":"0.1.0"}}',
      ),
    ).toBe('0.9.0');
    expect(parseHyperframesVersion('{"dependencies":{"remotion":"4"}}')).toBeUndefined();
    expect(parseHyperframesVersion('nope')).toBeUndefined();
  });

  it('stamps the engine and reads hyperframesVersion from the HyperFrames app, not remotionVersion', async () => {
    const run = vi.fn().mockResolvedValue({ output });
    const readFile = vi
      .fn()
      .mockResolvedValue('{"devDependencies":{"hyperframes":"0.8.114","remotion":"4.0.1"}}');
    const result = await probeVideoToolchain(
      '/repo/hyperframes-editor',
      { run, readFile },
      'hyperframes',
    );
    expect(result).toMatchObject({
      engine: 'hyperframes',
      hyperframesVersion: '0.8.114',
      nodeVersion: '22.12.0',
    });
    expect(result.remotionVersion).toBeUndefined();
    expect(readFile).toHaveBeenCalledWith('/repo/hyperframes-editor/package.json');
  });

  it('answers a Remotion probe exactly as before: no engine stamp', async () => {
    const run = vi.fn().mockResolvedValue({ output });
    const result = await probeVideoToolchain(undefined, { run });
    expect(result.engine).toBeUndefined();
    expect(result.hyperframesVersion).toBeUndefined();
  });

  it('shares one cached machine probe across engines', async () => {
    const run = vi.fn().mockResolvedValue({ output });
    await probeVideoToolchain(undefined, { run }, 'remotion');
    await probeVideoToolchain(undefined, { run }, 'hyperframes');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
