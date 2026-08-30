import { describe, expect, it } from 'vitest';
import { resolveInput } from './resolve-input';

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
