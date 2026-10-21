import { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';

/**
 * What a program gets back when it asks the terminal what it supports.
 *
 * This replaces `disable-synchronized-output.test.ts`, which covered a
 * workaround that has been removed: the app used to intercept DECRQM 2026 and
 * answer "not recognized", on the theory that Bubble Tea left synchronized
 * output enabled and froze the display. It did not — the freeze was xterm's own
 * `requestMode` throwing in minified builds, fixed in
 * `vite-xterm-decrqm-plugin.ts`, and measured off a real pty `agy` balances
 * every `\x1b[?2026h` with a `\x1b[?2026l`.
 *
 * So no app code answers mode queries any more, and this pins that: xterm's own
 * handler runs, and it tells the truth. The test cannot see the minifier bug —
 * vitest runs unminified, which is exactly why that one needs a build-level test
 * of its own — but it is what fails if anything in this app ever starts
 * intercepting DECRQM again and lying about a capability.
 */
function reply(data: string): { term: Terminal; onData: ReturnType<typeof vi.fn> } {
  const term = new Terminal({ cols: 80, rows: 24 });
  const onData = vi.fn();
  term.onData(onData);
  term.write(data);
  return { term, onData };
}

const flush = (term: Terminal): Promise<void> =>
  new Promise<void>((resolve) => term.write('', resolve));

describe('DECRQM, answered by xterm itself', () => {
  it('reports synchronized output (2026) as supported and currently reset', async () => {
    const { term, onData } = reply('\x1b[?2026$p');
    await flush(term);
    // `;2` is DECRPM "reset" — recognized, just not on. The removed workaround
    // answered `;0` (not recognized), which is the lie this guards against.
    expect(onData).toHaveBeenCalledWith('\x1b[?2026;2$y');
  });

  it('reports synchronized output as set once a program enables it', async () => {
    const { term, onData } = reply('\x1b[?2026h\x1b[?2026$p');
    await flush(term);
    expect(term.modes.synchronizedOutputMode).toBe(true);
    expect(onData).toHaveBeenCalledWith('\x1b[?2026;1$y');
  });

  it('lets a program turn synchronized output back off', async () => {
    const { term } = reply('\x1b[?2026h\x1b[?2026l');
    await flush(term);
    expect(term.modes.synchronizedOutputMode).toBe(false);
  });

  it('reports an unknown mode (2027) as not recognized rather than throwing', async () => {
    // The query that outlived the old workaround and kept hitting the throw:
    // `agy` sends 2026 and 2027 together, and only 2026 was intercepted.
    const { term, onData } = reply('\x1b[?2027$p');
    await flush(term);
    expect(onData).toHaveBeenCalledWith('\x1b[?2027;0$y');
  });

  it('answers every mode query agy opens with, in the order it sends them', async () => {
    const { term, onData } = reply('\x1b[c\x1b[?2026$p\x1b[?2027$p');
    await flush(term);
    expect(onData.mock.calls.map(([d]) => d)).toEqual([
      '\x1b[?1;2c',
      '\x1b[?2026;2$y',
      '\x1b[?2027;0$y',
    ]);
  });
});
