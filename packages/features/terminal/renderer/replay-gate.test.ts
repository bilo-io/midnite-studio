import { describe, expect, it, vi } from 'vitest';

import { createReplayGate, gateLiveWrite, replayLiveHandoff, writeAtSourceSize } from './replay-gate';

const bytes = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

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

describe('gateLiveWrite', () => {
  it('holds a chunk while the gate is closed', () => {
    const gate = createReplayGate();
    const written: string[] = [];

    gateLiveWrite(gate, bytes('a'), (chunk) => written.push(decode(chunk)));

    expect(written).toEqual([]);
    gate.release((chunk) => written.push(decode(chunk)));
    expect(written).toEqual(['a']);
  });

  it('writes straight through once the gate is open', () => {
    const gate = createReplayGate();
    gate.release(() => {});
    const written: string[] = [];

    gateLiveWrite(gate, bytes('a'), (chunk) => written.push(decode(chunk)));

    expect(written).toEqual(['a']);
  });

  it('writes straight through with no gate at all — the no-replay-in-flight case', () => {
    const written: string[] = [];
    gateLiveWrite(null, bytes('a'), (chunk) => written.push(decode(chunk)));
    expect(written).toEqual(['a']);
  });
});

describe('replayLiveHandoff (Phase 84 Theme E.3 — the rehydrate hand-off)', () => {
  it('writes the snapshot before releasing anything a live chunk sent while the fetch was in flight', async () => {
    const written: string[] = [];
    let resolveSnapshot: (bytes: Uint8Array) => void = () => {};
    const fetchSnapshot = () => new Promise<Uint8Array>((resolve) => (resolveSnapshot = resolve));

    const gate = replayLiveHandoff(
      fetchSnapshot,
      (snapshot) => written.push(`snapshot:${decode(snapshot)}`),
      (chunk) => written.push(`live:${decode(chunk)}`),
      () => false,
    );

    // A live chunk arrives while the fetch is still in flight: held, not
    // written — writing it now would race it ahead of the snapshot bytes it
    // causally followed.
    gateLiveWrite(gate, bytes('mid-flight'), (chunk) => written.push(`live:${decode(chunk)}`));
    expect(written).toEqual([]);

    resolveSnapshot(bytes('scrollback'));
    await Promise.resolve();
    await Promise.resolve();

    // Snapshot first, in-flight chunk released after — never the other order,
    // and never dropped or duplicated.
    expect(written).toEqual(['snapshot:scrollback', 'live:mid-flight']);

    // Once open, a later chunk goes straight through.
    gateLiveWrite(gate, bytes('after'), (chunk) => written.push(`live:${decode(chunk)}`));
    expect(written).toEqual(['snapshot:scrollback', 'live:mid-flight', 'live:after']);
  });

  it('never calls onSnapshot or releases the gate once the caller reports itself cancelled', async () => {
    const written: string[] = [];
    let resolveSnapshot: (bytes: Uint8Array) => void = () => {};
    const fetchSnapshot = () => new Promise<Uint8Array>((resolve) => (resolveSnapshot = resolve));
    let cancelled = false;

    const gate = replayLiveHandoff(
      fetchSnapshot,
      () => written.push('snapshot'),
      () => written.push('release'),
      () => cancelled,
    );

    cancelled = true;
    resolveSnapshot(bytes('scrollback'));
    await Promise.resolve();
    await Promise.resolve();

    expect(written).toEqual([]);
    expect(gate.open).toBe(false);
  });

  it('opens the gate once the (possibly empty) snapshot resolves, even with nothing to release', async () => {
    const onSnapshot = vi.fn();
    const gate = replayLiveHandoff(() => Promise.resolve(new Uint8Array(0)), onSnapshot, () => {}, () => false);

    expect(gate.open).toBe(false); // construction itself never opens it
    await Promise.resolve();
    await Promise.resolve();

    expect(onSnapshot).toHaveBeenCalledWith(new Uint8Array(0));
    expect(gate.open).toBe(true);
  });
});

describe('replayLiveHandoff onReleased', () => {
  it('calls onSnapshot, then held chunks, then onReleased', async () => {
    const order: string[] = [];
    const gate = replayLiveHandoff(
      () => Promise.resolve(bytes('s')),
      () => order.push('snapshot'),
      (chunk) => order.push(`live:${decode(chunk)}`),
      () => false,
      () => order.push('released'),
    );
    gateLiveWrite(gate, bytes('held'), () => order.push('direct'));
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['snapshot', 'live:held', 'released']);
  });

  it('does not call onReleased when cancelled', async () => {
    const onReleased = vi.fn();
    replayLiveHandoff(() => Promise.resolve(bytes('s')), () => {}, () => {}, () => true, onReleased);
    await Promise.resolve();
    await Promise.resolve();
    expect(onReleased).not.toHaveBeenCalled();
  });
});

describe('writeAtSourceSize', () => {
  const fake = () => {
    const calls: string[] = [];
    return {
      calls,
      term: {
        resize: (c: number, r: number) => calls.push(`resize:${c}x${r}`),
        write: (d: Uint8Array) => calls.push(`write:${decode(d)}`),
      },
    };
  };

  it('resizes to the snapshot size then writes', () => {
    const { calls, term } = fake();
    writeAtSourceSize(term, { bytes: bytes('x'), cols: 120, rows: 40 });
    expect(calls).toEqual(['resize:120x40', 'write:x']);
  });

  it('skips resize when cols or rows is absent', () => {
    const { calls, term } = fake();
    writeAtSourceSize(term, { bytes: bytes('x'), cols: 120 });
    writeAtSourceSize(term, { bytes: bytes('y') });
    expect(calls).toEqual(['write:x', 'write:y']);
  });

  it('skips write on empty bytes', () => {
    const { calls, term } = fake();
    writeAtSourceSize(term, { bytes: new Uint8Array(0), cols: 80, rows: 24 });
    expect(calls).toEqual(['resize:80x24']);
  });
});
