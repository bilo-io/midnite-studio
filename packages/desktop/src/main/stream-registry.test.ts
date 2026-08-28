import { describe, expect, it, vi } from 'vitest';
import { BrowserWindow } from 'electron';

import {
  cancel,
  cancelAll,
  countOf,
  register,
  release,
} from './stream-registry';

// Minimal mock of BrowserWindow with event emitter
function mockWindow(): BrowserWindow {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    once: (event: string, fn: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event]?.push(fn);
    },
    emit: (event: string) => {
      (listeners[event] || []).forEach((fn) => fn());
    },
  } as unknown as BrowserWindow;
}


describe('stream-registry', () => {
  it('allows concurrent searches that cancel independently', () => {
    const win = mockWindow();
    const cancel1 = vi.fn();
    const cancel2 = vi.fn();

    register(win, { requestId: 'req-1', kind: 'search', cancel: cancel1 });
    register(win, { requestId: 'req-2', kind: 'search', cancel: cancel2 });

    expect(countOf(win, 'search')).toBe(2);

    cancel(win, 'req-1');
    expect(cancel1).toHaveBeenCalledOnce();
    expect(cancel2).not.toHaveBeenCalled();
    expect(countOf(win, 'search')).toBe(1);

    cancel(win, 'req-2');
    expect(cancel2).toHaveBeenCalledOnce();
    expect(countOf(win, 'search')).toBe(0);
  });

  it('supersedes previous log stream when registering a new one', () => {
    const win = mockWindow();
    const cancelLog1 = vi.fn();
    const cancelLog2 = vi.fn();

    register(win, { requestId: 'log-1', kind: 'log', cancel: cancelLog1 });
    expect(countOf(win, 'log')).toBe(1);

    register(win, { requestId: 'log-2', kind: 'log', cancel: cancelLog2 });
    expect(cancelLog1).toHaveBeenCalledOnce();
    expect(cancelLog2).not.toHaveBeenCalled();
    expect(countOf(win, 'log')).toBe(1);
  });

  it('registering a search does not cancel a live log stream', () => {
    const win = mockWindow();
    const cancelLog = vi.fn();
    const cancelSearch = vi.fn();

    register(win, { requestId: 'log-1', kind: 'log', cancel: cancelLog });
    register(win, { requestId: 'search-1', kind: 'search', cancel: cancelSearch });

    expect(cancelLog).not.toHaveBeenCalled();
    expect(cancelSearch).not.toHaveBeenCalled();
    expect(countOf(win, 'log')).toBe(1);
    expect(countOf(win, 'search')).toBe(1);
  });

  it('cancelAll empties the map on window close', () => {
    const win = mockWindow();
    const cancelLog = vi.fn();
    const cancelSearch = vi.fn();

    register(win, { requestId: 'log-1', kind: 'log', cancel: cancelLog });
    register(win, { requestId: 'search-1', kind: 'search', cancel: cancelSearch });

    cancelAll(win);
    expect(cancelLog).toHaveBeenCalledOnce();
    expect(cancelSearch).toHaveBeenCalledOnce();
    expect(countOf(win, 'log')).toBe(0);
    expect(countOf(win, 'search')).toBe(0);
  });

  it('release decrements countOf without calling cancel', () => {
    const win = mockWindow();
    const cancelSearch = vi.fn();

    register(win, { requestId: 'search-1', kind: 'search', cancel: cancelSearch });
    expect(countOf(win, 'search')).toBe(1);

    release(win, 'search-1');
    expect(cancelSearch).not.toHaveBeenCalled();
    expect(countOf(win, 'search')).toBe(0);
  });
});
