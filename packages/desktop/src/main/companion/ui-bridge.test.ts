import { EVENT_CHANNELS } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureUiBridge, requestUiAction, resetUiBridgeForTests, resolveUiReply } from './ui-bridge';

/** A `BrowserWindow` stand-in narrow enough for this module's own use of it. */
function fakeWindow(): { win: BrowserWindow; sends: unknown[] } {
  const sends: unknown[] = [];
  const win = {
    isDestroyed: () => false,
    webContents: { send: (_channel: string, payload: unknown) => sends.push(payload) },
  } as unknown as BrowserWindow;
  return { win, sends };
}

afterEach(() => {
  resetUiBridgeForTests();
  vi.useRealTimers();
});

describe('requestUiAction', () => {
  it('answers refused with no main window registered at all', async () => {
    const result = await requestUiAction({ kind: 'state' });
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'Midnite Studio has no open window right now.',
    });
  });

  it('answers refused when every window is closed (macOS, dock icon still running)', async () => {
    configureUiBridge(() => null);
    const result = await requestUiAction({ kind: 'navigate', view: 'graph' });
    expect(result.ok).toBe(false);
  });

  it('answers refused when the registered window has been destroyed', async () => {
    const win = { isDestroyed: () => true, webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    configureUiBridge(() => win);
    const result = await requestUiAction({ kind: 'state' });
    expect(result.ok).toBe(false);
  });

  it('sends the request to the main window and resolves on a matching reply', async () => {
    const { win, sends } = fakeWindow();
    configureUiBridge(() => win);

    const pending = requestUiAction({ kind: 'command', id: 'sync.fetch' });
    expect(sends).toHaveLength(1);
    const sent = sends[0] as { id: string; action: unknown };
    expect(sent.action).toEqual({ kind: 'command', id: 'sync.fetch' });

    resolveUiReply(sent.id, { ok: true, value: { did: 'ran', label: 'Fetch' } });
    await expect(pending).resolves.toEqual({ ok: true, value: { did: 'ran', label: 'Fetch' } });
  });

  it('sends over the companionUiRequest event channel', () => {
    const { win, sends } = fakeWindow();
    const spy = vi.spyOn(win.webContents, 'send');
    configureUiBridge(() => win);
    void requestUiAction({ kind: 'state' });
    expect(spy).toHaveBeenCalledWith(EVENT_CHANNELS.companionUiRequest, expect.any(Object));
    expect(sends).toHaveLength(1);
  });

  it('a reply for an id nobody is waiting on is a no-op, not a throw', () => {
    expect(() => resolveUiReply('nothing-pending', { ok: true, value: { did: 'ran', label: 'x' } })).not.toThrow();
  });

  it('times out after 5s with an error kind, never a hang', async () => {
    vi.useFakeTimers();
    const { win } = fakeWindow();
    configureUiBridge(() => win);

    const pending = requestUiAction({ kind: 'state' });
    let settled: unknown;
    void pending.then((r) => {
      settled = r;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toEqual({ ok: false, kind: 'error', message: 'the window did not answer' });
  });

  it('a reply that arrives after the timeout is dropped, not double-resolved', async () => {
    vi.useFakeTimers();
    const { win, sends } = fakeWindow();
    configureUiBridge(() => win);

    const pending = requestUiAction({ kind: 'state' });
    const sent = sends[0] as { id: string };
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(pending).resolves.toMatchObject({ ok: false, kind: 'error' });

    // Arrives late — must not throw, and must not resolve anything twice.
    expect(() => resolveUiReply(sent.id, { ok: true, value: { did: 'ran', label: 'late' } })).not.toThrow();
  });
});
