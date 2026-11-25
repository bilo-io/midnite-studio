// vitest/jsdom: PAT validation and the missing-scope list (Phase 146 E4).
import { describe, expect, it } from 'vitest';
import { missingScopes, validateToken } from './pat';

const reply = (body: unknown, init: ResponseInit = {}) => async () => new Response(JSON.stringify(body), { status: 200, ...init });

describe('missingScopes', () => {
  it('lists what a classic token lacks, accepting supersets', () => {
    expect(missingScopes('repo, read:org')).toEqual(['read:project']);
    expect(missingScopes('repo, admin:org, project')).toEqual([]);
    expect(missingScopes('')).toEqual(['repo', 'read:org', 'read:project']);
  });
  it('is unknown (null) without the header, as for fine-grained tokens', () => {
    expect(missingScopes(null)).toBeNull();
  });
});

describe('validateToken', () => {
  it('returns the login and missing scopes', async () => {
    const result = await validateToken('ghp_FAKE', reply({ data: { viewer: { login: 'octo' } } }, { headers: { 'X-OAuth-Scopes': 'repo' } }));
    expect(result).toEqual({ ok: true, login: 'octo', missingScopes: ['read:org', 'read:project'] });
  });
  it('401 is auth and the message never carries the token', async () => {
    const result = await validateToken('ghp_FAKE', reply({}, { status: 401 }));
    expect(result).toMatchObject({ ok: false, kind: 'auth' });
    expect(JSON.stringify(result)).not.toContain('ghp_FAKE');
  });
  it('a blank token fails before any request', async () => {
    expect(await validateToken('  ', reply({}))).toMatchObject({ ok: false });
  });
  it('a TypeError is network', async () => {
    const result = await validateToken('t', async () => {
      throw new TypeError('x');
    });
    expect(result).toMatchObject({ ok: false, kind: 'network' });
  });
});
