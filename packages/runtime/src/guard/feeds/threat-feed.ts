import { createPublicKey, verify } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalJson, THREAT_FEED_PUBLIC_KEY_PEM, ThreatFeedSchema, type ThreatFeed } from '@midnite/studio-shared';

import type { FeedFetch } from './osv';

export type ThreatFeedResult = { ok: true; feed: ThreatFeed } | { ok: false; reason: string };

/**
 * Verifies a detached Ed25519 signature (base64) over the canonical JSON of the feed, then validates its shape.
 * Nothing in the feed is returned unless the signature holds, and a malformed entry rejects the whole file.
 */
export function verifyThreatFeed(body: string, signatureBase64: string, publicKeyPem: string = THREAT_FEED_PUBLIC_KEY_PEM): ThreatFeedResult {
  if (!publicKeyPem.trim()) return { ok: false, reason: 'no threat-feed public key is configured' };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'the feed is not valid JSON' };
  }
  try {
    const key = createPublicKey(publicKeyPem);
    const good = verify(null, Buffer.from(canonicalJson(json), 'utf8'), key, Buffer.from(signatureBase64.trim(), 'base64'));
    if (!good) return { ok: false, reason: 'the feed signature does not verify' };
  } catch (error) {
    return { ok: false, reason: `the feed signature could not be checked: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = ThreatFeedSchema.safeParse(json);
  return parsed.success ? { ok: true, feed: parsed.data } : { ok: false, reason: 'the feed does not match its schema' };
}

export interface ThreatFeedOptions {
  fetch: FeedFetch;
  /** `<userData>/security/feeds/threat`. */
  cacheDir: string;
  /** Where the feed and its `.sig` sit, e.g. beside the midnite-apps catalog. */
  url: string;
  publicKeyPem?: string;
}

/** Downloads the feed and its signature, verifies, caches; offline or failing, the last verified copy is used. */
export async function loadThreatFeed(options: ThreatFeedOptions): Promise<ThreatFeedResult> {
  const file = join(options.cacheDir, 'threat-feed.json');
  const sigFile = join(options.cacheDir, 'threat-feed.sig');
  try {
    const [bodyRes, sigRes] = await Promise.all([options.fetch(options.url), options.fetch(`${options.url}.sig`)]);
    if (bodyRes.ok && sigRes.ok) {
      const body = await bodyRes.text();
      const sig = await sigRes.text();
      const verified = verifyThreatFeed(body, sig, options.publicKeyPem);
      if (verified.ok) {
        try {
          await mkdir(options.cacheDir, { recursive: true, mode: 0o700 });
          await writeFile(`${file}.tmp`, body, 'utf8');
          await rename(`${file}.tmp`, file);
          await writeFile(sigFile, sig, 'utf8');
        } catch {
          // cache is best-effort
        }
        return verified;
      }
      return verified; // a bad signature is reported, not papered over with an older copy
    }
  } catch {
    // offline: fall through to the cache
  }
  try {
    return verifyThreatFeed(await readFile(file, 'utf8'), await readFile(sigFile, 'utf8'), options.publicKeyPem);
  } catch {
    return { ok: false, reason: 'the feed could not be downloaded and none is cached' };
  }
}
