/**
 * media-core's renderer half (Phase 113 Theme Q): the Media shell and its tab
 * registry, the media kit, and the data hooks over the repo-scoped media
 * store. Needs the frame and its own {@link MediaHost} for the state each app
 * persists its own way.
 *
 * A composing app renders `<MediaShell tabs={…} />` with the descriptors it
 * wants, in strip order. A tab feature never imports this package — it
 * exports a `MediaTabDescriptor` and reaches the shell's plumbing through the
 * frame's `useMediaKit()`. The app's own tabs (Studio keeps seven in
 * `packages/app` for now) may import the pieces below directly.
 */
export { mediaCoreManifest, type MediaCoreManifest } from '../manifest';
export {
  MediaHostProvider,
  useMediaHost,
  type MediaHost,
  type MediaMenuItem,
  type MediaMenuProps,
  type MediaPaneSize,
  type MediaTooltipProps,
} from './host';
export { MediaShell } from './media-shell';
export { createStandaloneMediaHost, type StandaloneMediaState } from './standalone-host';
export { StandaloneAccordion, StandaloneMenu, StandaloneTooltip } from './standalone-chrome';
export { MediaTabStrip } from './media-tab-strip';
export { assertMediaTabs, MediaTabsProvider, useMediaTabDescriptor, useMediaTabs } from './registry';
export { mediaKit } from './kit';
export { MediaLayout, MediaPaneToggles, useOpenMediaPane, type MediaLayoutProps } from './media-layout';
export { MediaProjectsAccordion, type MediaSelection } from './media-projects-accordion';
export { NoRepoMediaState, RepoMediaTab } from './repo-media-tab';
export { ExportToolbar } from './export-toolbar';
export {
  exportDisabledReason,
  MEDIA_KEYS,
  revealMedia,
  useFfmpegStatus,
  useMediaChangedInvalidation,
  useMediaExport,
  useMediaFiles,
  useMediaFileText,
  useMediaMutations,
  useMediaProjects,
} from './use-media';
export { useMediaOpenFor, useMediaOpenRequest, type MediaOpenKind, type MediaOpenRequest } from './media-open-request';
