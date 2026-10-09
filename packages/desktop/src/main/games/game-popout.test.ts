import { describe, expect, it, vi } from 'vitest';

import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { createGamePopout } from './game-popout';

function fakeWindow() {
  const handlers = new Map<string, Array<() => void>>();
  return {
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
    emit(event: string) {
      for (const handler of handlers.get(event) ?? []) handler();
    },
    handlerCount: (event: string) => handlers.get(event)?.length ?? 0,
  };
}

function setup() {
  const win = fakeWindow();
  const runner = {
    reparent: vi.fn(),
    runState: vi.fn((gameId: string) => ({ gameId, runId: 'r1', state: 'running' as const })),
  };
  const send = vi.fn();
  const log = Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  const popout = createGamePopout({
    runner,
    openWindow: () => win as unknown as import('electron').BrowserWindow,
    send,
    log,
  });
  return { win, runner, send, popout };
}

describe('createGamePopout', () => {
  it('moves the game into the popout window and announces it', () => {
    const { win, runner, send, popout } = setup();
    expect(popout.popOut('ga').ok).toBe(true);
    expect(runner.reparent).toHaveBeenCalledWith('ga', win, { visible: true });
    expect(send).toHaveBeenLastCalledWith(EVENT_CHANNELS.gamesPopState, { gameId: 'ga' });
    expect(popout.popped()).toEqual({ gameId: 'ga', run: { gameId: 'ga', runId: 'r1', state: 'running' } });
  });

  it('docks the game back, hidden, when the popout window closes', () => {
    const { win, runner, send, popout } = setup();
    popout.popOut('ga');
    win.emit('close');
    expect(runner.reparent).toHaveBeenLastCalledWith('ga', null, { visible: false });
    expect(send).toHaveBeenLastCalledWith(EVENT_CHANNELS.gamesPopState, { gameId: null });
    expect(popout.popped()).toEqual({ gameId: null, run: null });
  });

  it('hosts one game at a time: popping a second docks the first into the main window', () => {
    const { win, runner, popout } = setup();
    popout.popOut('ga');
    popout.popOut('gb');
    expect(runner.reparent.mock.calls).toEqual([
      ['ga', win, { visible: true }],
      ['ga', null, { visible: false }],
      ['gb', win, { visible: true }],
    ]);
    expect(popout.popped().gameId).toBe('gb');
    // The same window is reused, so its close listener is bound once.
    expect(win.handlerCount('close')).toBe(1);
  });

  it('popping the already-popped game only re-announces (the window was focused)', () => {
    const { runner, send, popout } = setup();
    popout.popOut('ga');
    popout.popOut('ga');
    expect(runner.reparent).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('dock with nothing popped out is a no-op', () => {
    const { runner, send, popout } = setup();
    popout.dock();
    expect(runner.reparent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
