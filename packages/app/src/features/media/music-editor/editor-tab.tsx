import { MUSIC_PPQ, SongSchema, type Song } from '@midnite/studio-shared';
import { useMemo } from 'react';
import { LuMusic } from 'react-icons/lu';

import { useMusicEngine } from './engine/use-music-engine';
import { TransportBar } from './transport-bar';

/** A C-major scale, so the transport has something to play until Theme E loads a project's songs. */
const previewSong = (): Song =>
  SongSchema.parse({
    name: 'Preview',
    tracks: [
      {
        id: 'preview',
        name: 'Piano',
        notes: [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => ({
          pitch,
          startTick: i * (MUSIC_PPQ / 2),
          durationTicks: MUSIC_PPQ / 2,
          velocity: 90,
        })),
      },
    ],
  });

/**
 * Media ▸ Audio ▸ Editor (Phase 101). Theme A only lands the tab: the song
 * model (B), the Tone.js engine (C) and the piano roll (E) fill it in later.
 * Tone.js is never imported statically — `use-music-engine` loads it when the tab opens.
 */
export function EditorTab({ project }: { project: string | null }) {
  const song = useMemo(previewSong, []);
  const { engine, state } = useMusicEngine(song);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TransportBar engine={engine} state={state} song={song} />
      <div
        data-testid="music-editor-empty"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
          <LuMusic className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="text-sm font-medium text-foreground">Music editor</h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          Compose MIDI by hand or with an agent, in {project ? <b>{project}</b> : 'a project'}.
          Songs sit beside generated tracks and export as .mid, WAV and MP3.
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          The piano roll and playback are coming next.
        </p>
      </div>
    </div>
  );
}
