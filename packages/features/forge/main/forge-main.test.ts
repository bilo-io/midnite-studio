// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { describe, expect, it } from 'vitest';

import { forgeManifest } from '../manifest';
import { ForgePoller } from './forge-poller';
import { forgeMain } from './index';

/** The main half registers what the manifest promises, and nothing else. */
describe('forgeMain.register', () => {
  it('registers exactly its manifest channels, and the poll sends only when a poller is given', () => {
    const bare = createRecordingContext();
    forgeMain.register(bare, { remotes: async () => null, syncGhAuthSwitch: () => true });
    expect([...bare.channels].sort()).toEqual([...forgeManifest.ipc].sort());

    const sends: string[] = [];
    const polled = createRecordingContext();
    const poller = new ForgePoller({
      now: () => 0,
      setInterval: () => 0,
      clearInterval: () => undefined,
      anyWindowVisible: () => false,
      idleState: () => 'active',
      resolveForge: async () => null,
      poll: async () => ({ ok: true, hash: '' }),
      broadcastChanged: () => undefined,
      broadcastSyncStatus: () => undefined,
      log: { info: () => undefined, error: () => undefined },
    });
    forgeMain.register(polled, {
      remotes: async () => null,
      syncGhAuthSwitch: () => true,
      poll: {
        poller,
        subscriptions: { sendFromSender: (channel) => void sends.push(channel), onWindowClosed: () => undefined, warn: () => undefined },
      },
    });
    expect(sends.sort()).toEqual([...forgeManifest.sends].sort());
  });

});
