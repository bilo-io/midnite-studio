import { defineFeatureMain } from '@midnite/studio-runtime';

import { forgeManifest } from '../manifest';
import type { ForgePoller } from './forge-poller';
import { registerForgeAccountHandlers } from './handlers/forge-account-handlers';
import { registerForgeHandlers } from './handlers/forge-handlers';
import { registerForgePollHandlers, type ForgePollSubscriptions } from './handlers/forge-poll-handlers';
import { registerForgeProjectHandlers } from './handlers/forge-project-handlers';
import { configureForgeFetch, type ForgeFetch } from './http';
import { configureRepoRemotes, type RepoRemotesResolver } from './repo-forge';

export { forgeManifest, type ForgeManifest } from '../manifest';
export type { ForgeAdapter } from './adapter';
export { createForgeAccountVault, forgeAccountVaultPath, nullForgeAccountVault, type ForgeAccountVault } from './forge-account-vault';
export { createForgeAccountsStore, nullForgeAccountsStore, withVaultForgeAccounts, type ForgeAccountsStore } from './forge-accounts-store';
export {
  activeAccountFor,
  addForgeAccount,
  configureForgeAccounts,
  getActiveAccount,
  listForgeAccounts,
  removeForgeAccount,
  switchActiveForgeAccount,
  __resetForgeAccountsForTests,
} from './forge-accounts';
export {
  createForgePoller,
  FORGE_POLL_MS,
  ForgePoller,
  type ForgePollerLogger,
  type ForgePollerWindows,
} from './forge-poller';
export { type ForgePollSubscriptions } from './handlers/forge-poll-handlers';
export { gitConfigPath, readGitConfigRemotes, remotesFromGitConfig } from './git-config-remotes';
export { listPulls, listRuns } from './github/gh-cli';
// Studio hands both to the report feature, so the dialog and the forge share one gh probe cache.
export { ghStatus, runInShell } from './github/gh-shell';
export { configureGitlabLanguageCache, createGitlabLanguageCacheStore } from './gitlab/gitlab-languages';
export { configureForgeFetch, type ForgeFetch } from './http';
export {
  commitRuns,
  configureRepoRemotes,
  forgeFromRemotes,
  noForgeStatus,
  repoForge,
  resolveAdapter,
  type RepoRemotesResolver,
} from './repo-forge';
export { githubWhoami } from './whoami';

/**
 * The forge feature's main half (Phase 113 Theme O) — every forge provider,
 * the account registry, the poller and their IPC, moved out of
 * `packages/desktop/src/main/forge` and `ipc/forge-*-handlers.ts`.
 *
 * What only the composer knows arrives here:
 *
 * - **`remotes`** — a repository's remotes from a `repoId`. Studio asks git
 *   over its repo registry; Coder reads `.git/config` read-only
 *   ({@link readGitConfigRemotes}) over its own list. The renderer never names
 *   a forge, an owner or a path.
 * - **`syncGhAuthSwitch`** — Studio's `forge.syncGhAuthSwitch` setting.
 * - **`fetch`** — the HTTP transport for GitLab, Bitbucket, Azure and token
 *   validation. Optional; the default is the global `fetch`.
 * - **`poll`** — the poller and the sender-aware `send` its two channels need.
 *   Optional: an app that leaves it out has no background refresh, and its
 *   views refetch on their own staleness.
 *
 * **Forge tokens never leave main.** The account registry reads them from the
 * vault the composer handed {@link configureForgeAccounts} — the runtime vault
 * as that app, so Coder's reads go through its grants — and the wire says
 * `hasToken` and nothing else.
 */
export type ForgeMainServices = {
  remotes: RepoRemotesResolver;
  syncGhAuthSwitch: () => boolean;
  fetch?: ForgeFetch;
  poll?: { poller: ForgePoller; subscriptions: ForgePollSubscriptions };
};

export const forgeMain = defineFeatureMain<ForgeMainServices>({
  feature: forgeManifest.feature,
  channels: forgeManifest.ipc,
  register(ctx, services) {
    configureRepoRemotes(services.remotes);
    if (services.fetch) configureForgeFetch(services.fetch);
    registerForgeHandlers(ctx.ipc);
    registerForgeProjectHandlers(ctx.ipc);
    registerForgeAccountHandlers(ctx.ipc, { syncGhAuthSwitch: services.syncGhAuthSwitch });
    if (services.poll) registerForgePollHandlers(services.poll.poller, services.poll.subscriptions);
  },
});
