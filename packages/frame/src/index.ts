/**
 * `@midnite/studio-frame` — the frame (Phase 113, `docs/APPS.md`): the
 * renderer chrome every app wears.
 *
 * Bridge-only, like the renderer it is part of: it reaches main through
 * `window.midniteStudio` and nothing else, and it never imports an app, a
 * feature or the runtime (`eslint.config.mjs` enforces all three). Features
 * build on it; apps compose it.
 *
 * What lives here is what has moved so far. Each piece left `packages/app` with
 * a one-line re-export at its old path, so the app's ~230 existing importers
 * did not move with it — new code imports from here.
 */

// Main-process access.
export { bridge, hasBridge } from './bridge';
export { appLogoUrl } from './shell/app-logo';

// The shared shell (Phase 123 Theme B) — what every suite app's window wears.
export { AppShell, type AppShellPanels, type AppShellProps } from './shell/app-shell';
export {
  SETTINGS_VIEW,
  displayChord,
  navChordFor,
  navConfigProblems,
  navViewForPath,
  pathForNavView,
  type NavConfig,
  type NavView,
  type ShellManifestFields,
  type ShellPanels,
} from './shell/nav-config';
export {
  APP_ACCENT_ACTIVE_CLASS,
  RailChordTooltip,
  createViewLink,
  type ViewLinkOptions,
  type ViewLinkTooltip,
} from './shell/view-link';
export { noBridge, reportFailure } from './bridge-result';

// Commands (Phase 123 Theme D) — the keybinding dispatcher and the command palette every suite app mounts.
export { chordFromEvent, isMac, type ChordEvent } from './commands/chord';
export type { CommandEntry, CommandRuntime } from './commands/command-runtime';
export { shouldEscapeTerminal, useKeybindings, type KeybindingGates } from './commands/use-keybindings';
export {
  chordOf,
  filterCommands,
  groupCommands,
  matchesQuery,
  parsePaletteQuery,
  usePaletteStore,
  type PaletteMode,
  type ParsedPaletteQuery,
} from './commands/palette/palette-store';
export { fuzzyMatch, fuzzyMatchPath, type FuzzyMatchResult } from './commands/palette/fuzzy-match';
export {
  MAX_FRECENCY_ENTRIES,
  bumpFrecency,
  evictLowestWeight,
  frecencyMultiplier,
  frecencyWeight,
  recencyDecay,
  useFrecencyStore,
  type FrecencyEntry,
  type FrecencyMap,
} from './commands/palette/frecency-store';
export {
  SOURCE_WEIGHTS,
  highlightMatches,
  scorePaletteItem,
  type PaletteItem,
  type PaletteSource,
  type PaletteSourceKey,
  type ScoredPaletteItem,
} from './commands/palette/source';
export {
  COMMAND_GROUP_LABELS,
  createCommandSource,
  type CommandSourceOptions,
} from './commands/palette/command-source';
export { CommandPalette, type CommandPaletteProps } from './commands/palette/palette';
export { PaletteHost, usePalette, type PaletteApi, type PaletteHostProps } from './commands/palette/palette-host';
export { CASCADE_MAX_STEPS, CASCADE_STEP_MS, cascadeStyle } from './lib/cascade';
export { usePageVisible } from './lib/use-page-visible';

// Prompt-injection banner (Phase 121 Theme A).
export { ConfinedBadge } from './security/confined-badge';
export { InjectionBanner } from './security/injection-banner';
export { useInjectionScans, type ScanItem } from './security/use-injection-scans';
export { ToolApprovalCard, ToolApprovalHost, useToolApprovalQueue } from './security/tool-approval-card';

// Notifications.
export { useToastStore, type Toast, type ToastAction, type ToastState, type ToastStatus } from './toast-store';

// Layout — the first pieces out of app.tsx.
export { CONTENT_BOX } from './layout/content-box';
export { NavLockToggle, type FrameNavMode } from './layout/nav-lock-toggle';
export { DelayedFallback } from './layout/delayed-fallback';
export { Spinner, WidgetLoader, type SpinnerMode, type SpinnerVariant } from './layout/spinner';
export { EmptyState, EmptyStateButton } from './layout/empty-state';
export { MARKDOWN_PROSE_CLASSES } from './layout/markdown-prose';
export { motionMs, REVEAL_MS } from './layout/motion';
export { ExplorerGroup, ExplorerNotice, ExplorerSearch } from './layout/explorer';
export { StateDot, type DotState } from './layout/state-dot';
export { TREE_INDENT } from './layout/tree-indent';
export { LoadingRegion, Skeleton, Spinner as RingSpinner } from './layout/skeleton';
export { SortableList, useSortableRow } from './layout/sortable-list';
export {
  clampSize,
  useResizable,
  type Resizable,
  type ResizeAxis,
  type SnapIntent,
  type UseResizableOptions,
} from './layout/resizable/use-resizable';
export { ResizeHandle } from './layout/resizable/resize-handle';

// Graph geometry — the pan/zoom and edge-path maths a node canvas draws with (the project graph reuses it).
export {
  WORKFLOW_CULL_MARGIN,
  WORKFLOW_DEFAULT_VIEWPORT,
  WORKFLOW_GRID_STEP,
  WORKFLOW_NODE_GEOMETRY,
  WORKFLOW_UNDO_LIMIT,
  WORKFLOW_ZOOM_BOUNDS,
  type Viewport,
} from './graph/workflow-geometry';
export {
  clientToGraph,
  dragDeltaToGraph,
  edgePath,
  inPort,
  nodeBounds,
  outPort,
  panBy,
  rectsIntersect,
  snapToGrid,
  viewportRect,
  zoomAtPointer,
  type Rect,
} from './graph/workflow-path';

// Metrics — the status bar's monitor segment and the charts it draws with.
export { formatBytes, formatUsage } from './metrics/format-bytes';
export {
  appendSample,
  METRICS_LONG_MAX_POINTS,
  METRICS_LONG_WINDOW_MS,
  METRICS_MAX_POINTS,
  METRICS_WINDOW_MS,
  useMetricsStore,
  type MetricPoint,
  type MetricSeries,
  type MetricsState,
} from './metrics/metrics-store';
export {
  CHART_GEOMETRY,
  DONUT_GEOMETRY,
  GAUGE_GEOMETRY,
  isLevelMetric,
  SPARKLINE_GEOMETRY,
  TIMELINE_METRICS,
  WIDE_CHART_GEOMETRY,
  type MetricGeometry,
} from './metrics/metric-geometry';
export { areaPath, cadenceBreaks, linePath, ringGeometry, xFor, yFor } from './metrics/metric-path';
export {
  diskUsageHsl,
  METRIC_LABELS,
  metricColor,
  metricFill,
  metricGlow,
  metricHsl,
  metricMuted,
} from './metrics/metric-palette';
export { METRIC_ICONS } from './metrics/metric-icons';
export { ChartLegend, MetricChart, type ChartSeries } from './metrics/metric-chart';
export { useMetricsStream } from './metrics/use-metrics-stream';

// Panels — the navigation stack a pane steps through, and its header.
export { PanelStack } from './panel-stack/panel-stack';
export { PanelHeader } from './panel-stack/panel-header';
export {
  activePanelBack,
  activePanelForward,
  useRegisterActivePanel,
} from './panel-stack/active-panel';
export {
  backHistoryState,
  DEFAULT_MAX_DEPTH,
  forwardHistoryState,
  pushHistoryState,
  replaceHistoryState,
  usePanelHistory,
  type PanelHistory,
  type PanelHistoryOptions,
  type PanelHistoryState,
} from './panel-stack/use-panel-history';

// Agents — the roster's install probe and the predicate every agent dropdown greys a row against.
export {
  ensureAgentProbeSubscription,
  recheckAgents,
  resetAgentProbeStore,
  useAgentProbeStore,
} from './agents/agent-probe-store';
export { agentInstallHint, isAgentUnconfigured } from './agents/agent-install-status';
export {
  AGENT_COMMAND_GROUPS,
  AGENT_COMMANDS,
  DEFAULT_AGENT_SKILLS,
  type AgentCommand,
  type AgentCommandCategory,
  type AgentCommandGroup,
} from './agents/agent-commands';

// Activity — the status-to-colour seam and the glow resolver every live-session surface reads.
export { activityStatusVar } from './activity/activity-status-color';
export {
  resolveActivityGlow,
  useActivityGlow,
  type ActivityGlow,
  type ActivityGlowBadge,
  type ActivityGlowInput,
  type ActivityGlowSessionInput,
} from './activity/use-activity-glow';
export {
  findAnyCardSession,
  findCardSession,
  resolveSessionAgentId,
  sessionPhase,
  type ConnectionState,
  type SessionPhase,
} from './activity/session-phase';

// Small shared behaviour.
export { isEditableTarget, useEditableFocus } from './lib/use-editable-focus';
export { useFocusTrap } from './lib/use-focus-trap';
export { relativeAge, relativeAgeFromIso } from './lib/relative-age';
export { formatNumber } from './lib/format-number';
export { MODE_TINT, nextRandomIndex, WORD_SETS, type Mode } from './lib/words';
export { useFlushableSave } from './lib/use-flushable-save';
export { useWindowFocusGate } from './lib/use-window-focus-gate';
export {
  EXPAND_ALL_LIMIT,
  expandAll,
  NOTHING_EXPANDED,
  toggleExpanded,
  withheldByCap,
  type ExpansionState,
} from './lib/expansion';

export { adoptRenamedPersistKey } from './lib/persist-rename';

// Moved with the git graph (Phase 113 Theme O) — pure, so they left packages/app outright.
export {
  __resetAvatars,
  avatarFor,
  emailHash,
  gravatarUrl,
  hueFor,
  initialsFor,
  markAvatarMissing,
  normaliseEmail,
  subscribeAvatars,
  type AvatarState,
} from './lib/avatars';
export { __resetPerfMarks, markOnce } from './lib/perf';
export { languageForFile, previewKindForFile, type PreviewKind } from './lib/languages';
export { isReducedMotion } from './lib/reduced-motion';
export { useWindowFocused } from './lib/use-window-focus';
export { StatPill } from './layout/stat-pill';

// Review-thread anchoring on a diff — pure, shared by every app that draws a pull request's diff.
export {
  isAnchored,
  isCommentableLine,
  leftSideLines,
  positionForLine,
  rightSideLines,
  threadsForFile,
  type ThreadsByLine,
} from './diff/comment-anchors';

// Form controls.
export { SelectField } from './form/select-field';
export { Choice, Field, TextArea, TextField } from './form/field';
export { FilterInput, type FilterInputProps } from './form/filter-input';
export { SettingsSwitchRow } from './form/settings-switch-row';
export { RadioRow, SwitchRow, SwitchTrack } from './form/toggle-rows';

// Settings scaffolding — the frame owns the Settings view; apps contribute pages.
export { SettingsAccordion } from './settings/settings-section';
export { SETTINGS_SECTIONS, settingsSectionId, type SettingsSection } from './settings/settings-sections';

// The chrome port — chrome still implemented in packages/app, reached through context.
export { FrameChromeProvider, useFrameChrome, useOptionalFrameChrome, type FrameChrome } from './chrome/chrome-port';
export { FrameModal } from './chrome/frame-modal';
export type {
  BlastRadius,
  BlastRadiusKind,
  ConfirmRequest,
  FrameDialogs,
  FrameMenuEntry,
  FrameMenuItem,
  FrameModalProps,
  FramePromptRequest,
  IconButtonProps,
  IconComponent,
} from './chrome/types';

// Media — the tab-registry contract and the kit port media tabs compose (Phase 113 Theme Q).
export { mediaPanelId, mediaTabId, type MediaTabDescriptor } from './media/media-tab';
export { MediaKitProvider, useMediaKit, type MediaKit, type MediaQueryKeys } from './media/media-kit';
export type {
  ExportToolbarProps,
  MediaAccordionProps,
  MediaAccordionSection,
  MediaExporter,
  MediaLayoutProps,
  MediaMutation,
  MediaMutations,
  MediaOpenKind,
  MediaOpenRequest,
  MediaPane,
  MediaPaneTogglesProps,
  MediaProjectsAccordionProps,
  MediaSelection,
  MediaTooltipProps,
} from './media/media-kit-types';
export { MEDIA_PROMPT_BOX, MEDIA_PROMPT_CONTROL, PromptTextarea } from './media/prompt-input';
export {
  MEDIA_PANEL_BODY,
  MEDIA_PANEL_FOOTER,
  MEDIA_PANEL_ROOT,
  MediaPanelBody,
  MediaPanelFooter,
  MediaPanelLayout,
} from './media/media-panel-layout';

// The suite app kit — what an extracted app composes instead of writing its own chrome.
export * from './kit';

// Knowledge - the host port, the query keys and the cheap existence check. The view itself (sigma,
// graphology) is its own entry, `@midnite/studio-frame/knowledge`, so it stays out of every entry chunk.
export {
  KnowledgeHostProvider,
  useKnowledgeHost,
  type KnowledgeCorpus,
  type KnowledgeHost,
  type KnowledgePopoverProps,
  type KnowledgeSettings,
  type KnowledgeSourcePreviewProps,
} from './knowledge/knowledge-host';
export { knowledgeKeys } from './knowledge/knowledge-query-keys';
export { useKnowledgeGraphExists } from './knowledge/use-knowledge-graph';
export {
  DEFAULT_KNOWLEDGE_DETAIL,
  DEFAULT_KNOWLEDGE_LAYOUT,
  DEFAULT_KNOWLEDGE_VARIANT,
  useKnowledgeFiltersStore,
} from './knowledge/knowledge-filters-store';
export {
  buildScene3D,
  buildThreeClusterPreviewPayload,
  computeCurvedEdge2D,
  formatSynapseScore,
  formatTelemetryNodeMetric,
  KNOWLEDGE_STYLE_IDS,
  KNOWLEDGE_STYLE_META,
  projectScenePoint,
  SYNAPSE_CLUSTER_PALETTE,
  TELEMETRY_CLUSTER_PALETTE,
  type KnowledgeStyleId,
  type KnowledgeStyleMeta,
  type Scene3D,
} from './knowledge/knowledge-3d-scene';
export { KnowledgeStylePicker } from './knowledge/knowledge-style-picker';
export { TAB_GROUP_COLORS as KNOWLEDGE_TAB_GROUP_COLORS } from './knowledge/knowledge-community-colors';
export { SimplePopover } from './knowledge/simple-popover';

// The git graph and the diff (Phase 113 Theme O) - the host port, the persisted state shapes and their
// defaults, and the graph store other surfaces read. The views are their own entries,
// `@midnite/studio-frame/graph` and `@midnite/studio-frame/diff`.
export {
  GitHostProvider,
  resolveGitHost,
  useGitHost,
  type GitCascadeReveal,
  type GitDismissOptions,
  type GitGraphActions,
  type GitHost,
  type GitHostComponents,
  type GitMultiSelectOption,
  type GitMultiSelectProps,
  type GitPanelBounds,
  type GitPoint,
  type GitQuery,
  type GitQueryKeys,
  type GitTooltipProps,
  type GitUserAvatarProps,
  type HighlightToken,
  type ResolvedGitHost,
} from './graph/git-host';
export {
  DEFAULT_GRAPH_COLUMNS,
  GRAPH_COLUMN_BOUNDS,
  type DiffLayout,
  type GitUiState,
  type GraphColumns,
  type GraphSelection,
} from './graph/graph-ui-state';
export {
  DEFAULT_GRAPH_COLUMN_VISIBILITY,
  normalizeColumnVisibility,
  withColumnVisible,
  type GraphColumnVisibility,
} from './graph/column-visibility';
export {
  DEFAULT_GRAPH_DENSITY,
  DEFAULT_GRAPH_THEME,
  type GraphDensity,
  type GraphThemeId,
} from './graph/graph-themes';
export { DEFAULT_PROVENANCE_MARK_MODE, type ProvenanceMarkMode } from './graph/provenance-display';
export { useGraphStore } from './graph/graph-store';
export type { ActiveAgentWorktreeSession } from './graph/agent-session';
export type { DragPayload, DropEvent } from './graph/graph-dnd';
export type { SyncAction } from './graph/ref-sync';

// Shared 3D audio visualizer and player.
export {
  compute3DShapeVertex,
  computeGlowTier,
  EpicAudioPlayer,
  EpicAudioVisualizerCanvas,
  formatAudioTime,
  getShapeRadiusMultiplier,
  PARTICLE_COUNT_3D,
  project3D,
  rotate3D,
  SHAPE_NAMES,
  SPECTRUM_NAMES,
  type EpicAudioPlayerProps,
  type EpicAudioVisualizerCanvasProps,
  type ProjectedPoint,
  type ShapeKind,
  type Vec3,
} from './audio/epic-audio-player';
