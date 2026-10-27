import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FeedFetch } from './osv';
import { loadThreatFeed, verifyThreatFeed } from './threat-feed';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const feed = { version: 1, publishedAt: '2026-10-27', poisonedPackages: [{ ecosystem: 'npm', name: 'x', versions: ['1.0.0'], campaign: 'c', ref: 'https://example.com/a' }] };
const body = JSON.stringify(feed, null, 2);
const sig = sign(null, Buffer.from(canonicalJson(feed)), privateKey).toString('base64');

describe('threat feed (Phase 122 Theme C)', () => {
  it('verifies a signed feed regardless of spacing and key order', () => {
    const r = verifyThreatFeed(JSON.stringify(feed), sig, pem);
    expect(r.ok).toBe(true);
    expect(r.ok && r.feed.poisonedPackages).toHaveLength(1);
  });

  it('refuses a tampered byte, a wrong signature, a malformed entry and an unconfigured key', () => {
    expect(verifyThreatFeed(body.replace('1.0.0', '1.0.1'), sig, pem)).toMatchObject({ ok: false, reason: expect.stringContaining('signature') });
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(verifyThreatFeed(body, sig, other).ok).toBe(false);
    const bad = { ...feed, poisonedPackages: [{ name: 'x' }] };
    const badSig = sign(null, Buffer.from(canonicalJson(bad)), privateKey).toString('base64');
    expect(verifyThreatFeed(JSON.stringify(bad), badSig, pem)).toMatchObject({ ok: false, reason: expect.stringContaining('schema') });
    expect(verifyThreatFeed(body, sig, '')).toMatchObject({ ok: false });
    expect(verifyThreatFeed('{nope', sig, pem).ok).toBe(false);
  });

  describe('loadThreatFeed', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'tf-'));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });
    const mk = (mode: { down?: boolean; body?: string }): FeedFetch => async (url) => {
      if (mode.down) throw new Error('offline');
      const text = url.endsWith('.sig') ? sig : (mode.body ?? body);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(text), text: async () => text };
    };

    it('caches a verified feed, serves it offline, and does not fall back on a bad signature', async () => {
      const opts = { cacheDir: dir, url: 'https://x/threat-feed.json', publicKeyPem: pem };
      expect((await loadThreatFeed({ ...opts, fetch: mk({}) })).ok).toBe(true);
      expect((await loadThreatFeed({ ...opts, fetch: mk({ down: true }) })).ok).toBe(true);
      expect((await loadThreatFeed({ ...opts, fetch: mk({ body: body.replace('1.0.0', '9.9.9') }) })).ok).toBe(false);
    });
  });
});
