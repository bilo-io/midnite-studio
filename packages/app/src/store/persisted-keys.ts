import type { PersistedUi } from './ui-store';

/**
 * The complete, annotated partition of every key `useUiStore` persists (Phase
 * 63 Theme C).
 *
 * A settings page fixes an orphaned preference once; nothing stops the next
 * one. So every key in `PersistedUi` is classified here as exactly one of:
 *
 * - `PREFERENCE_KEYS` — a user choice. Must be reachable from Settings (a
 *   control in some file under `features/settings/`), or listed in
 *   `KNOWN_ORPHANS` with a matching entry in `.midnite/tasks/outstanding.md`
 *   while it waits for one.
 * - `SESSION_STATE_KEYS` — position, selection, disclosure state, derived or
 *   runtime-corrected data. Must *not* be offered as a setting; a trailing
 *   comment on each entry gives the one-clause reason.
 *
 * The type assertion below makes the partition exhaustive: a key added to
 * `PersistedUi` and to neither array here is a typecheck failure at the
 * point of adding it, not a silently orphaned 78th (or Nth) key.
 * `persisted-keys.test.ts` adds the runtime half — every `PREFERENCE_KEYS`
 * entry outside `KNOWN_ORPHANS` must actually be named under
 * `features/settings/`.
 */
export const PREFERENCE_KEYS = [
  // Already registered — each has a control in an existing settings page.
  'activityTimeframe', // activity-timeline-settings.tsx
  'activityTimelineAreaLayout', // activity-timeline-settings.tsx
  'activityTimelineBarLayout', // activity-timeline-settings.tsx
  'activityTimelineGridlines', // activity-timeline-settings.tsx
  'activityTimelineOrientation', // activity-timeline-settings.tsx
  'activityTimelineStyle', // activity-timeline-settings.tsx
  'agentSkills', // agent-page.tsx
  'allowForceWithLease', // git-safety-page.tsx
  'allowSystemCacheClean', // optimizer-settings-page.tsx
  'allowTrashEmpty', // trash-safety-page.tsx
  'apiClientRequestTimeoutS', // api-client-page.tsx
  'autoFetchIntervalMs', // sidebar-page.tsx
  'blockedByFieldName', // projects-page.tsx
  'cycleDurationS', // screen-lock-page.tsx
  'disabledEcosystems', // optimizer-settings-page.tsx
  'forgeWritesEnabled', // reviews-page.tsx / git-safety-page.tsx
  'graphDensity', // density-picker.tsx (via graph-page.tsx)
  'graphTheme', // graph-theme-picker.tsx (via graph-page.tsx)
  'hiddenMetrics', // monitor-page.tsx
  'inactivityTimeoutS', // screen-lock-page.tsx
  'launchAndRunEnabled', // cli-page.tsx
  'linkTarget', // browser-page.tsx — the "Link handling" section (Phase 71 Theme A)
  'loopModifierDefaults', // agent-page.tsx — the Loops accordion
  'metricsIdleIntervalMs', // monitor-page.tsx
  'navMode', // sidebar-page.tsx
  'optimizerEnabled', // optimizer-settings-page.tsx
  'passcode', // screen-lock-page.tsx
  'passcodeOnlyWhenLocked', // screen-lock-page.tsx
  'primaryAgent', // agent-page.tsx
  'requirePasscode', // screen-lock-page.tsx
  'sectionFilters', // sidebar-page.tsx — the "View filters" accordion
  'systemCacheConsentGiven', // optimizer-settings-page.tsx
  'terminalFontFamily', // terminal-page.tsx
  'terminalFontSize', // terminal-page.tsx
  'terminalLineHeight', // terminal-page.tsx
  'terminalSidebarSide', // terminal-page.tsx
  'trashEmptyConsentGiven', // trash-safety-page.tsx
  'updateChannel', // updates-page.tsx
  'updatesAutoCheck', // updates-page.tsx
  'workflowDefaultTimeoutS', // workflows-page.tsx
  'workflowRunHistoryCap', // workflows-page.tsx

  // This phase's own four — the reason Phase 63 exists (`diff-page.tsx`).
  'diffLayout',
  'diffShowOldGutter',
  'commitFileView',
  'changesFileView',

  // Found orphaned by the same audit, not built here (Decision 6 — more than
  // three, record rather than build). See `KNOWN_ORPHANS` below and their
  // matching entries in `.midnite/tasks/outstanding.md`.
  'browserLayout',
  'loopAgents',
  'loopChoices',
  'loopModels',
  'loopSchedules',

  // Landed by Phase 64 (merged onto `main` while this phase was in flight —
  // #164) with no settings page of their own; that phase's Theme F only
  // covers the palette override selectors, not these five. Not this phase's
  // scope to build, but the partition has to account for `PersistedUi` as it
  // actually stands. See `KNOWN_ORPHANS` below and `outstanding.md`.
  'editorFontFamily',
  'editorFontSize',
  'editorMinimap',
  'editorTabSize',
  'editorWordWrap',

  // Phase 79 Theme A's five. The companion's Settings page is Theme H, a
  // later slice of the same phase, so these are recorded as orphans here
  // rather than pretending a control exists — see `KNOWN_ORPHANS` below and
  // `outstanding.md`. Building Theme H means *deleting* these five from that
  // list, not widening it.
  'companionEnabled',
  'companionHandsFree',
  'companionHonorific',
  'companionVoice',
  'companionMusicOffer',
] as const;

export const SESSION_STATE_KEYS = [
  'activityTimelineOpen', // whether a panel is currently showing
  'browserDetached', // runtime popout state, corrected from main's window registry
  'browserOpen', // whether a panel is currently showing
  'collapsedNavSections', // folded-section ids — disclosure state
  'collapsedRepoGroups', // folded-section ids — disclosure state
  'collapsedRepoSections', // folded-section ids — disclosure state
  'collapsedSettingsGroups', // folded-section ids — disclosure state
  'commitMetaOpen', // accordion/rail open state — disclosure state
  'councilConfigCollapsed', // accordion/rail open state — disclosure state
  'fabDetached', // runtime popout state, corrected from main's window registry
  'fabPanelOpen', // whether a panel is currently showing
  'fabSessions', // derived tab → live-session pairing, meaningless without terminals.json
  'graphColumns', // drag-resized pixel widths, clamped at runtime by useGraphColumns — a measurement, not a visibility choice
  'layout', // drag-resized pane pixel sizes — a measurement, not a visibility choice
  'onboardedAt', // one-way first-run lifecycle latch
  'activeEnvironmentByRepo', // last-selected API Client environment per repo, remembered like projectBoardByRepo
  'projectBoardByRepo', // last-viewed board per repo
  'projectViewByProject', // last-viewed view per project
  'projectsMode', // last-viewed mode per repo
  'repoGroupMembership', // user-created content, edited in the repos panel, not a setting
  'repoGroups', // user-created content, edited in the repos panel, not a setting
  'reposDetached', // runtime popout state, corrected from main's window registry
  'reposOpen', // whether a panel is currently showing
  'selectedRepoId', // current selection
  'selectedWorktreePath', // current selection
  'settingsPage', // current selection — which settings page is showing
  'showOnboarding', // one-way first-run lifecycle latch
  'terminalDetached', // runtime popout state, corrected from main's window registry
  'terminalListOpen', // whether a panel is currently showing
  'terminalMaximized', // transient "terminal fills the window" mode
  'terminalOpen', // whether a panel is currently showing
] as const;

/**
 * `PREFERENCE_KEYS` entries with no settings-page home yet — every one has a
 * matching entry in `.midnite/tasks/outstanding.md` naming the page it
 * belongs on. `persisted-keys.test.ts` excuses exactly these from the
 * "named under `features/settings/`" check — an allow-list that is easy to
 * add to is a broken invariant, so building one of these means *deleting*
 * its entry here, not widening the list for a new one.
 *
 * The first five are Phase 63's own find (Decision 6 — five exceeds the
 * three-key threshold for fixing in place instead of recording). The next
 * five are Phase 64's `editor*` preferences, orphaned by a sibling PR (#164)
 * that merged onto `main` mid-flight. The last five are Phase 79 Theme A's
 * `companion*` preferences, whose Settings page is that phase's own Theme H —
 * a deliberately later slice, so the switches exist before the surface that
 * flips them does.
 */
export const KNOWN_ORPHANS = [
  'browserLayout',
  'loopAgents',
  'loopChoices',
  'loopModels',
  'loopSchedules',
  'editorFontFamily',
  'editorFontSize',
  'editorMinimap',
  'editorTabSize',
  'editorWordWrap',
  'companionEnabled',
  'companionHandsFree',
  'companionHonorific',
  'companionVoice',
  'companionMusicOffer',
] as const satisfies readonly (typeof PREFERENCE_KEYS)[number][];

type PartitionedKey = (typeof PREFERENCE_KEYS)[number] | (typeof SESSION_STATE_KEYS)[number];

/**
 * Exhaustiveness, both directions: every `PersistedUi` key is listed above
 * exactly once, and nothing listed above names a key `PersistedUi` no longer
 * has. If this line fails to typecheck, either a persisted key was added
 * without being classified, or a classified key was renamed/removed out from
 * under this file — both are the drift Theme C exists to catch.
 */
type AssertExactPartition = [keyof PersistedUi] extends [PartitionedKey]
  ? [PartitionedKey] extends [keyof PersistedUi]
    ? true
    : never
  : never;
const _assertExactPartition: AssertExactPartition = true;
