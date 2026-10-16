import { usePlayer, type AudioHost } from '@midnite/studio-feature-media-audio/renderer';
import { lazy } from 'react';

import { PromptForm } from '../features/media/audio/prompt-form';
import { EditorExportBar } from '../features/media/music-editor/editor-export-bar';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the Audio feature's host port (Phase 113 Theme Q).
 *
 * The Suno-style prompt form is Studio's own (`features/media/audio/prompt-form.tsx`:
 * the ai-thread composer, provider picker and voice). The Editor sub-tab is the music editor,
 * still Studio's code — loaded lazily so Tone.js stays out of the Media chunk until it opens
 * (Phase 101). Which sub-tab a repository was last on stays in `ui-store`'s `audioTabByRepo`, so
 * no stored key moved.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`), not by `StudioProviders`,
 * for the same entry-chunk reason as the Docs host.
 */
const EditorTab = lazy(() =>
  import('../features/media/music-editor/editor-tab').then((m) => ({ default: m.EditorTab })),
);

function useAudioMode(repoId: string) {
  const mode = useUiStore((s) => s.audioTabByRepo[repoId]) ?? 'generator';
  const setAudioTab = useUiStore((s) => s.setAudioTab);
  return [mode, (next: 'editor' | 'generator') => setAudioTab(repoId, next)] as const;
}

export const STUDIO_AUDIO_HOST = {
  PromptForm,
  Editor: { Tab: EditorTab, ExportBar: EditorExportBar },
  useAudioMode,
} satisfies AudioHost;

// Leaving the Media view pauses playback; switching tabs within Media does not. The feature's
// player is a store with no notion of views, so the app that has views subscribes.
useUiStore.subscribe((state, prev) => {
  if (prev.activeView === 'media' && state.activeView !== 'media') usePlayer.getState().pause();
});
