import { emptySong, type Song } from '@midnite/studio-shared';
import { useEffect, useMemo, useState } from 'react';
import { LuFileUp, LuMusic, LuPlus, LuRedo2, LuUndo2, LuWand } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { Arrangement } from './arrangement';
import { useMusicEngine } from './engine/use-music-engine';
import { SNAP_DIVISIONS, gridTicks, quantizeNotes } from './model/song-edit';
import { PianoRoll } from './piano-roll';
import { TransportBar } from './transport-bar';
import { useSongDocument, type SaveState } from './use-song-document';

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  dirty: 'Unsaved',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

/**
 * Media ▸ Audio ▸ Editor (Phase 101). The project's real songs load and save through the music IPC
 * (`use-song-document`), the arrangement edits tracks, the piano roll edits notes, and every edit is
 * one undo step. Tone.js is never imported statically — `use-music-engine` loads it when the tab opens.
 *
 * Agent edits (Theme H's `music-changed` event) belong in `doc.applyExternal(song)`, which lands
 * them as a single undoable step; the event subscription lands with H (see outstanding.md).
 */
export function EditorTab({ repoId, project }: { repoId: string; project: string | null }) {
  const doc = useSongDocument(repoId, project);
  const blank = useMemo(() => emptySong(), []);
  const song: Song = doc.song ?? blank;
  const { engine, state } = useMusicEngine(song);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [division, setDivision] = useState<number>(16);
  const grid = division === 0 ? 0 : gridTicks(division);

  // Keep a valid active track as songs open and tracks come and go.
  useEffect(() => {
    if (!song.tracks.some((t) => t.id === activeTrack)) setActiveTrack(song.tracks[0]?.id ?? null);
  }, [song, activeTrack]);
  useEffect(() => setSelection(new Set()), [doc.name, activeTrack]);
  useEffect(() => {
    const count = song.tracks.find((t) => t.id === activeTrack)?.notes.length ?? 0;
    setSelection((cur) => (cur.size && [...cur].some((i) => i >= count) ? new Set([...cur].filter((i) => i < count)) : cur));
  }, [song, activeTrack]);

  if (!project) return <Empty>Pick or create an audio project to compose in.</Empty>;
  if (doc.status === 'loading') return <Empty>Loading songs…</Empty>;

  const togglePlay = () => (state === 'playing' ? engine?.pause() : void engine?.play());

  return (
    <div data-testid="music-editor" className="flex h-full min-h-0 flex-col">
      <TransportBar engine={engine} state={state} song={song} />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1 text-xs">
        <select
          aria-label="Song"
          value={doc.name ?? ''}
          disabled={doc.songs.length === 0}
          onChange={(e) => void doc.open(e.target.value)}
          className="h-6 rounded border border-border bg-background px-1.5 text-xs"
        >
          {doc.songs.length === 0 && <option value="">No songs</option>}
          {doc.songs.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <IconButton icon={LuPlus} label="New song" onClick={() => void doc.create()} />
        <IconButton icon={LuFileUp} label="Import .mid" onClick={() => void doc.importMidi()} />
        <span className="mx-1 h-4 w-px bg-border" />
        <IconButton icon={LuUndo2} label="Undo" disabled={!doc.canUndo} onClick={doc.undo} />
        <IconButton icon={LuRedo2} label="Redo" disabled={!doc.canRedo} onClick={doc.redo} />
        <span className="mx-1 h-4 w-px bg-border" />
        <label className="flex items-center gap-1 text-muted-foreground">
          Snap
          <select
            aria-label="Snap"
            value={division}
            onChange={(e) => setDivision(Number(e.target.value))}
            className="h-6 rounded border border-border bg-background px-1 text-xs text-foreground"
          >
            <option value={0}>Off</option>
            {SNAP_DIVISIONS.map((d) => (
              <option key={d} value={d}>
                1/{d}
              </option>
            ))}
          </select>
        </label>
        <IconButton
          icon={LuWand}
          label="Quantise (Q)"
          disabled={!activeTrack}
          onClick={() =>
            activeTrack &&
            doc.commit(quantizeNotes(song, activeTrack, selection.size ? selection : 'all', grid || gridTicks(16)))
          }
        />
        <span data-testid="song-save-state" className="ml-auto text-muted-foreground">
          {doc.error ?? SAVE_LABEL[doc.save]}
        </span>
      </div>
      {doc.status === 'ready' && doc.song ? (
        <>
          <div className="max-h-[42%] min-h-[96px] overflow-hidden">
            <Arrangement
              song={doc.song}
              activeTrack={activeTrack}
              onActiveTrack={setActiveTrack}
              onCommit={doc.commit}
              engine={engine}
            />
          </div>
          <PianoRoll
            song={doc.song}
            trackId={activeTrack}
            selection={selection}
            onSelection={setSelection}
            onCommit={doc.commit}
            grid={grid}
            engine={engine}
            onTogglePlay={togglePlay}
            onUndo={doc.undo}
            onRedo={doc.redo}
          />
        </>
      ) : (
        <Empty>
          {doc.status === 'error' ? (doc.error ?? 'This song could not be opened.') : 'This project has no songs yet.'}
          {doc.status === 'empty' && (
            <button
              type="button"
              onClick={() => void doc.create()}
              className="mt-3 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
            >
              New song
            </button>
          )}
        </Empty>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="music-editor-empty"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-xs text-muted-foreground"
    >
      <LuMusic className="h-6 w-6" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
