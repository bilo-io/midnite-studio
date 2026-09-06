import { describe, expect, it } from 'vitest';

import { buildQueryString, parseQueryString, rewriteUrlParams, splitUrl } from './query-string';

describe('splitUrl', () => {
  it('splits a URL with a query string', () => {
    expect(splitUrl('https://x.test/a?b=1&c=2')).toEqual({ base: 'https://x.test/a', query: 'b=1&c=2' });
  });

  it('returns query as undefined for a URL with no ?', () => {
    expect(splitUrl('https://x.test/a')).toEqual({ base: 'https://x.test/a', query: undefined });
  });

  it('returns an empty query string for a trailing bare ?', () => {
    expect(splitUrl('https://x.test/a?')).toEqual({ base: 'https://x.test/a', query: '' });
  });
});

describe('parseQueryString', () => {
  it('parses pairs in order, all enabled', () => {
    expect(parseQueryString('a=1&b=2')).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ]);
  });

  it('decodes percent-encoding', () => {
    expect(parseQueryString('name=Ada%20Lovelace')).toEqual([
      { key: 'name', value: 'Ada Lovelace', enabled: true },
    ]);
  });

  it('treats a key with no = as an empty value', () => {
    expect(parseQueryString('flag')).toEqual([{ key: 'flag', value: '', enabled: true }]);
  });

  it('returns an empty array for undefined or an empty string', () => {
    expect(parseQueryString(undefined)).toEqual([]);
    expect(parseQueryString('')).toEqual([]);
  });
});

describe('buildQueryString', () => {
  it('encodes only enabled rows with a key, in row order', () => {
    expect(
      buildQueryString([
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '2', enabled: false },
        { key: '', value: 'ignored', enabled: true },
        { key: 'c', value: 'x y', enabled: true },
      ]),
    ).toBe('a=1&c=x%20y');
  });

  it('returns an empty string with no enabled rows', () => {
    expect(buildQueryString([{ key: 'a', value: '1', enabled: false }])).toBe('');
  });
});

describe('rewriteUrlParams — the table-edit direction of the sync rule', () => {
  it('rewrites the query string from rows, dropping a disabled row from the URL', () => {
    const rows = [
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: false },
    ];
    expect(rewriteUrlParams('https://x.test/a?a=old', rows)).toBe('https://x.test/a?a=1');
  });

  it('drops the ? entirely when no row is enabled', () => {
    expect(rewriteUrlParams('https://x.test/a?a=1', [{ key: 'a', value: '1', enabled: false }])).toBe(
      'https://x.test/a',
    );
  });

  it('preserves the base across a rewrite that adds a fresh row', () => {
    const rows = [{ key: 'a', value: '1', enabled: true }];
    expect(rewriteUrlParams('https://x.test/a', rows)).toBe('https://x.test/a?a=1');
  });
});
