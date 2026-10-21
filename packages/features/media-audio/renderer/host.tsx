import type {
  AudioEngineStatus,
  AudioProviderStatus,
  Song,
  SongChatChange,
} from '@midnite/studio-shared';
import { createContext, useContext, type ComponentType, type Dispatch, type ReactNode } from 'react';

import type { AudioMode } from './audio-sub-tabs';
import type { PromptFormAction, PromptFormState } from './prompt-form-state';
import type { PendingImport } from './use-audio';

/**
 * The Audio feature's host port (Phase 113 Theme Q) — what Audio needs from
 * the app that composes it, beyond the frame and the media kit.
 *
 * Studio's prompt form is built on its ai-thread composer, provider picker and
 * voice; the music editor's agent chat is built on Studio's chat pieces and its
 * agent engines; the instrument picker's popover portals and clamps to
 * Studio's content area; and which sub-tab a repository was last on lives in
 * Studio's `ui-store`. None of that may be imported by a feature, so each is a
 * seam: Studio's adapter is `packages/app/src/compose/media-audio-host.tsx`.
 * An app that leaves them out gets the feature's plain form, an editor with no
 * chat button, the frame's simple popover and a mode held in memory. The editor
 * itself (Audio's second sub-tab) is the feature's own.
 */
export type AudioPromptFormProps = {
  state: PromptFormState;
  dispatch: Dispatch<PromptFormAction>;
  statuses: readonly AudioProviderStatus[];
  engine: AudioEngineStatus | null | undefined;
  importing: boolean;
  generating: boolean;
  progress: PendingImport | null;
  error: string | null;
  onImport: () => void;
  onGenerate: () => void;
  onCancel: () => void;
};

/** What the editor hands its agent chat — the song as it stands, a flush of pending edits, and a way to select what a reply touched. */
export type AudioSongChatProps = {
  repoId: string;
  project: string | null;
  name: string | null;
  getSong: () => Song | null;
  flush: () => Promise<void>;
  onShowChange: (change: SongChatChange) => void;
};

/** The click-toggled panel the instrument picker opens (Studio's `Popover`, which portals and clamps). */
export type AudioPopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  triggerClassName?: string;
};

export type AudioHost = {
  /** The right pane's prompt form. Absent → the feature's plain form. */
  PromptForm?: ComponentType<AudioPromptFormProps>;
  /** The song's agent chat beside the editor. Absent → no chat button (Creator has no agents). */
  SongChat?: ComponentType<AudioSongChatProps>;
  /** The instrument picker's popover. Absent → the frame's simple one. */
  Popover?: ComponentType<AudioPopoverProps>;
  /** Which sub-tab a repository is on, remembered by the app. A hook. Absent → held in memory. */
  useAudioMode?: (repoId: string) => readonly [AudioMode, (mode: AudioMode) => void];
};

const AudioHostContext = createContext<AudioHost | null>(null);

export function AudioHostProvider({ host, children }: { host: AudioHost; children: ReactNode }) {
  return <AudioHostContext.Provider value={host}>{children}</AudioHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the prompt form could not be chosen. */
export function useAudioHost(): AudioHost {
  const host = useContext(AudioHostContext);
  if (!host) throw new Error('The Audio tab must be rendered inside <AudioHostProvider>');
  return host;
}
