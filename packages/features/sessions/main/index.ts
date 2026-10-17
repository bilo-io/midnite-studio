import { defineFeatureMain } from '@midnite/studio-runtime';

import { sessionsManifest } from '../manifest';
import { registerGuestSessions, type GuestSessionsServices } from './guest-sessions';

export { sessionsManifest, type SessionsManifest } from '../manifest';
export { guestSessionRecord, readHostSessions, type GuestSessionsServices } from './guest-sessions';

/**
 * The sessions feature's main half (Phase 113 Theme O slice 4) — for an app that owns no pty server:
 * the runtime host's sessions as a broker guest (`guest-sessions.ts`). Studio does not register it; its
 * terminal service owns these channel names, over its own broker.
 *
 * Call the returned `dispose` on quit — it detaches the guest (never shutting the host's broker down).
 */
let registered: { dispose(): Promise<void> } | null = null;

export const sessionsGuestMain = defineFeatureMain<GuestSessionsServices>({
  feature: sessionsManifest.feature,
  channels: sessionsManifest.ipc,
  register(ctx, services) {
    registered = registerGuestSessions(ctx, services);
  },
});

/** Quit: detach from the host's broker. Its sessions keep running — they were never this app's. */
export async function shutdownGuestSessions(): Promise<void> {
  const current = registered;
  registered = null;
  await current?.dispose();
}
