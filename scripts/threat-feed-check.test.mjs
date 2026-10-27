// vitest/node: pure logic, no browser capability needed.
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, validateFeed, verifySignature } from './threat-feed-check.mjs';

const good = {
  version: 1,
  publishedAt: '2026-10-27',
  poisonedPackages: [{ ecosystem: 'npm', name: 'x', versions: ['1.0.0'], campaign: 'c', ref: 'https://example.com/a' }],
  clickfixDomains: ['evil.example'],
  commandGrammars: [{ id: 'g', regex: 'curl .*\\| *sh', severity: 'high', ref: 'https://example.com/b' }],
};

describe('threat-feed-check', () => {
  it('accepts a well-formed feed', () => expect(validateFeed(good)).toEqual([]));

  it('rejects a malformed one entry by entry', () => {
    const bad = { version: 0, publishedAt: '', poisonedPackages: [{ name: 'x', versions: [], ref: 'http://x' }], commandGrammars: [{ id: 'g', regex: '(', severity: 'bad', ref: 'nope' }], clickfixDomains: ['a/b'] };
    const problems = validateFeed(bad).join('\n');
    for (const expected of ['version', 'publishedAt', 'poisonedPackages[0]', 'regex does not compile', 'severity', 'bare domain']) expect(problems).toContain(expected);
  });

  it('canonicalises key order and verifies a signature, refusing a tampered byte', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    const sig = sign(null, Buffer.from(canonicalJson(good)), privateKey).toString('base64');
    expect(verifySignature(Object.fromEntries(Object.entries(good).reverse()), sig, pem)).toBe(true);
    expect(verifySignature({ ...good, version: 2 }, sig, pem)).toBe(false);
  });
});
