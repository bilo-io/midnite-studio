import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildToolchainProbeScript,
  parseRemotionVersion,
  parseToolchainProbeOutput,
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
    const output = frame('node', 'Welcome to fish\n/opt/homebrew/bin/node') + frame('npx', '/opt/homebrew/bin/npx');
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
