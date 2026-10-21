import { CHANNELS, handoffLink } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { createRecordingContext } from '../testing';
import { registerHandoffOpener, registerRunReceiver } from './handoff';

function setup(fail = false) {
  const ctx = createRecordingContext();
  const opened: string[] = [];
  registerHandoffOpener(ctx.ipc, {
    openExternal: async (url) => {
      if (fail) throw new Error('no handler for midnite://');
      opened.push(url);
    },
  });
  return { ctx, opened };
}

describe('registerHandoffOpener', () => {
  it('opens a midnite://open link for the launcher’s router', async () => {
    const { ctx, opened } = setup();
    const link = handoffLink({ app: 'studio', ref: { kind: 'session', id: 's1' } });
    expect(link.startsWith('midnite://open?app=studio&ref=')).toBe(true);
    expect(await ctx.invoke(CHANNELS.handoffOpen, { link })).toEqual({ ok: true });
    expect(opened).toEqual([link]);
  });

  it('never opens anything else — not a web page, not another scheme, not an unknown app', async () => {
    const { ctx, opened } = setup();
    for (const link of ['https://example.com', 'file:///etc/passwd', 'midnite-studio://view?id=graph', 'midnite://open?app=nope', 'midnite://run?app=coder']) {
      expect(await ctx.invoke(CHANNELS.handoffOpen, { link })).toEqual({ ok: false });
    }
    expect(opened).toEqual([]);
  });

  it('opens the link as parsed, never the string as sent — a dropped parameter stays dropped', async () => {
    const { ctx, opened } = setup();
    const link = 'midnite://open?app=agents&run=not%20base64!&extra=1&view=../../etc';
    expect(await ctx.invoke(CHANNELS.handoffOpen, { link })).toEqual({ ok: true });
    expect(opened).toEqual(['midnite://open?app=agents']);
  });

  it('answers ok:false when the OS cannot open it, rather than throwing over IPC', async () => {
    const { ctx } = setup(true);
    expect(await ctx.invoke(CHANNELS.handoffOpen, { link: handoffLink({ app: 'coder' }) })).toEqual({ ok: false });
  });
});

describe('registerRunReceiver', () => {
  const receiver = async (hostApp: () => string | null) => {
    const ctx = createRecordingContext();
    registerRunReceiver(ctx.ipc, { hostApp });
    return ctx.invoke(CHANNELS.handoffRunReceiver, undefined);
  };

  it('names Studio when the runtime host record does', async () => {
    expect(await receiver(() => 'studio')).toEqual({ receiver: 'studio' });
  });

  it('names nothing with no host record, another host, or an unreadable record', async () => {
    expect(await receiver(() => null)).toEqual({ receiver: null });
    expect(await receiver(() => 'monitor')).toEqual({ receiver: null });
    expect(
      await receiver(() => {
        throw new Error('EACCES');
      }),
    ).toEqual({ receiver: null });
  });
});
