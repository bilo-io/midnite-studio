import { LuAudioLines } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { AudioTab } from './audio-tab';

/**
 * Media ▸ Audio's renderer half (Phase 113 Theme Q). It never imports
 * media-core: the layout, explorer and data hooks come through the frame's
 * `useMediaKit()`, which the app's `MediaShell` installs, and what differs per
 * app comes through {@link AudioHost}.
 */
export { mediaAudioManifest, type MediaAudioManifest } from '../manifest';
export {
  AudioHostProvider,
  useAudioHost,
  type AudioEditorExportBarProps,
  type AudioEditorTabProps,
  type AudioHost,
  type AudioPromptFormProps,
} from './host';
export { BasicPromptForm } from './basic-prompt-form';
export { AudioSubTabs, type AudioMode } from './audio-sub-tabs';
export { DEFAULT_AUDIO_PROJECT, isSpaceTarget } from './audio-tab';
export { BottomPlayer } from './bottom-player';
export {
  createPlayerStore,
  currentTrack,
  usePlayer,
  type LoopMode,
  type PlayerTrack,
} from './player-store';
export {
  initialPromptForm,
  insertLyricSection,
  mergeTags,
  promptFormReducer,
  toPrompt,
  type PromptFormAction,
  type PromptFormState,
} from './prompt-form-state';
export {
  useAudioEngine,
  useAudioEngineInstall,
  useAudioImport,
  useAudioPrefs,
  useAudioProviders,
  useAudioSessions,
  useExpandPrompt,
  type AudioSessionView,
  type AudioVariant,
  type PendingImport,
} from './use-audio';
export { computeWaveform, formatDuration, type Waveform } from './waveform';

/** The Audio tab, for an app's `MediaShell` registry. */
export const mediaAudioTab = {
  id: 'audio',
  label: 'Audio',
  icon: LuAudioLines,
  Component: AudioTab,
} as const satisfies MediaTabDescriptor;
