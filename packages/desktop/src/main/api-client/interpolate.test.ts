import { describe, expect, it } from 'vitest';

import { interpolate, interpolateAll, interpolateTiered, mergeVariableTiers } from './interpolate';

describe('interpolate', () => {
  it('resolves a token from the variable map', () => {
    const result = interpolate('{{baseUrl}}/tasks', { baseUrl: 'http://127.0.0.1:7777' });

    expect(result.text).toBe('http://127.0.0.1:7777/tasks');
    expect(result.warnings).toEqual([]);
  });

  it('leaves an unresolved token literally in place and names it in a warning', () => {
    // Decision 7: substituting '' would produce `https://api./users` and a 404
    // that reads as the server's fault. The token stays so the URL is
    // obviously wrong rather than subtly wrong.
    const result = interpolate('https://api.{{host}}/users', {});

    expect(result.text).toBe('https://api.{{host}}/users');
    expect(result.warnings).toEqual(['Unresolved variable {{host}} — left as-is.']);
  });

  it('reports one warning per distinct name, however often it appears', () => {
    const result = interpolate('{{a}}/{{a}}/{{b}}', {});

    expect(result.warnings).toEqual([
      'Unresolved variable {{a}} — left as-is.',
      'Unresolved variable {{b}} — left as-is.',
    ]);
  });

  it('leaves an over-braced {{{{a}}}} alone rather than matching its inner token', () => {
    const result = interpolate('{{{{a}}}}', { a: 'RESOLVED' });

    expect(result.text).toBe('{{{{a}}}}');
    expect(result.warnings).toEqual([]);
  });

  it('leaves a {{ with no closer alone', () => {
    const result = interpolate('{{ unterminated', { unterminated: 'RESOLVED' });

    expect(result.text).toBe('{{ unterminated');
    expect(result.warnings).toEqual([]);
  });

  it('does not re-expand a {{b}} that appears inside a resolved value', () => {
    // One pass, no recursion — the alternative is a cycle bomb in a file the
    // user did not write.
    const result = interpolate('{{a}}', { a: 'literal {{b}}', b: 'NEVER' });

    expect(result.text).toBe('literal {{b}}');
    expect(result.warnings).toEqual([]);
  });

  it('terminates on a self-referential variable pair', () => {
    const result = interpolate('{{a}}', { a: '{{b}}', b: '{{a}}' });

    expect(result.text).toBe('{{b}}');
    expect(result.warnings).toEqual([]);
  });

  it('trims whitespace inside the braces', () => {
    expect(interpolate('{{  spaced  }}', { spaced: 'ok' }).text).toBe('ok');
  });

  it('resolves a variable whose value is the empty string, without warning', () => {
    // An explicitly-empty variable is resolved, not unresolved — the
    // distinction is the whole point of hasOwnProperty over truthiness.
    const result = interpolate('a{{gap}}b', { gap: '' });

    expect(result.text).toBe('ab');
    expect(result.warnings).toEqual([]);
  });

  it('leaves text with no tokens untouched', () => {
    expect(interpolate('http://example.test/x', { a: '1' }).text).toBe('http://example.test/x');
  });
});

describe('interpolateAll', () => {
  it('interpolates every input and de-duplicates warnings across them', () => {
    const result = interpolateAll(['{{host}}/a', '{{host}}/b', '{{other}}'], {});

    expect(result.texts).toEqual(['{{host}}/a', '{{host}}/b', '{{other}}']);
    expect(result.warnings).toEqual([
      'Unresolved variable {{host}} — left as-is.',
      'Unresolved variable {{other}} — left as-is.',
    ]);
  });

  it('resolves across inputs independently', () => {
    const result = interpolateAll(['{{a}}', '{{b}}'], { a: '1', b: '2' });

    expect(result.texts).toEqual(['1', '2']);
    expect(result.warnings).toEqual([]);
  });
});

describe('mergeVariableTiers / interpolateTiered (Phase 70 Theme A)', () => {
  it('an environment variable shadows a collection variable of the same name', () => {
    const merged = mergeVariableTiers({ host: 'env-host' }, { host: 'collection-host' });
    expect(merged.host).toBe('env-host');

    const result = interpolateTiered('{{host}}', {
      environment: { host: 'env-host' },
      collection: { host: 'collection-host' },
    });
    expect(result.text).toBe('env-host');
    expect(result.warnings).toEqual([]);
  });

  it('falls back to the collection tier when the environment has no entry for that name', () => {
    const result = interpolateTiered('{{host}}', {
      environment: {},
      collection: { host: 'collection-host' },
    });
    expect(result.text).toBe('collection-host');
    expect(result.warnings).toEqual([]);
  });

  it('a disabled environment row does not shadow — the caller filters it out before it ever reaches the merge', () => {
    // send.ts's own tier-builder is what excludes `enabled: false` rows from
    // the environment map it hands `interpolateTiered`; this asserts the
    // merge itself has no special case for it, one is not needed once the
    // disabled row is simply absent.
    const result = interpolateTiered('{{host}}', {
      environment: {}, // the disabled row never made it into this map
      collection: { host: 'collection-host' },
    });
    expect(result.text).toBe('collection-host');
  });

  it('both tiers missing leaves the token literal with one warning naming it', () => {
    const result = interpolateTiered('{{host}}', { environment: {}, collection: {} });
    expect(result.text).toBe('{{host}}');
    expect(result.warnings).toEqual(['Unresolved variable {{host}} — left as-is.']);
  });

  it('does not re-expand a {{b}} that appears inside a resolved environment value', () => {
    const result = interpolateTiered('{{a}}', {
      environment: { a: 'literal {{b}}' },
      collection: { b: 'NEVER' },
    });
    expect(result.text).toBe('literal {{b}}');
    expect(result.warnings).toEqual([]);
  });
});
