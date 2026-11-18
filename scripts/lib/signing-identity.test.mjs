// Unit tests for scripts/lib/signing-identity.cjs (node-only logic, vitest root include).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { resolveSigning, afterPackSignArg } = createRequire(import.meta.url)('./signing-identity.cjs');

const DEV_ID = '  1) ABCDEF0123 "Developer ID Application: Midnite (TEAM123)"';
const APPLE_DEV = '  1) ABCDEF0123 "Apple Development: Someone (XYZ)"';

describe('resolveSigning', () => {
  it('CSC_IDENTITY_AUTO_DISCOVERY=false forces adhoc even with everything else set', () => {
    const env = { CSC_IDENTITY_AUTO_DISCOVERY: 'false', CSC_LINK: 'x', MIDNITE_CODESIGN_IDENTITY: 'Y' };
    expect(resolveSigning(env, () => DEV_ID)).toEqual({ kind: 'adhoc' });
  });
  it('MIDNITE_CODESIGN_IDENTITY wins and the hook signs with it itself', () => {
    const r = resolveSigning({ MIDNITE_CODESIGN_IDENTITY: 'Developer ID Application: Me (T)', CSC_LINK: 'x' }, () => '');
    expect(r).toEqual({ kind: 'developer-id', name: 'Developer ID Application: Me (T)', source: 'env' });
    expect(afterPackSignArg(r)).toBe('Developer ID Application: Me (T)');
  });
  it('CSC_LINK or CSC_NAME means electron-builder signs', () => {
    expect(resolveSigning({ CSC_LINK: 'blob' }, () => '')).toEqual({ kind: 'developer-id', name: 'from CSC_LINK', source: 'builder' });
    expect(resolveSigning({ CSC_NAME: 'Acme' }, () => '').name).toBe('Acme');
    expect(afterPackSignArg(resolveSigning({ CSC_LINK: 'blob' }, () => ''))).toBeNull();
  });
  it('a Developer ID in the keychain is found and builder signs', () => {
    const r = resolveSigning({}, () => `${APPLE_DEV}\n${DEV_ID}\n`);
    expect(r).toEqual({ kind: 'developer-id', name: 'Developer ID Application: Midnite (TEAM123)', source: 'keychain' });
    expect(afterPackSignArg(r)).toBeNull();
  });
  it('an Apple Development identity alone is adhoc', () => {
    expect(resolveSigning({}, () => APPLE_DEV)).toEqual({ kind: 'adhoc' });
  });
  it('empty or throwing listing is adhoc, signed with "-"', () => {
    expect(resolveSigning({}, () => '')).toEqual({ kind: 'adhoc' });
    expect(resolveSigning({}, () => { throw new Error('no security'); })).toEqual({ kind: 'adhoc' });
    expect(afterPackSignArg({ kind: 'adhoc' })).toBe('-');
  });
  it('blank env values do not count', () => {
    expect(resolveSigning({ CSC_LINK: '  ', MIDNITE_CODESIGN_IDENTITY: '' }, () => '')).toEqual({ kind: 'adhoc' });
  });
});
