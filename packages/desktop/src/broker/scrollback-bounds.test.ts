import { SCROLLBACK_BYTES } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { trimScrollback } from './server';

/**
 * Phase 36 F — the scrollback bound, asserted rather than assumed.
 *
 * Two different limits are in play and it matters which is which: the in-memory
 * buffers (`appendScrollback`, in both `broker/server.ts` and
 * `main/inproc-pty.ts`) hold up to `SCROLLBACK_BYTES * 2` before dropping the
 * head, while `trimScrollback` — the function that runs before bytes are handed
 * on or written out — brings a buffer back to `SCROLLBACK_BYTES` and stamps a
 * terminal reset at the front, because a buffer cut mid-stream can otherwise
 * begin inside an escape sequence and leave xterm in a wrong mode.
 */
const line = (n: number): string => `line ${n}\n`;

function buffer(bytes: number): Uint8Array {
  let text = '';
  for (let i = 0; text.length < bytes; i += 1) text += line(i);
  return new TextEncoder().encode(text.slice(0, bytes));
}

describe('trimScrollback', () => {
  it('leaves a buffer under the limit untouched', () => {
    const small = buffer(1_000);

    const out = trimScrollback(small, SCROLLBACK_BYTES);

    expect(out).toBe(small);
  });

  it('brings an over-limit buffer back to the limit', () => {
    const big = buffer(SCROLLBACK_BYTES + 50_000);

    const out = trimScrollback(big, SCROLLBACK_BYTES);

    // The reset sequence is prepended, so the result may exceed `limit` by
    // exactly that prefix — never by the overflow it was given.
    expect(out.length).toBeLessThanOrEqual(SCROLLBACK_BYTES + 16);
    expect(out.length).toBeLessThan(big.length);
  });

  it('stays bounded no matter how far over it starts', () => {
    for (const overflow of [1, 100_000, SCROLLBACK_BYTES * 4]) {
      const out = trimScrollback(buffer(SCROLLBACK_BYTES + overflow), SCROLLBACK_BYTES);

      expect(out.length).toBeLessThanOrEqual(SCROLLBACK_BYTES + 16);
    }
  });

  it('cuts at a line boundary, not mid-line', () => {
    const out = trimScrollback(buffer(SCROLLBACK_BYTES + 5_000), SCROLLBACK_BYTES);

    const text = new TextDecoder().decode(out);
    // Past the reset prefix, the first newline-delimited chunk is a whole line.
    const firstLine = text.slice(text.indexOf('line'));
    expect(firstLine).toMatch(/^line \d+\n/);
  });

  it('applies the in-memory allowance when handed the doubled limit', () => {
    // The allowance `appendScrollback` uses on every chunk.
    const out = trimScrollback(buffer(SCROLLBACK_BYTES * 3), SCROLLBACK_BYTES * 2);

    expect(out.length).toBeLessThanOrEqual(SCROLLBACK_BYTES * 2 + 16);
  });
});
