/**
 * Author avatars, from Gravatar.
 *
 * Deduped by **email, not by commit**: a 50 000-commit repo with twelve authors
 * makes twelve requests, and the hash — which is async — is computed once per
 * identity rather than on every render of a recycled virtualized row.
 */

export type AvatarState =
  /** Hash in flight, or the image still loading. Render the fallback. */
  | { status: 'pending' }
  /**
   * Gravatar may have a picture for this identity.
   *
   * Carries the HASH, not a URL. The URL embeds a pixel size, and the size
   * belongs to whichever style is active — baking in whichever asked first
   * leaves GitKraken's 24px node drawing an 18px style's `?s=36` bitmap.
   */
  | { status: 'ready'; hash: string }
  /** No picture, offline, or the request failed. Render the fallback, forever. */
  | { status: 'none' };

const cache = new Map<string, AvatarState>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Gravatar wants the address lowercased and trimmed before hashing. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/**
 * SHA-256, not MD5.
 *
 * Gravatar has accepted SHA-256 hashes since 2024 and `crypto.subtle` ships it,
 * so the alternative is pulling an MD5 implementation into the renderer for one
 * function. Returns null where SubtleCrypto is absent (a non-secure context, or
 * jsdom without a polyfill), which the caller treats as "no avatar" rather than
 * as an error.
 */
export async function emailHash(email: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(normaliseEmail(email));
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * `d=404` rather than `d=identicon`.
 *
 * A miss should be a *miss*, so it falls through to our own generated avatar and
 * the graph keeps one visual language — `d=identicon` would mix Gravatar's
 * geometric placeholder with our initials, which looks like two bugs.
 */
export const gravatarUrl = (hash: string, size: number): string =>
  `https://gravatar.com/avatar/${hash}?s=${Math.round(size * 2)}&d=404`;

/**
 * Current state for an email; `pending` on first ask, which starts the lookup.
 *
 * Returns the CACHED object, never a fresh literal — this is a `getSnapshot`
 * for `useSyncExternalStore`, which compares snapshots by reference. Handing
 * back an equal-but-new object on the first call makes React see a change that
 * is not one, and re-render every avatar an extra time on mount (and warn about
 * an uncached snapshot in development).
 */
export function avatarFor(email: string): AvatarState {
  const key = normaliseEmail(email);
  const known = cache.get(key);
  if (known) return known;

  cache.set(key, PENDING);
  if (!inFlight.has(key)) inFlight.set(key, resolve(key));
  return PENDING;
}

/** Shared, so every not-yet-resolved identity has the identical snapshot. */
const PENDING: AvatarState = { status: 'pending' };

async function resolve(key: string): Promise<void> {
  try {
    const hash = await emailHash(key);
    // A `markAvatarMissing` that landed while the hash was in flight is a
    // verdict from a real image load; do not promote the identity back to
    // `ready` and start the failing request over.
    if (cache.get(key)?.status === 'none') return;
    cache.set(key, hash ? { status: 'ready', hash } : { status: 'none' });
  } catch {
    // A hash that cannot be computed is not an error the user can act on; it is
    // simply an identity with no picture.
    cache.set(key, { status: 'none' });
  } finally {
    inFlight.delete(key);
    listeners.forEach((fn) => fn());
  }
}

/**
 * Demote an identity whose image 404s or fails to load.
 *
 * The URL resolving says nothing about whether Gravatar HAS a picture — with
 * `d=404` the answer only arrives as the image's own load error. Recording it
 * stops every subsequent row for that author retrying the same failed request.
 */
export function markAvatarMissing(email: string): void {
  const key = normaliseEmail(email);
  if (cache.get(key)?.status === 'none') return;
  cache.set(key, { status: 'none' });
  listeners.forEach((fn) => fn());
}

export function subscribeAvatars(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test seam — the module-level cache would otherwise leak between cases. */
export function __resetAvatars(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * Initials for the generated fallback.
 *
 * Prefers the author's name; falls back to the email's local part so an
 * identity with no name still gets something better than a blank circle.
 */
export function initialsFor(name: string, email: string): string {
  const source = name.trim() || normaliseEmail(email).split('@')[0] || '?';
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

/**
 * A stable hue for an identity, so the generated avatar is the same colour every
 * time you see that person.
 *
 * FNV-1a, mirroring `git-engine/src/layout/colors.ts` — a pure function, and the
 * renderer may not import from git-engine (eslint boundary).
 */
export function hueFor(email: string): number {
  const key = normaliseEmail(email);
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}
