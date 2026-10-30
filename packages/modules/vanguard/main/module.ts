import { vanguardMain, type VanguardMainServices } from '@midnite/studio-feature-vanguard/main';
import { sessionsGuestMain, type GuestSessionsServices } from '@midnite/studio-feature-sessions/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

/** What the host hands the Vanguard module: the feature's own services and the sessions guest's. */
export type VanguardModuleServices = {
  vanguard: VanguardMainServices;
  sessions: GuestSessionsServices;
};

/**
 * The Vanguard module's main half (Phase 124 Theme E.3), on the same seam a feature uses so a host mounts it
 * through `mountModuleMains` beside the modules it absorbed. It registers the vanguard feature's channels and
 * the sessions feature's guest channels — the runtime host's terminal sessions, attach-only.
 */
export const vanguardModuleMain = defineFeatureMain<VanguardModuleServices>({
  feature: 'vanguard',
  channels: [...vanguardMain.channels, ...sessionsGuestMain.channels],
  register(ctx, { vanguard, sessions }) {
    vanguardMain.register(ctx, vanguard);
    sessionsGuestMain.register(ctx, sessions);
  },
});
