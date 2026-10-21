import { describe, expect, it } from 'vitest';

import {
  isMarkdownImagePath,
  mstudioImageUrl,
  resolveMarkdownImageSrc,
} from './markdown-image';

describe('resolveMarkdownImageSrc', () => {
  it('resolves a ./ path against the markdown file directory', () => {
    expect(resolveMarkdownImageSrc('./screenshots/a.png', 'docs/README.md')).toEqual({
      kind: 'local',
      relPath: 'docs/screenshots/a.png',
    });
  });

  it('resolves a ../ path that stays inside the root', () => {
    expect(resolveMarkdownImageSrc('../img/b.svg', 'docs/guide/intro.md')).toEqual({
      kind: 'local',
      relPath: 'docs/img/b.svg',
    });
  });

  it('resolves a bare name next to a root-level file', () => {
    expect(resolveMarkdownImageSrc('logo.png', 'README.md')).toEqual({
      kind: 'local',
      relPath: 'logo.png',
    });
  });

  it('resolves a leading slash against the repo root, the way GitHub does', () => {
    expect(resolveMarkdownImageSrc('/docs/a.png', 'packages/app/README.md')).toEqual({
      kind: 'local',
      relPath: 'docs/a.png',
    });
  });

  it('decodes percent-encoded segments and drops the query and fragment', () => {
    expect(resolveMarkdownImageSrc('./my%20shot.PNG?raw=1#x', 'docs/a.md')).toEqual({
      kind: 'local',
      relPath: 'docs/my shot.PNG',
    });
  });

  it.each([
    ['a ../ climbing above the root', '../../outside.png', 'docs/a.md'],
    ['a leading-slash path that climbs', '/../etc/a.png', 'a.md'],
    ['an encoded separator smuggling a climb', '..%2F..%2Fetc%2Fa.png', 'docs/a.md'],
    ['an encoded NUL', 'a%00.png', 'a.md'],
    ['malformed percent-encoding', 'a%zz.png', 'a.md'],
  ])('refuses %s', (_name, src, from) => {
    expect(resolveMarkdownImageSrc(src, from)).toEqual({ kind: 'invalid', reason: 'escapes-root' });
  });

  it.each(['.env', 'secrets.txt', 'notes.md', 'image.png.exe', 'Makefile'])(
    'refuses non-image extension %s',
    (src) => {
      expect(resolveMarkdownImageSrc(src, 'a.md')).toEqual({ kind: 'invalid', reason: 'not-an-image' });
    },
  );

  it('treats an empty or fragment-only src as empty', () => {
    expect(resolveMarkdownImageSrc('', 'a.md')).toEqual({ kind: 'invalid', reason: 'empty' });
    expect(resolveMarkdownImageSrc(undefined, 'a.md')).toEqual({ kind: 'invalid', reason: 'empty' });
    expect(resolveMarkdownImageSrc('#top', 'a.md')).toEqual({ kind: 'invalid', reason: 'empty' });
  });

  it('loads https directly, and reads protocol-relative as https', () => {
    expect(resolveMarkdownImageSrc('https://example.com/a.png')).toEqual({
      kind: 'remote',
      url: 'https://example.com/a.png',
    });
    expect(resolveMarkdownImageSrc('//example.com/a.png')).toEqual({
      kind: 'remote',
      url: 'https://example.com/a.png',
    });
  });

  it('blocks plain http, which the app CSP refuses', () => {
    expect(resolveMarkdownImageSrc('http://example.com/a.png')).toEqual({
      kind: 'blocked',
      url: 'http://example.com/a.png',
      reason: 'insecure-http',
    });
  });

  it.each(['file:///etc/a.png', 'mstudio-file://claude-home/-/a.png', 'javascript:alert(1)'])(
    'blocks other schemes such as %s',
    (src) => {
      expect(resolveMarkdownImageSrc(src)).toMatchObject({ kind: 'blocked', reason: 'unsupported-scheme' });
    },
  );
});

describe('isMarkdownImagePath', () => {
  it.each(['a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg', 'g.avif', 'h.bmp', 'i.ico'])(
    'accepts %s',
    (path) => expect(isMarkdownImagePath(path)).toBe(true),
  );

  it.each(['a.txt', 'png', '.png', 'dir.png/file', 'a.svgz'])('refuses %s', (path) =>
    expect(isMarkdownImagePath(path)).toBe(false),
  );
});

describe('mstudioImageUrl', () => {
  it('adds the image-only flag to the jailed media URL', () => {
    expect(mstudioImageUrl('repo', 'r1', 'docs/a b.png')).toBe(
      'mstudio-file://repo/r1/docs/a%20b.png?as=image',
    );
    expect(mstudioImageUrl('repo', 'r1', 'a.png', '/wt/x')).toBe(
      'mstudio-file://repo/r1/a.png?wt=%2Fwt%2Fx&as=image',
    );
  });
});
