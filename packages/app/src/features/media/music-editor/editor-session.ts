import { useSyncExternalStore } from 'react';

import type { MusicRegion, Song } from '@midnite/studio-shared';

/**
 * What the Editor tab currently holds, published for the Media toolbar above it (Phase 101 Themes
 * J/K). The toolbar lives in `audio-tab.tsx`, a sibling of the Editor, so the song and the loop
 * region cross through this tiny store instead of props — and the export plumbing stays
 * song-agnostic: whatever the editor publishes here is what gets exported.
 */
export type EditorSession = { song: Song | null; loopRegion: MusicRegion | null };

let session: EditorSession = { song: null, loopRegion: null };
const listeners = new Set<() => void>();

const set = (next: EditorSession): void => {
  session = next;
  for (const listener of listeners) listener();
};

export const publishEditorSong = (song: Song | null): void => set({ ...session, song });
export const publishLoopRegion = (loopRegion: MusicRegion | null): void => set({ ...session, loopRegion });
export const getEditorSession = (): EditorSession => session;

export function useEditorSession(): EditorSession {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getEditorSession,
    getEditorSession,
  );
}
