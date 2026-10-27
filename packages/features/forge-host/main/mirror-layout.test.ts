import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultMirrorRoot, isSafeRemoteUrl, mirrorPaths } from './mirror-layout';

describe('mirror layout', () => {
  it('puts the bare repo and its metadata side by side under host/owner', () => {
    const p = mirrorPaths('/r', { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio' });
    expect(p.bare).toBe('/r/github.com/bilo-io/midnite-studio.git');
    expect(p.meta).toBe('/r/github.com/bilo-io/midnite-studio.meta');
    expect(p.name).toBe('midnite-studio.git');
  });

  it('keeps a host port out of the file name', () => {
    expect(mirrorPaths('/r', { host: '127.0.0.1:3000', owner: 'a', repo: 'b' }).parent).toBe('/r/127.0.0.1_3000/a');
  });

  it.each([['..'], ['a/b'], ['-rf'], ['x.git'], ['x.meta'], ['a..b'], ['']])('rejects the segment %j', (bad) => {
    expect(() => mirrorPaths('/r', { host: 'h.com', owner: bad, repo: 'ok' })).toThrow(/unsafe/);
    expect(() => mirrorPaths('/r', { host: 'h.com', owner: 'ok', repo: bad })).toThrow(/unsafe/);
  });

  it('defaults under ~/Midnite/Git/mirrors', () => {
    expect(defaultMirrorRoot('/h')).toBe(join('/h', 'Midnite', 'Git', 'mirrors'));
  });

  it.each([
    ['https://github.com/a/b.git', true],
    ['git@github.com:a/b.git', true],
    ['file:///tmp/x', true],
    ['/Volumes/usb/b.git', true],
    ['--upload-pack=evil', false],
    ['ext::sh -c evil', false],
    ['fd::3', false],
    ['https://x/a b', false],
    ['relative/path', false],
    ['', false],
  ])('isSafeRemoteUrl(%j) = %s', (url, ok) => {
    expect(isSafeRemoteUrl(url)).toBe(ok);
  });
});
