// notarizeOptions picks credentials; the two notarize.cjs copies must stay byte-identical.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const desktop = fileURLToPath(new URL('../../packages/desktop/scripts/notarize.cjs', import.meta.url));
const launcher = fileURLToPath(new URL('../../apps/launcher/scripts/notarize.cjs', import.meta.url));
const { notarizeOptions } = require(desktop);

const API = { APPLE_API_KEY: '/k.p8', APPLE_API_KEY_ID: 'KID', APPLE_API_ISSUER: 'ISS' };
const TRIO = { APPLE_ID: 'a@b.c', APPLE_APP_SPECIFIC_PASSWORD: 'pw', APPLE_TEAM_ID: 'T' };

describe('notarizeOptions', () => {
  it('API key wins when both sets exist', () => {
    expect(notarizeOptions({ ...API, ...TRIO }, '/x.app')).toEqual({
      appPath: '/x.app', appleApiKey: '/k.p8', appleApiKeyId: 'KID', appleApiIssuer: 'ISS',
    });
  });
  it('a partial API key falls through to the Apple ID trio', () => {
    expect(notarizeOptions({ APPLE_API_KEY: '/k.p8', APPLE_API_KEY_ID: 'KID', ...TRIO }, '/x.app')).toEqual({
      appPath: '/x.app', appleId: 'a@b.c', appleIdPassword: 'pw', teamId: 'T',
    });
  });
  it('nothing set returns null (skip cleanly)', () => {
    expect(notarizeOptions({}, '/x.app')).toBeNull();
    expect(notarizeOptions({ APPLE_API_KEY: '/k.p8' }, '/x.app')).toBeNull();
  });
  it('desktop and launcher copies are byte-equal', () => {
    expect(readFileSync(launcher, 'utf8')).toBe(readFileSync(desktop, 'utf8'));
  });
});
