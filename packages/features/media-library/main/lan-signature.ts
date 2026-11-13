import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Phase 115 Theme E — short-lived signed stream URLs for the LAN server.
 *
 * A stream, a poster and a transcode are fetched by clients that can only be handed a URL (a DLNA renderer, VLC),
 * so the proof of access rides in the query: `?e=<expiry, epoch seconds>&s=<HMAC-SHA256 over path and expiry>`,
 * keyed by the server's access token. The URL is good for one path only and stops working at its expiry, or when
 * the token is regenerated (the key changes). The long-lived `?k=` is left to the browse pages.
 */

/** Six hours: a film plus a pause, not a standing credential. */
export const DEFAULT_STREAM_URL_TTL_SECONDS = 6 * 60 * 60;

const mac = (token: string, pathname: string, expiry: number): Buffer =>
  createHmac('sha256', token).update(`${pathname}\n${expiry}`).digest();

/** `path` with `?e=…&s=…` for `pathname`, expiring `ttlSeconds` after `nowMs`. Ids only — never a file path. */
export function signStreamPath(path: string, token: string, nowMs: number, ttlSeconds = DEFAULT_STREAM_URL_TTL_SECONDS): string {
  const expiry = Math.floor(nowMs / 1000) + ttlSeconds;
  return `${path}?e=${expiry}&s=${mac(token, path, expiry).toString('base64url')}`;
}

/** Whether `e`/`s` sign `pathname` under `token` and the expiry is still ahead of `nowMs`. Constant-time compare. */
export function verifyStreamSignature(token: string, pathname: string, e: string | null, s: string | null, nowMs: number): boolean {
  if (e === null || s === null || !/^\d{1,12}$/.test(e)) return false;
  const expiry = Number(e);
  if (expiry <= Math.floor(nowMs / 1000)) return false;
  const given = Buffer.from(s, 'base64url');
  const want = mac(token, pathname, expiry);
  return given.length === want.length && timingSafeEqual(given, want);
}
