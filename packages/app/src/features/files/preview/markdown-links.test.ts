import { describe, expect, it } from 'vitest';
import { findAnchorTarget, inPageAnchor, resolveMarkdownLinkTarget, slugifyHeading } from './markdown-links';

describe('anchors', () => {
  it('slugifies like GitHub and de-dupes', () => {
    document.body.innerHTML = '<div id="r"><h2>Second Part!</h2><h2>Second Part!</h2></div>';
    const r = document.getElementById('r')!;
    expect(slugifyHeading('Second Part!')).toBe('second-part');
    expect(findAnchorTarget(r, 'second-part')).toBe(r.children[0]);
    expect(findAnchorTarget(r, 'second-part-1')).toBe(r.children[1]);
    expect(inPageAnchor('#a%20b')).toBe('a b');
    expect(inPageAnchor('x.md#a')).toBeNull();
  });
});

describe('resolveMarkdownLinkTarget', () => {
  it('returns external for http and https urls', () => {
    expect(resolveMarkdownLinkTarget('https://example.com', 'README.md')).toEqual({
      kind: 'external',
      url: 'https://example.com',
    });
    expect(resolveMarkdownLinkTarget('http://example.com/foo', 'docs/index.md')).toEqual({
      kind: 'external',
      url: 'http://example.com/foo',
    });
  });

  it('returns external for mailto and other protocols', () => {
    expect(resolveMarkdownLinkTarget('mailto:test@example.com', 'README.md')).toEqual({
      kind: 'external',
      url: 'mailto:test@example.com',
    });
  });

  it('returns null for empty or undefined or pure anchors', () => {
    expect(resolveMarkdownLinkTarget(undefined, 'README.md')).toBeNull();
    expect(resolveMarkdownLinkTarget('', 'README.md')).toBeNull();
    expect(resolveMarkdownLinkTarget('#heading', 'README.md')).toBeNull();
  });

  it('resolves relative markdown links from root', () => {
    expect(resolveMarkdownLinkTarget('docs/INITIAL_PLAN.md', 'README.md')).toEqual({
      kind: 'internal',
      relPath: 'docs/INITIAL_PLAN.md',
    });
    expect(resolveMarkdownLinkTarget('./docs/INITIAL_PLAN.md', 'README.md')).toEqual({
      kind: 'internal',
      relPath: 'docs/INITIAL_PLAN.md',
    });
    expect(resolveMarkdownLinkTarget('/docs/INITIAL_PLAN.md', 'README.md')).toEqual({
      kind: 'internal',
      relPath: 'docs/INITIAL_PLAN.md',
    });
  });

  it('resolves relative markdown links from subdirectory', () => {
    expect(resolveMarkdownLinkTarget('phase-1.md', 'todo/_INDEX.md')).toEqual({
      kind: 'internal',
      relPath: 'todo/phase-1.md',
    });
    expect(resolveMarkdownLinkTarget('./phase-1.md', 'todo/_INDEX.md')).toEqual({
      kind: 'internal',
      relPath: 'todo/phase-1.md',
    });
    expect(resolveMarkdownLinkTarget('../docs/INITIAL_PLAN.md', 'todo/_INDEX.md')).toEqual({
      kind: 'internal',
      relPath: 'docs/INITIAL_PLAN.md',
    });
    expect(resolveMarkdownLinkTarget('/docs/INITIAL_PLAN.md', 'todo/_INDEX.md')).toEqual({
      kind: 'internal',
      relPath: 'docs/INITIAL_PLAN.md',
    });
  });

  it('strips query params and hashes in relative links', () => {
    expect(resolveMarkdownLinkTarget('phase-1.md#section', 'todo/_INDEX.md')).toEqual({
      kind: 'internal',
      relPath: 'todo/phase-1.md',
      anchor: 'section',
    });
    expect(resolveMarkdownLinkTarget('../docs/INITIAL_PLAN.md?foo=bar#baz', 'todo/_INDEX.md')).toEqual({
      kind: 'internal',
      relPath: 'docs/INITIAL_PLAN.md',
      anchor: 'baz',
    });
  });

  it('handles deep relative paths and normalises properly', () => {
    expect(resolveMarkdownLinkTarget('../../../packages/app/README.md', 'packages/shared/src/index.ts')).toEqual({
      kind: 'internal',
      relPath: 'packages/app/README.md',
    });
  });

  it('refuses paths navigating outside repo root', () => {
    expect(resolveMarkdownLinkTarget('../../outside.md', 'todo/_INDEX.md')).toBeNull();
  });
});
