import { describe, expect, it } from 'vitest';

import type { ApiRequestDraft, BodyMode } from './api-client';
import { toCurl, toFetch } from './api-codegen';

const BODY_MODES: readonly BodyMode[] = [
  'none',
  'json',
  'form-data',
  'urlencoded',
  'raw',
  'binary',
  'graphql',
  'xml',
];

function emptyBodies(): Record<BodyMode, string> {
  return BODY_MODES.reduce(
    (acc, mode) => {
      acc[mode] = '';
      return acc;
    },
    {} as Record<BodyMode, string>,
  );
}

function makeDraft(overrides: Partial<ApiRequestDraft> = {}): ApiRequestDraft {
  return {
    id: 'req-1',
    name: 'Get thing',
    method: 'GET',
    url: 'https://api.example.com/things',
    params: [],
    headers: [],
    auth: { type: 'none' },
    bodyMode: 'none',
    bodies: emptyBodies(),
    binaryPath: null,
    ...overrides,
  };
}

describe('toCurl', () => {
  it('shell-quotes a header value containing a single quote and a space', () => {
    const draft = makeDraft({
      headers: [{ key: 'X-Note', value: "it's a value", enabled: true }],
    });
    const out = toCurl(draft);
    expect(out).toContain(`--header 'X-Note: it'"'"'s a value'`);
  });

  it('omits a disabled header entirely', () => {
    const draft = makeDraft({
      headers: [
        { key: 'X-On', value: 'yes', enabled: true },
        { key: 'X-Off', value: 'no', enabled: false },
      ],
    });
    const out = toCurl(draft);
    expect(out).toContain('X-On');
    expect(out).not.toContain('X-Off');
    expect(out).not.toContain('no');
  });

  it('a form-data body becomes repeated -F flags', () => {
    const draft = makeDraft({
      method: 'POST',
      bodyMode: 'form-data',
      bodies: {
        ...emptyBodies(),
        'form-data': JSON.stringify([
          { key: 'title', value: 'hello', enabled: true, type: 'text' },
          { key: 'avatar', value: '/tmp/avatar.png', enabled: true, type: 'file' },
          { key: 'skip', value: 'me', enabled: false, type: 'text' },
        ]),
      },
    });
    const out = toCurl(draft);
    expect(out).toContain(`-F 'title=hello'`);
    expect(out).toContain(`-F 'avatar=@/tmp/avatar.png'`);
    expect(out).not.toContain('skip');
  });

  it('a binary body becomes --data-binary @path', () => {
    const draft = makeDraft({
      method: 'POST',
      bodyMode: 'binary',
      binaryPath: '/tmp/payload.bin',
    });
    const out = toCurl(draft);
    expect(out).toContain(`--data-binary @'/tmp/payload.bin'`);
  });

  it('a raw JSON body becomes --data-raw', () => {
    const draft = makeDraft({
      method: 'POST',
      bodyMode: 'json',
      bodies: { ...emptyBodies(), json: '{"a":1}' },
    });
    const out = toCurl(draft);
    expect(out).toContain(`--data-raw '{"a":1}'`);
  });

  it('never sends a body for GET, even with one configured', () => {
    const draft = makeDraft({
      method: 'GET',
      bodyMode: 'json',
      bodies: { ...emptyBodies(), json: '{"a":1}' },
    });
    const out = toCurl(draft);
    expect(out).not.toContain('--data-raw');
  });

  it('{{var}} survives verbatim in the URL, a header, and the body', () => {
    const draft = makeDraft({
      method: 'POST',
      url: 'https://{{host}}/things',
      headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
      bodyMode: 'json',
      bodies: { ...emptyBodies(), json: '{"id":"{{itemId}}"}' },
    });
    const out = toCurl(draft);
    expect(out).toContain('{{host}}');
    expect(out).toContain('{{token}}');
    expect(out).toContain('{{itemId}}');
  });

  it('renders a bearer token as an Authorization header', () => {
    const draft = makeDraft({ auth: { type: 'bearer', token: 'abc123' } });
    const out = toCurl(draft);
    expect(out).toContain(`--header 'Authorization: Bearer abc123'`);
  });

  it('renders basic auth as --user, not a base64 header', () => {
    const draft = makeDraft({ auth: { type: 'basic', username: 'bo', password: 'sw0rdfish' } });
    const out = toCurl(draft);
    expect(out).toContain(`--user 'bo:sw0rdfish'`);
    expect(out).not.toMatch(/Authorization/);
  });

  it('an apikey-in-query auth is appended to the URL, unresolved', () => {
    const draft = makeDraft({
      url: 'https://api.example.com/things',
      auth: { type: 'apikey', key: 'api_key', value: '{{apiKey}}', in: 'query' },
    });
    const out = toCurl(draft);
    expect(out).toContain('https://api.example.com/things?api_key={{apiKey}}');
  });

  it('carries the unresolved-variables note as a comment', () => {
    const out = toCurl(makeDraft());
    expect(out.split('\n')[0]).toMatch(/^#.*unresolved/);
  });
});

describe('toFetch', () => {
  it('omits a disabled header entirely', () => {
    const draft = makeDraft({
      headers: [
        { key: 'X-On', value: 'yes', enabled: true },
        { key: 'X-Off', value: 'no', enabled: false },
      ],
    });
    const out = toFetch(draft);
    expect(out).toContain('"X-On"');
    expect(out).not.toContain('X-Off');
  });

  it('a form-data body becomes a FormData builder', () => {
    const draft = makeDraft({
      method: 'POST',
      bodyMode: 'form-data',
      bodies: {
        ...emptyBodies(),
        'form-data': JSON.stringify([{ key: 'title', value: 'hello', enabled: true, type: 'text' }]),
      },
    });
    const out = toFetch(draft);
    expect(out).toContain('new FormData()');
    expect(out).toContain('formData.append("title", "hello")');
    expect(out).toContain('body: formData');
  });

  it('a binary body is called out rather than inlined', () => {
    const draft = makeDraft({ method: 'POST', bodyMode: 'binary', binaryPath: '/tmp/payload.bin' });
    const out = toFetch(draft);
    expect(out).toContain('/tmp/payload.bin');
  });

  it('{{var}} survives verbatim in the URL, a header, and the body', () => {
    const draft = makeDraft({
      method: 'POST',
      url: 'https://{{host}}/things',
      headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
      bodyMode: 'json',
      bodies: { ...emptyBodies(), json: '{"id":"{{itemId}}"}' },
    });
    const out = toFetch(draft);
    expect(out).toContain('{{host}}');
    expect(out).toContain('{{token}}');
    expect(out).toContain('{{itemId}}');
  });

  it('renders basic auth as a computed btoa() header', () => {
    const draft = makeDraft({ auth: { type: 'basic', username: 'bo', password: 'sw0rdfish' } });
    const out = toFetch(draft);
    expect(out).toContain('btoa("bo:sw0rdfish")');
  });

  it('carries the unresolved-variables note as a comment', () => {
    const out = toFetch(makeDraft());
    expect(out.split('\n')[0]).toMatch(/^\/\/.*unresolved/);
  });
});
