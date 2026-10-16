import { LuClapperboard } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { VideoTab } from './video-tab';

/**
 * Media ▸ Video's renderer half (Phase 113 Theme Q). It never imports
 * media-core: the layout, explorer chrome and data hooks come through the frame's
 * `useMediaKit()`, which the app's `MediaShell` installs, and what differs per
 * app — the terminal, the embedded studio, the agent surfaces — comes through
 * {@link VideoHost}.
 */
export { mediaVideoManifest, type MediaVideoManifest } from '../manifest';
export {
  VIDEO_PANEL_TABS,
  VideoHostProvider,
  useVideoHost,
  type VideoChrome,
  type VideoEditThreadProps,
  type VideoHost,
  type VideoModalProps,
  type VideoPanelTab,
  type VideoSkillActionsProps,
  type VideoStudioViewProps,
  type VideoTerminalRequest,
  type VideoTreeSectionProps,
} from './host';
export { DEFAULT_VIDEO_CHROME, useVideoChrome } from './chrome';
export { pickInitialProject } from './last-project';
export { SETUP_EXAMPLE_PROJECT } from './video-tab';
export { VideoEnginePicker, VideoEngineSelect } from './video-engine-picker';
export { VideoProjectDetail } from './video-project-detail';
export { VideoStudioPane } from './video-studio-pane';
export { VideoFileList } from './video-file-list';
export { VideoRenderDialog } from './video-render-dialog';
export {
  useCancelVideoRender,
  useSetVideoEngine,
  useStartVideoRender,
  useVideoEngine,
  useVideoProject,
  useVideoProjects,
  useVideoRoot,
  useVideoRootResolution,
  useVideoToolchain,
  type VideoFileArea,
} from './use-video';

/** The Video tab, for an app's `MediaShell` registry. */
export const mediaVideoTab = {
  id: 'video',
  label: 'Video',
  icon: LuClapperboard,
  Component: VideoTab,
} as const satisfies MediaTabDescriptor;
