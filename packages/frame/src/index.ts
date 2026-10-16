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
export { noBridge, reportFailure } from './bridge-result';

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

// Small shared behaviour.
export { useFocusTrap } from './lib/use-focus-trap';
export { relativeAge } from './lib/relative-age';
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
export { FrameChromeProvider, useFrameChrome, type FrameChrome } from './chrome/chrome-port';
export type {
  BlastRadius,
  BlastRadiusKind,
  ConfirmRequest,
  FrameDialogs,
  FrameMenuItem,
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
  MediaProjectsAccordionProps,
  MediaSelection,
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
