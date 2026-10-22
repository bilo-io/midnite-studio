import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createReportBridge, type ReportBridgeSlice } from './bridge';
import { reportManifest } from './manifest';

function fakeSlice() {
  const invoked: Array<{ channel: string; req: unknown }> = [];
  const sent: Array<{ channel: string; req: unknown }> = [];
  const listeners = new Map<string, (payload: unknown) => void>();
  const slice: ReportBridgeSlice = {
    call: async <Req, Res>(channel: string, req?: Req) => {
      invoked.push({ channel, req });
      return undefined as Res;
    },
    send: (channel, req) => sent.push({ channel, req }),
    subscribe: <T,>(channel: string, handler: (payload: T) => void) => {
      listeners.set(channel, handler as (payload: unknown) => void);
      return () => listeners.delete(channel);
    },
  };
  return { slice, invoked, sent, listeners };
}

describe('createReportBridge', () => {
  it('reaches exactly the channels the main half registers', async () => {
    const { slice, invoked, sent } = fakeSlice();
    const report = createReportBridge(slice);
    report.error({ source: 'boundary', name: 'Error', message: 'boom', stack: '' } as never);
    await report.logPath();
    await report.bundle();
    await report.reveal();
    await report.submitIssue({ title: 't', body: 'b', kind: 'bug' });
    await report.ghStatus();
    await report.openUrl({ url: 'https://github.com/bilo-io/midnite-apps/issues/1' });
    await report.copy({ text: 'x' });

    expect(sent.map((s) => s.channel)).toEqual([...reportManifest.sends]);
    expect(invoked.map((i) => i.channel).sort()).toEqual([...reportManifest.ipc].sort());
    expect(invoked.find((i) => i.channel === CHANNELS.reportCopy)?.req).toEqual({ text: 'x' });
  });

  it('subscribes onOpen to the report:open event, and tears down', () => {
    const { slice, listeners } = fakeSlice();
    const handler = vi.fn();
    const off = createReportBridge(slice).onOpen?.(handler);
    listeners.get(EVENT_CHANNELS.reportOpen)?.(undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    off?.();
    expect(listeners.has(EVENT_CHANNELS.reportOpen)).toBe(false);
  });
});
