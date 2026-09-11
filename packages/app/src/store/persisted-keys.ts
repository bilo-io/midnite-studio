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
  'autoFetchEnabled', // sidebar-page.tsx
  'autoFetchIntervalMs', // sidebar-page.tsx
  'blockedByFieldName', // projects-page.tsx
  'browserDiscardMs', // browser-page.tsx
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
  'terminalDisposeAfterMs', // terminal-page.tsx
  'terminalFontFamily', // terminal-page.tsx
  'terminalFontSize', // terminal-page.tsx
  'terminalKeepRecentSessions', // terminal-page.tsx
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
  'loopEnabled', // fab-panel.tsx's own "Loop" switch — same block, same reason (Ad Hoc)

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

  'enabledApps', // apps-page.tsx
  'appDiscardIdle', // apps-page.tsx (Phase 84 Theme F.4)

  // Phase 79 Theme H's page. Registered orphans between Theme A (which added
  // the five preferences) and Theme H (which built the page) — and no longer
  // orphans: `KNOWN_ORPHANS` lost all five when `companion-page.tsx` landed,
  // which is what that list's own doc comment says building one of its entries
  // has to mean.
  'companionEnabled', // companion-page.tsx
  'companionHandsFree', // companion-page.tsx
  'companionHonorifics', // companion-page.tsx (Personality ▸ "What it calls you" pills, Ad Hoc)
  'companionNames', // companion-page.tsx (Personality ▸ the name pills, Phase 80 Theme D)
  'companionPersonality', // companion-page.tsx (Personality ▸ "About the companion", Ad Hoc)
  'companionAboutUser', // companion-page.tsx (Personality ▸ "About me", Ad Hoc)
  'companionVoices', // companion-page.tsx (Voice ▸ Local voice / Speaking voice, Ad Hoc)
  'companionSpeakAloud', // companion-page.tsx (Voice ▸ Speak replies aloud)
  'companionMusicOffer', // companion-page.tsx
  // Themes F and G's own two, added with the controls that read them rather
  // than ahead of them — so neither was ever an orphan.
  'companionVolume', // companion-page.tsx (Voice ▸ Companion volume)
  'companionMicMode', // companion-page.tsx (Microphone ▸ hold or tap)
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
  'favouriteRepoIds', // user-marked favourites, edited in the repos panel, not a setting
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
 * that merged onto `main` mid-flight.
 *
 * Phase 79 Theme A's five `companion*` preferences were here too, for exactly
 * one phase slice, and Theme H's `companion-page.tsx` removed them — the
 * intended lifecycle for an entry in this list, and the one worth naming: an
 * orphan is parked here with a named page and leaves when that page ships.
 * `enabledApps` (Phase 83 Theme A/B, resolved by Theme E's `apps-page.tsx`)
 * is the identical shape a third time.
 */
export const KNOWN_ORPHANS = [
  'browserLayout',
  'loopAgents',
  'loopChoices',
  'loopModels',
  'loopSchedules',
  'loopEnabled',
  'editorFontFamily',
  'editorFontSize',
  'editorMinimap',
  'editorTabSize',
  'editorWordWrap',
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
