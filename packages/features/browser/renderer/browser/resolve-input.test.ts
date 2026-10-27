import { describe, expect, it } from 'vitest';
import { resolveInput, trimUrlForDisplay } from './resolve-input';

describe('resolveInput', () => {
  it('resolves explicit scheme URLs', () => {
    expect(resolveInput('https://github.com')).toBe('https://github.com');
    expect(resolveInput('http://example.com/foo')).toBe('http://example.com/foo');
  });

  it('resolves localhost and bare ports', () => {
    expect(resolveInput('localhost:3000')).toBe('http://localhost:3000');
    expect(resolveInput('localhost')).toBe('http://localhost');
  });

  it('resolves host.tld patterns to https', () => {
    expect(resolveInput('github.com')).toBe('https://github.com');
    expect(resolveInput('figma.com/file/123')).toBe('https://figma.com/file/123');
  });

  it('resolves general search queries to configured engine', () => {
    expect(resolveInput('react docs')).toBe('https://www.google.com/search?q=react%20docs');
    expect(resolveInput('react docs', 'duckduckgo')).toBe('https://duckduckgo.com/?q=react%20docs');
    expect(resolveInput('react docs', 'bing')).toBe('https://www.bing.com/search?q=react%20docs');
  });
});

describe('trimUrlForDisplay', () => {
  it('drops the scheme and a bare trailing slash', () => {
    expect(trimUrlForDisplay('https://github.com/')).toBe('github.com');
    expect(trimUrlForDisplay('http://example.com')).toBe('example.com');
  });

  it('keeps a real path, query and hash', () => {
    expect(trimUrlForDisplay('https://github.com/o/r?tab=readme#top')).toBe(
      'github.com/o/r?tab=readme#top',
    );
  });

  it('falls back to the raw value for anything URL cannot parse', () => {
    expect(trimUrlForDisplay('')).toBe('');
    expect(trimUrlForDisplay('not a url')).toBe('not a url');
  });
});

describe('trimUrlForDisplay with a verdict display host (Phase 117 Theme C)', () => {
  it('shows the Unicode form main judged safe, keeping the port and path', () => {
    expect(trimUrlForDisplay('https://xn--mnchen-3ya.de:8443/a', 'münchen.de')).toBe('münchen.de:8443/a');
  });

  it('never relabels a URL with a display host for a different site', () => {
    expect(trimUrlForDisplay('https://example.com/', 'apple.com')).toBe('example.com');
  });

  it('keeps punycode for a lookalike, whose display host is the punycode itself', () => {
    expect(trimUrlForDisplay('https://xn--pple-43d.com/', 'xn--pple-43d.com')).toBe('xn--pple-43d.com');
  });
});
