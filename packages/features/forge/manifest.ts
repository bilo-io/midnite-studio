import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The forge feature — Coder's forge layer (Phase 113 Theme O).
 *
 * **One package for three placement folders** (`forge`, `reviews`, `actions` —
 * `FEATURE_PACKAGE_FOLDERS.forge`): Reviews renders Actions' run detail in its
 * Checks tab, and both render the forge status vocabulary and the forge query
 * hooks. Split per folder, each would import another; see docs/APPS.md, "Coder".
 *
 * The main half is every forge provider (GitHub through `gh`, GitLab, Bitbucket
 * and Azure DevOps over HTTP), the account registry, the poller and their
 * handlers, moved out of `packages/desktop/src/main/forge`. **A forge token is
 * read only in main**, from the vault the composer hands over; the wire says
 * `hasToken`, never the value, and no channel here answers one.
 *
 * `settingsPages` is empty this slice: Settings ▸ Reviews and Settings ▸
 * Accounts live in the frame's Settings view over `ui-store`.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const forgeManifest = defineFeatureManifest({
  feature: 'forge',
  owner: 'coder',
  views: [
    {
      id: 'actions',
      global: false,
      rail: { group: 'git', label: 'Actions', description: 'CI workflow runs and their logs' },
    },
    {
      id: 'reviews',
      global: false,
      rail: { group: 'git', label: 'Reviews', description: 'Pull requests you opened, are asked to review, or all open' },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.forgeCliStatus,
    CHANNELS.forgeCommitRuns,
    CHANNELS.forgeRuns,
    CHANNELS.forgePulls,
    CHANNELS.forgePullDetail,
    CHANNELS.forgePullFiles,
    CHANNELS.forgePullComments,
    CHANNELS.forgePullThreads,
    CHANNELS.forgeReviewComment,
    CHANNELS.forgeReviewReply,
    CHANNELS.forgeResolveThread,
    CHANNELS.forgePullReview,
    CHANNELS.forgePullComment,
    CHANNELS.forgePullMerge,
    CHANNELS.forgePullRequestReview,
    CHANNELS.forgePullReady,
    CHANNELS.forgeRunRerun,
    CHANNELS.forgeIssues,
    CHANNELS.forgeIssueDetail,
    CHANNELS.forgeIssueComments,
    CHANNELS.forgeIssueComment,
    CHANNELS.forgeIssueSetState,
    CHANNELS.forgeRunDetail,
    CHANNELS.forgeRunLog,
    CHANNELS.forgeWorkflows,
    CHANNELS.forgeIssueCreate,
    CHANNELS.forgeIssueEdit,
    CHANNELS.forgeIssueDelete,
    CHANNELS.forgeIssuesLink,
    CHANNELS.forgeIssuesUnlink,
    CHANNELS.forgeAccounts,
    CHANNELS.forgeAccountAdd,
    CHANNELS.forgeAccountRemove,
    CHANNELS.forgeAccountSwitch,
    CHANNELS.forgeCapabilities,
    CHANNELS.forgeAccountReachableRepos,
    CHANNELS.forgeProjectList,
    CHANNELS.forgeProjectFields,
    CHANNELS.forgeProjectItems,
    CHANNELS.forgeProjectSetField,
    CHANNELS.forgeProjectAddItem,
    CHANNELS.forgeProjectClearField,
    CHANNELS.forgeProjectCreate,
    CHANNELS.forgeProjectEdit,
    CHANNELS.forgeProjectDelete,
    CHANNELS.forgeProjectAddDraftItem,
    CHANNELS.forgeProjectRemoveItem,
  ],
  /** One-way (`send`) channels: a window subscribes a forge listing for itself. */
  sends: [CHANNELS.forgeSubscribe, CHANNELS.forgeUnsubscribe],
  events: [EVENT_CHANNELS.forgeChanged, EVENT_CHANNELS.syncStatus],
  mcpTools: [],
});

export type ForgeManifest = typeof forgeManifest;
