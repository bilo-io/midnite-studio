import { describe, expect, it } from 'vitest';

import {
  CANARY_RELATIVE_PATH,
  canaryFileContent,
  classifySecret,
  generateCanaryValues,
  mergeRedactions,
  redactOutbound,
  redactOutboundMessages,
  redactionLabel,
  redactionTotal,
} from './outbound-redaction';
import { SECRET_PATTERNS } from './redact';

const seeded = (seed: number) => (n: number) => Uint8Array.from({ length: n }, (_, i) => (seed * 31 + i * 17) % 251);

describe('redactOutbound', () => {
  it('replaces a vault value, even one with no recognisable shape, with a kind chip', () => {
    const value = 'Zq8vK2mXw9LpR4tYb7NcH3dJ6fGs1AaE';
    const r = redactOutbound(`use ${value} for deploy, and ${value} again`, [{ name: 'secrets:x', value }]);
    expect(r.text).toBe(`use ${redactionLabel('vault-secret')} for deploy, and ${redactionLabel('vault-secret')} again`);
    expect(r.redactions).toEqual([{ kind: 'vault-secret', count: 2 }]);
    expect(r.canary).toBe(false);
  });

  it('leaves a short vault value alone: a short password is also an ordinary word', () => {
    const r = redactOutbound('the postgres server', [{ name: 'db:c1', value: 'postgres' }]);
    expect(r.text).toBe('the postgres server');
    expect(r.redactions).toEqual([]);
  });

  it('labels a canary as canary and says so', () => {
    const canary = `ghp_${'q'.repeat(36)}`;
    const r = redactOutbound(`token=${canary}`, [{ name: 'canaries:github-pat', value: canary, kind: 'canary' }]);
    expect(r.canary).toBe(true);
    expect(r.text).toBe('token=[redacted: canary]');
  });

  it.each([
    [`ghp_${'a'.repeat(36)}`, 'github-token'],
    [`sk-ant-${'b'.repeat(30)}`, 'anthropic-key'],
    ['AKIAABCDEFGHIJKLMNOP', 'aws-key'],
    [`xoxb-${'1'.repeat(12)}`, 'slack-token'],
    ['eyJhbGciOiJI.eyJzdWIiOiIx.abcdefghijk', 'jwt'],
    ['Bearer abcdefghijklmnop1234', 'auth-header'],
    ['-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', 'private-key'],
  ])('classifies %s as %s by shape', (secret, kind) => {
    expect(classifySecret(secret)).toBe(kind);
    const r = redactOutbound(`before ${secret} after`);
    expect(r.text).toContain(redactionLabel(kind));
    expect(r.text).not.toContain(secret);
  });

  it('keeps the scheme and drops the credential in a URL', () => {
    const r = redactOutbound('clone https://user:hunter2hunter2@github.com/a/b.git');
    expect(r.text).toBe('clone https://[redacted: url-credential]@github.com/a/b.git');
  });

  it('does not collapse a home directory: a prompt needs the real working directory', () => {
    const text = 'cwd is /Users/someone/work/app and the sha is 0123456789abcdef0123456789abcdef01234567';
    expect(redactOutbound(text).text).toBe(text);
  });

  it('scrubs only message content, leaving roles and untouched messages by identity', () => {
    const a = { role: 'user', content: 'hello' };
    const b = { role: 'user', content: `k ${`ghp_${'z'.repeat(36)}`}` };
    const r = redactOutboundMessages([a, b]);
    expect(r.messages[0]).toBe(a);
    expect(r.messages[1]).toEqual({ role: 'user', content: 'k [redacted: github-token]' });
    expect(r.redactions).toEqual([{ kind: 'github-token', count: 1 }]);
  });

  it('does not read marker characters already in the text as its own markers', () => {
    const r = redactOutbound('a \uE0000\uE001 b');
    expect(r.text).not.toContain('undefined');
    expect(r.redactions).toEqual([]);
  });

  it('merges and totals redactions by kind', () => {
    const merged = mergeRedactions([{ kind: 'a', count: 1 }], [{ kind: 'a', count: 2 }, { kind: 'b', count: 1 }]);
    expect(merged).toEqual([{ kind: 'a', count: 3 }, { kind: 'b', count: 1 }]);
    expect(redactionTotal(merged)).toBe(4);
  });
});

describe('canary values', () => {
  it('are shaped like a GitHub PAT and an AWS key, and match the redaction patterns', () => {
    const { githubPat, awsKey } = generateCanaryValues(seeded(1));
    expect(githubPat).toMatch(/^ghp_[A-Za-z0-9]{36}$/);
    expect(awsKey).toMatch(/^AKIA[A-Z2-7]{16}$/);
    for (const value of [githubPat, awsKey]) expect(SECRET_PATTERNS.some((p) => new RegExp(p.source, p.flags.replace('g', '')).test(value))).toBe(true);
  });

  it('differ per draw and the file carries both', () => {
    const one = generateCanaryValues(seeded(1));
    const two = generateCanaryValues(seeded(2));
    expect(one.githubPat).not.toBe(two.githubPat);
    const file = canaryFileContent(one);
    expect(file).toContain(one.githubPat);
    expect(file).toContain(one.awsKey);
    expect(CANARY_RELATIVE_PATH).toBe('.config/midnite/.env.canary');
  });
});
