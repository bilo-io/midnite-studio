// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { reportManifest } from '@midnite/studio-feature-report/main';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { registerReport, reportMenuTemplate } from './report';

describe('Media report wiring', () => {
  it('registers exactly the report feature’s channels, the crash channel as a one-way send', () => {
    const handled = new Set<string>();
    const sent = new Set<string>();
    registerReport(
      { ipcMain: { handle: (c) => void handled.add(c), on: (c) => void sent.add(c) }, trashItem: async () => undefined, send: () => undefined },
      { sink: () => null, homeDir: () => '/h', bootLine: () => 'Midnite Media', openExternal: () => undefined, writeClipboard: () => undefined, revealPath: () => undefined },
    );
    expect([...handled].sort()).toEqual([...reportManifest.ipc].sort());
    expect([...sent]).toEqual([CHANNELS.reportError]);
  });

  it('puts Report an Issue… first in Help and sends reportOpen to the window', () => {
    const send = vi.fn();
    const help = reportMenuTemplate(send).find((item) => item.role === 'help');
    expect(help?.submenu?.[0]?.label).toBe('Report an Issue…');
    help?.submenu?.[0]?.click?.();
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.reportOpen, undefined);
  });
});
