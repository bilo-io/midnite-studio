import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetAvatars,
  avatarFor,
  emailHash,
  gravatarUrl,
  hueFor,
  initialsFor,
  markAvatarMissing,
  normaliseEmail,
} from './avatars';

describe('normaliseEmail', () => {
  it('lowercases and trims, as Gravatar requires', () => {
    // Skipping this silently misses every author who typed a capital letter.
    expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
});

describe('emailHash', () => {
  it('is the SHA-256 of the normalised address', async () => {
    // Known vector — Gravatar has accepted SHA-256 since 2024, which is why
    // this needs no MD5 dependency.
    await expect(emailHash('ada@example.com')).resolves.toBe(
      await sha256Hex('ada@example.com'),
    );
  });

  it('ignores case and surrounding space', async () => {
    expect(await emailHash(' ADA@example.com ')).toBe(await emailHash('ada@example.com'));
  });
});

describe('gravatarUrl', () => {
  it('requests 2x for retina and 404s on a miss', () => {
    // `d=404` rather than `d=identicon`: a miss must fall through to our own
    // generated avatar instead of mixing in Gravatar's geometric placeholder.
    const url = gravatarUrl('abc123', 18);
    expect(url).toContain('s=36');
    expect(url).toContain('d=404');
  });
});

describe('avatarFor', () => {
  beforeEach(__resetAvatars);

  it('is pending on first ask and caches by email, not by call', () => {
    expect(avatarFor('ada@example.com').status).toBe('pending');
    // Every subsequent row by the same author reuses the one entry — 50k
    // commits by twelve authors must not be 50k lookups.
    expect(avatarFor('ADA@example.com ').status).toBe('pending');
  });

  it('stays none once an image has failed to load', () => {
    avatarFor('ada@example.com');
    markAvatarMissing('ada@example.com');
    expect(avatarFor('ada@example.com').status).toBe('none');
  });
});

describe('initialsFor', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFor('Ada Lovelace', 'a@b.com')).toBe('AL');
  });

  it('splits on dots and underscores too', () => {
    expect(initialsFor('ada_lovelace', 'a@b.com')).toBe('AL');
  });

  it('falls back to the email local part when there is no name', () => {
    expect(initialsFor('  ', 'grace@example.com')).toBe('GR');
  });

  it('never returns empty', () => {
    expect(initialsFor('', '@')).toBe('?');
  });
});

describe('hueFor', () => {
  it('is stable and case-insensitive, so a face keeps its colour', () => {
    expect(hueFor('ada@example.com')).toBe(hueFor(' ADA@Example.com '));
    expect(hueFor('ada@example.com')).toBeGreaterThanOrEqual(0);
    expect(hueFor('ada@example.com')).toBeLessThan(360);
  });

  it('separates different identities', () => {
    expect(hueFor('ada@example.com')).not.toBe(hueFor('grace@example.com'));
  });
});

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('snapshot stability', () => {
  beforeEach(__resetAvatars);

  /**
   * `avatarFor` is a `getSnapshot` for useSyncExternalStore, which compares by
   * reference. An equal-but-new object on the first call makes React see a
   * change that is not one and re-render every avatar an extra time on mount.
   */
  it('returns the identical object across calls', () => {
    const first = avatarFor('ada@example.com');
    const second = avatarFor('ada@example.com');
    expect(first).toBe(second);
  });

  it('keeps a failed load failed even if the hash resolves afterwards', async () => {
    // The image error is a verdict from a real request; promoting the identity
    // back to `ready` would restart the failing fetch on every row.
    avatarFor('ada@example.com');
    markAvatarMissing('ada@example.com');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(avatarFor('ada@example.com').status).toBe('none');
  });
});

describe('size is not baked into the cache', () => {
  beforeEach(__resetAvatars);

  /**
   * The cache holds the hash; the URL is built per render at the active
   * style's node size. Caching the URL would leave GitKraken's 24px node
   * drawing whatever `?s=` the first style to ask happened to want.
   */
  it('builds a different URL per size from one cached hash', async () => {
    avatarFor('ada@example.com');
    await new Promise((resolve) => setTimeout(resolve, 10));

    const state = avatarFor('ada@example.com');
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;

    expect(gravatarUrl(state.hash, 18)).toContain('s=36');
    expect(gravatarUrl(state.hash, 24)).toContain('s=48');
  });
});
