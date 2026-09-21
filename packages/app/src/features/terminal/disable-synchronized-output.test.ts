import { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';

import { disableSynchronizedOutput } from './disable-synchronized-output';

function writeAsync(term: Terminal, data: string): Promise<void> {
  return new Promise<void>((resolve) => term.write(data, resolve));
}

describe('disableSynchronizedOutput', () => {
  it('intercepts DECRQM 2026 and responds with not-recognized (;0$y)', async () => {
    const term = new Terminal({ cols: 80, rows: 24 });
    disableSynchronizedOutput(term);

    const onData = vi.fn();
    term.onData(onData);

    await writeAsync(term, '\x1b[?2026$p');

    expect(onData).toHaveBeenCalledWith('\x1b[?2026;0$y');
  });

  it('prevents DECSET 2026 from enabling synchronized output mode', async () => {
    const term = new Terminal({ cols: 80, rows: 24 });
    disableSynchronizedOutput(term);

    await writeAsync(term, '\x1b[?2026h');

    expect(term.modes.synchronizedOutputMode).toBe(false);
  });

  it('allows other DECSET modes (e.g. bracketed paste 2004) to function normally', async () => {
    const term = new Terminal({ cols: 80, rows: 24 });
    disableSynchronizedOutput(term);

    await writeAsync(term, '\x1b[?2004h');

    expect(term.modes.bracketedPasteMode).toBe(true);
  });
});
