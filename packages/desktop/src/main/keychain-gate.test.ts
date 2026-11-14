import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { whenKeychainMayBeTouched, type GateWindow } from './keychain-gate';

function setup(vaultPresent: boolean) {
  const fn = vi.fn();
  let firstAccess: () => void = () => undefined;
  const timers: Array<() => void> = [];
  const gate = whenKeychainMayBeTouched(fn, {
    vaultPresent: () => vaultPresent,
    onFirstAccess: (listener) => {
      firstAccess = listener;
    },
    setTimer: (callback) => {
      timers.push(callback);
    },
  });
  const window = new EventEmitter() as EventEmitter & GateWindow;
  return { fn, gate, window, timers, access: () => firstAccess() };
}

describe('whenKeychainMayBeTouched', () => {
  it('runs on the first vault access with no window at all, exactly once', () => {
    const { fn, access } = setup(false);
    access();
    access();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('waits for ready-to-show, then focus, then the idle timer', () => {
    const { fn, gate, window, timers } = setup(true);
    gate.attachWindow(window);
    window.emit('focus');
    expect(timers).toHaveLength(0);
    window.emit('ready-to-show');
    expect(fn).not.toHaveBeenCalled();
    window.emit('focus');
    expect(fn).not.toHaveBeenCalled();
    timers[0]!();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never runs on the window path when no vault file exists', () => {
    const { fn, gate, window, timers } = setup(false);
    gate.attachWindow(window);
    window.emit('ready-to-show');
    window.emit('focus');
    expect(timers).toHaveLength(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs once when the window path and a vault access both fire', () => {
    const { fn, gate, window, timers, access } = setup(true);
    gate.attachWindow(window);
    window.emit('ready-to-show');
    window.emit('focus');
    access();
    timers[0]!();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(gate.ran).toBe(true);
  });
});
