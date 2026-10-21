import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createRecordingContext, defineFeatureMain, sendToLiveWindow } from './index';

describe('createRecordingContext', () => {
  it('parses a payload through the channel schema before the handler sees it', async () => {
    const ctx = createRecordingContext();
    type Echo = { ok: boolean; doubled?: number; issue?: string };
    ctx.ipc.handle<z.ZodObject<{ n: z.ZodNumber }>, Echo>(
      'demo:echo',
      z.object({ n: z.number() }),
      (req) => ({ ok: true, doubled: req.n * 2 }),
      (issue) => ({ ok: false, issue }),
    );
    await expect(ctx.invoke('demo:echo', { n: 2 })).resolves.toEqual({ ok: true, doubled: 4 });
    await expect(ctx.invoke('demo:echo', { n: 'two' })).resolves.toMatchObject({ ok: false });
  });

  it('records channels, emits and trashed paths, and refuses a double registration', async () => {
    const ctx = createRecordingContext();
    ctx.ipc.handleBare('demo:bare', () => 1);
    expect(() => ctx.ipc.handleBare('demo:bare', () => 2)).toThrow(/twice/);
    ctx.emit('demo:event', { a: 1 });
    await ctx.trashItem('/tmp/x');
    expect(ctx.channels).toEqual(['demo:bare']);
    expect(ctx.emitted).toEqual([{ channel: 'demo:event', payload: { a: 1 } }]);
    expect(ctx.trashed).toEqual(['/tmp/x']);
    await expect(ctx.invoke('demo:missing')).rejects.toThrow(/no handler/);
  });
});

describe('defineFeatureMain', () => {
  it('registers exactly the channels a module declares', () => {
    const module = defineFeatureMain<{ value: number }>({
      feature: 'demo',
      channels: ['demo:a'],
      register: (ctx, services) => ctx.ipc.handleBare('demo:a', () => services.value),
    });
    const ctx = createRecordingContext();
    module.register(ctx, { value: 7 });
    expect(ctx.channels).toEqual(module.channels);
  });
});

describe('sendToLiveWindow', () => {
  const fakeWindow = (destroyed: boolean) => {
    const sent: unknown[][] = [];
    const win = { isDestroyed: () => destroyed, webContents: { send: (...args: unknown[]) => sent.push(args) } };
    return { win: win as unknown as Electron.BrowserWindow, sent };
  };

  it('sends to a live window', () => {
    const { win, sent } = fakeWindow(false);
    sendToLiveWindow(() => win, 'ch', 1);
    expect(sent).toEqual([['ch', 1]]);
  });

  it('drops the event when the window is gone or destroyed', () => {
    const { win, sent } = fakeWindow(true);
    sendToLiveWindow(() => win, 'ch', 1);
    sendToLiveWindow(() => null, 'ch', 1);
    expect(sent).toEqual([]);
  });
});
