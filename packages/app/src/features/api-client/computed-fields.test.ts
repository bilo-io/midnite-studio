import type { ApiRequestDraft, PostmanEnvironmentValue, PostmanVariable } from '@midnite/studio-shared';
import { toDraft } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  computedHeaders,
  computedParams,
  contentTypeForBodyMode,
  resolvedVariables,
  resolveUrlPreview,
} from './computed-fields';

function draft(overrides: Partial<ApiRequestDraft> = {}): ApiRequestDraft {
  const base = toDraft({ name: 'req', request: { method: 'POST', url: 'https://api.test/users' } });
  return { ...base, ...overrides };
}

describe('contentTypeForBodyMode', () => {
  it('maps every mode with an implicit content-type, and null for the rest', () => {
    expect(contentTypeForBodyMode('json')).toBe('application/json');
    expect(contentTypeForBodyMode('xml')).toBe('application/xml');
    expect(contentTypeForBodyMode('graphql')).toBe('application/json');
    expect(contentTypeForBodyMode('urlencoded')).toBe('application/x-www-form-urlencoded');
    expect(contentTypeForBodyMode('form-data')).toBe('multipart/form-data');
    expect(contentTypeForBodyMode('raw')).toBeNull();
    expect(contentTypeForBodyMode('none')).toBeNull();
    expect(contentTypeForBodyMode('binary')).toBeNull();
  });
});

describe('computedHeaders', () => {
  it('shows Host from the URL', () => {
    const fields = computedHeaders(draft({ bodyMode: 'none' }));
    expect(fields).toContainEqual({ key: 'Host', value: 'api.test' });
  });

  it('shows Content-Length and Content-Type for a body mode with content', () => {
    const fields = computedHeaders(draft({ bodyMode: 'json', bodies: { ...draft().bodies, json: '{"a":1}' } }));
    expect(fields).toContainEqual({ key: 'Content-Type', value: 'application/json' });
    expect(fields.find((f) => f.key === 'Content-Length')?.value).toBe(String('{"a":1}'.length));
  });

  it('shows no Content-Length/Content-Type for bodyMode none', () => {
    const fields = computedHeaders(draft({ bodyMode: 'none' }));
    expect(fields.some((f) => f.key === 'Content-Length')).toBe(false);
    expect(fields.some((f) => f.key === 'Content-Type')).toBe(false);
  });

  it('shows no body headers for a GET, regardless of bodyMode', () => {
    const fields = computedHeaders(draft({ method: 'GET', bodyMode: 'json' }));
    expect(fields.some((f) => f.key === 'Content-Length')).toBe(false);
  });

  it('bearer auth contributes an Authorization header', () => {
    const fields = computedHeaders(draft({ bodyMode: 'none', auth: { type: 'bearer', token: 'abc123' } }));
    expect(fields).toContainEqual({ key: 'Authorization', value: 'Bearer abc123' });
  });

  it('basic auth contributes a base64 Authorization header', () => {
    const fields = computedHeaders(
      draft({ bodyMode: 'none', auth: { type: 'basic', username: 'alice', password: 'hunter2' } }),
    );
    // `alice:hunter2` base64-encoded — verified independently against Node's
    // `Buffer.from('alice:hunter2', 'utf8').toString('base64')`, which is
    // what `send.ts`'s own Basic-auth header building uses.
    expect(fields).toContainEqual({ key: 'Authorization', value: 'Basic YWxpY2U6aHVudGVyMg==' });
  });

  it('apikey in header contributes the named header, not Authorization', () => {
    const fields = computedHeaders(
      draft({ bodyMode: 'none', auth: { type: 'apikey', key: 'X-Api-Key', value: 'secret', in: 'header' } }),
    );
    expect(fields).toContainEqual({ key: 'X-Api-Key', value: 'secret' });
    expect(fields.some((f) => f.key === 'Authorization')).toBe(false);
  });

  it('apikey in query contributes nothing to headers', () => {
    const fields = computedHeaders(
      draft({ bodyMode: 'none', auth: { type: 'apikey', key: 'api_key', value: 'secret', in: 'query' } }),
    );
    expect(fields.some((f) => f.key === 'api_key')).toBe(false);
  });
});

describe('computedParams', () => {
  it('apikey in query contributes the named query param', () => {
    const fields = computedParams(
      draft({ auth: { type: 'apikey', key: 'api_key', value: 'secret', in: 'query' } }),
    );
    expect(fields).toEqual([{ key: 'api_key', value: 'secret' }]);
  });

  it('apikey in header contributes nothing to params', () => {
    const fields = computedParams(
      draft({ auth: { type: 'apikey', key: 'api_key', value: 'secret', in: 'header' } }),
    );
    expect(fields).toEqual([]);
  });

  it('bearer/basic/none contribute nothing to params', () => {
    expect(computedParams(draft({ auth: { type: 'none' } }))).toEqual([]);
    expect(computedParams(draft({ auth: { type: 'bearer', token: 't' } }))).toEqual([]);
  });
});

describe('resolvedVariables', () => {
  it('merges collection and environment tiers, environment shadowing collection', () => {
    const collectionVars: PostmanVariable[] = [
      { key: 'host', value: 'collection.example' },
      { key: 'onlyCollection', value: 'c' },
    ];
    const envValues: PostmanEnvironmentValue[] = [
      { key: 'host', value: 'env.example', type: 'default', enabled: true },
      { key: 'onlyEnv', value: 'e', type: 'default', enabled: true },
    ];
    expect(resolvedVariables(envValues, collectionVars)).toEqual({
      host: 'env.example',
      onlyCollection: 'c',
      onlyEnv: 'e',
    });
  });

  it('excludes a disabled environment row outright, never as an empty string', () => {
    const envValues: PostmanEnvironmentValue[] = [
      { key: 'host', value: 'env.example', type: 'default', enabled: false },
    ];
    expect(resolvedVariables(envValues, [])).toEqual({});
  });

  it('a variable with no value at all resolves nothing', () => {
    const collectionVars: PostmanVariable[] = [{ key: 'host' }];
    expect(resolvedVariables([], collectionVars)).toEqual({});
  });
});

describe('resolveUrlPreview', () => {
  it('substitutes every resolvable token', () => {
    expect(resolveUrlPreview('{{host}}/users/{{id}}', { host: 'api.test', id: '42' })).toBe(
      'api.test/users/42',
    );
  });

  it('leaves an unresolved token literally in place, never blanked', () => {
    expect(resolveUrlPreview('{{host}}/{{missing}}', { host: 'api.test' })).toBe(
      'api.test/{{missing}}',
    );
  });

  it('does not re-scan a resolved value that itself contains a token', () => {
    expect(resolveUrlPreview('{{a}}', { a: '{{b}}', b: 'leaked' })).toBe('{{b}}');
  });

  it('a URL with no token round-trips unchanged', () => {
    expect(resolveUrlPreview('https://api.test/users', { host: 'unused' })).toBe(
      'https://api.test/users',
    );
  });
});
