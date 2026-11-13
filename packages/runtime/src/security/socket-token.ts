import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A per-launch secret for a local Unix socket — Phase 115 Theme E. A `0600` socket in a `0700`
 * directory already keeps other users out; the token additionally refuses a *same-user* process that
 * merely found the path (a stray script, a compromised dependency). The token lives in a `0600`
 * file next to the socket, so only a process that can read the owner's files can dial in.
 */

const TOKEN_BYTES = 32;

/** The token file that sits beside a socket. */
export function socketTokenPath(socketPath: string): string {
  return `${socketPath}.token`;
}

/** A fresh token (64 hex chars), written `0600` into a `0700` directory, replacing any older one. */
export function writeSocketToken(socketPath: string): string {
  const path = socketTokenPath(socketPath);
  mkdirSync(dirname(path), { mode: 0o700, recursive: true });
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  writeFileSync(path, token, { mode: 0o600 });
  chmodSync(path, 0o600);
  return token;
}

/** The token beside `socketPath`, or `null` when there is none (a legacy or tokenless peer). */
export function readSocketToken(socketPath: string): string | null {
  try {
    const token = readFileSync(socketTokenPath(socketPath), 'utf8').trim();
    return token === '' ? null : token;
  } catch {
    return null;
  }
}

export function removeSocketToken(socketPath: string): void {
  try {
    unlinkSync(socketTokenPath(socketPath));
  } catch {
    // Already gone.
  }
}

/** Constant-time comparison; a non-string or wrong-length candidate is simply `false`. */
export function socketTokenMatches(expected: string, candidate: unknown): boolean {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
