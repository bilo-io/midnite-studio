import { describe, expect, it, vi } from 'vitest';

import { BRACKETED_PASTE_ON, createInputGate } from './input-gate';

function setup(opts: { quietMs?: number; maxWaitMs?: number } = {}) {
  vi.useFakeTimers();
  const write = vi.fn();
  const gate = createInputGate({ input: 'claude --model x\r', write, ...opts });
  return { write, gate };
}

describe('input gate', () => {
  it('does not write on the first chunk of output (the lost-first-character race)', () => {
    const { write, gate } = setup();
    gate.onData('\x1b]0;zsh\x07');
    expect(write).not.toHaveBeenCalled();
    gate.dispose();
    vi.useRealTimers();
  });

  it('writes once, immediately, when the line editor enables bracketed paste', () => {
    const { write, gate } = setup();
    gate.onData('banner\r\n');
    gate.onData(`❯ ${BRACKETED_PASTE_ON}`);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('claude --model x\r');
    gate.onData(BRACKETED_PASTE_ON);
    vi.advanceTimersByTime(10_000);
    expect(write).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('recognises the marker split across two chunks', () => {
    const { write, gate } = setup();
    gate.onData('x\x1b[?20');
    expect(write).not.toHaveBeenCalled();
    gate.onData('04h');
    expect(write).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('stays held while a slow shell keeps printing, then falls back to quiet', () => {
    const { write, gate } = setup({ quietMs: 250 });
    gate.onData('a');
    vi.advanceTimersByTime(200);
    gate.onData('b');
    vi.advanceTimersByTime(200);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(write).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('writes after maxWait when the shell prints nothing', () => {
    const { write } = setup({ maxWaitMs: 4000 });
    vi.advanceTimersByTime(3999);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('never writes after dispose', () => {
    const { write, gate } = setup();
    gate.onData('a');
    gate.dispose();
    vi.advanceTimersByTime(10_000);
    expect(write).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
