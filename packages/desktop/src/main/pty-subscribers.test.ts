import { describe, expect, it, vi } from 'vitest';

import { subscribeWindowToPty, subscribersFor, unsubscribeWindowFromPty } from './pty-service';

/**
 * `pty-service.ts` needs a real `BrowserWindow` value (`BrowserWindow.fromId`)
 * for the per-ptyId subscriber registry (Phase 55), so it is faked the same
 * way `browser-service.test.ts` fakes `WebContentsView` — a minimal class
 * with an `id`, a `fromId` registry, `once`/`isDestroyed`.
 */
const { FakeBrowserWindow } = vi.hoisted(() => {
  const liveWindows = new Map<number, InstanceType<typeof FakeBrowserWindow>>();

  class FakeBrowserWindow {
    static nextId = 1;
    id: number;
    destroyed = false;
    closedHandlers: (() => void)[] = [];
    webContents = { send: vi.fn() };

    constructor() {
      this.id = FakeBrowserWindow.nextId++;
      liveWindows.set(this.id, this);
    }

    once(event: string, handler: () => void): void {
      if (event === 'closed') this.closedHandlers.push(handler);
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    /** Test-only: fires every registered 'closed' handler, as Electron would. */
    simulateClose(): void {
      this.destroyed = true;
      liveWindows.delete(this.id);
      for (const handler of this.closedHandlers) handler();
    }

    static fromId(id: number): InstanceType<typeof FakeBrowserWindow> | null {
      return liveWindows.get(id) ?? null;
    }
  }

  return { FakeBrowserWindow };
});

vi.mock('electron', () => ({ BrowserWindow: FakeBrowserWindow }));

describe('pty output subscriber registry (Phase 55)', () => {
  it('a subscribed window receives the ptyId in subscribersFor', () => {
    const win = new FakeBrowserWindow();
    subscribeWindowToPty('pty-1', win as unknown as import('electron').BrowserWindow);
    expect(subscribersFor('pty-1').map((w) => w.id)).toEqual([win.id]);
  });

  it('two windows subscribed to one ptyId both receive it', () => {
    const a = new FakeBrowserWindow();
    const b = new FakeBrowserWindow();
    subscribeWindowToPty('pty-2', a as unknown as import('electron').BrowserWindow);
    subscribeWindowToPty('pty-2', b as unknown as import('electron').BrowserWindow);
    expect(subscribersFor('pty-2').map((w) => w.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('an unsubscribed window receives none', () => {
    const win = new FakeBrowserWindow();
    subscribeWindowToPty('pty-3', win as unknown as import('electron').BrowserWindow);
    unsubscribeWindowFromPty('pty-3', win as unknown as import('electron').BrowserWindow);
    expect(subscribersFor('pty-3')).toEqual([]);
  });

  it('a window closing drops its subscription', () => {
    const win = new FakeBrowserWindow();
    subscribeWindowToPty('pty-4', win as unknown as import('electron').BrowserWindow);
    win.simulateClose();
    expect(subscribersFor('pty-4')).toEqual([]);
  });

  it('a ptyId nobody subscribed to has no subscribers', () => {
    expect(subscribersFor('never-subscribed')).toEqual([]);
  });
});
