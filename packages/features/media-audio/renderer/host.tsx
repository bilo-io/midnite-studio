import type { AudioEngineStatus, AudioProviderStatus, MusicSendToGeneratorResult } from '@midnite/studio-shared';
import { createContext, useContext, type ComponentType, type Dispatch, type ReactNode } from 'react';

import type { AudioMode } from './audio-sub-tabs';
import type { PromptFormAction, PromptFormState } from './prompt-form-state';
import type { PendingImport } from './use-audio';

/**
 * The Audio feature's host port (Phase 113 Theme Q) — what Audio needs from
 * the app that composes it, beyond the frame and the media kit.
 *
 * Studio's prompt form is built on its ai-thread composer, provider picker and
 * voice; Audio's second sub-tab, the music editor, is still Studio's own code
 * (Theme Q's later slice moves it); and which sub-tab a repository was last on
 * lives in Studio's `ui-store`. None of that may be imported by a feature, so
 * each is a seam: Studio's adapter is `packages/app/src/compose/media-audio-host.tsx`.
 * An app that leaves them out gets the feature's plain form, a Generator-only
 * tab and a mode held in memory.
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

export type AudioEditorTabProps = {
  repoId: string;
  project: string | null;
  /** A song an agent or a reveal asked to open; `seq` changes on every new request. */
  requested: { name: string; seq: number } | null;
};

export type AudioEditorExportBarProps = {
  repoId: string;
  project: string | null;
  defaultBitrate: number;
  onSent: (project: string, result: MusicSendToGeneratorResult) => void;
};

export type AudioHost = {
  /** The right pane's prompt form. Absent → the feature's plain form. */
  PromptForm?: ComponentType<AudioPromptFormProps>;
  /**
   * Audio's second sub-tab. Absent → no Editor | Generator switch at all. `Tab` may be a
   * `React.lazy` component (the feature wraps it in Suspense).
   */
  Editor?: {
    Tab: ComponentType<AudioEditorTabProps>;
    ExportBar: ComponentType<AudioEditorExportBarProps>;
  };
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
