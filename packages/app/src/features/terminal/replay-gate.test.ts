import { describe, expect, it } from 'vitest';

import { createReplayGate } from './replay-gate';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('createReplayGate', () => {
  it('holds chunks and releases them in arrival order after the snapshot', () => {
    const gate = createReplayGate();
    gate.hold(bytes('a'));
    gate.hold(bytes('b'));

    const written: Uint8Array[] = [];
    gate.release((chunk) => written.push(chunk));

    expect(written.map((c) => new TextDecoder().decode(c))).toEqual(['a', 'b']);
  });

  it('is open once released, and holds nothing further', () => {
    const gate = createReplayGate();
    gate.release(() => {});
    expect(gate.open).toBe(true);

    const written: Uint8Array[] = [];
    gate.hold(bytes('late'));
    gate.release((chunk) => written.push(chunk));
    expect(written).toHaveLength(0);
  });

  it('is a no-op the second time release is called', () => {
    const gate = createReplayGate();
    gate.hold(bytes('a'));

    const written: Uint8Array[] = [];
    gate.release((chunk) => written.push(chunk));
    gate.release((chunk) => written.push(chunk));

    expect(written).toHaveLength(1);
  });
});
