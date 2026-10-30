import { apiClientMain } from '@midnite/studio-feature-api-client/main';
import { databaseMain } from '@midnite/studio-feature-database/main';
import { forgeMain } from '@midnite/studio-feature-forge/main';
import { reportMain } from '@midnite/studio-feature-report/main';
import { sessionsGuestMain } from '@midnite/studio-feature-sessions/main';
import { testsMain } from '@midnite/studio-feature-tests/main';
import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerCoderOn, type CoderElectron } from './context';
import { CODER_GIT_CHANNELS } from './git';
import type { CoderRepos } from './repos';

/** What the host hands the Coder module: the electron pieces, and a hook that receives what registering built. */
export type CoderModuleServices = {
  electron: CoderElectron;
  /** Called once the channels are registered, with the repository list and the quit hook. */
  onRegistered?: (registered: { repos: CoderRepos; shutdown: () => Promise<void> }) => void;
};

/** Every channel Coder registers beyond its features': its repository list, `remotes.list` and the agent-run hand-off. */
const CODER_OWN_CHANNELS = [
  CHANNELS.repoList,
  CHANNELS.repoPickDirectory,
  CHANNELS.repoOpen,
  CHANNELS.repoClose,
  CHANNELS.remotesList,
  CHANNELS.handoffOpen,
  CHANNELS.handoffRunReceiver,
] as const;

/**
 * The Coder module's main half (Phase 124 Theme E.3), on the same seam a feature uses so a host mounts it through
 * `mountModuleMains`: the report, forge, tests, API client and database features', the sessions guest's, the
 * read-only git graph and Coder's own repository list.
 */
export const coderModuleMain = defineFeatureMain<CoderModuleServices>({
  feature: 'coder',
  channels: [
    ...reportMain.channels,
    // `report.error` is a one-way channel: the feature's `channels` list only the invoke ones.
    CHANNELS.reportError,
    ...forgeMain.channels,
    ...testsMain.channels,
    ...apiClientMain.channels,
    ...databaseMain.channels,
    ...sessionsGuestMain.channels,
    ...CODER_GIT_CHANNELS,
    ...CODER_OWN_CHANNELS,
  ],
  register(ctx, { electron, onRegistered }) {
    const registered = registerCoderOn(ctx, electron);
    onRegistered?.(registered);
  },
});
