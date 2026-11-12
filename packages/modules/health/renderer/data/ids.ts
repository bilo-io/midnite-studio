const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A short id like `m-a1b2c3d4` — the shape the schemas' `shortId` accepts. */
export function shortId(prefix: 'm' | 'f' | 'd' | 'x' | 'w'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}
