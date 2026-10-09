import { basename, extname } from 'node:path';

import {
  MEDIA_LARGE_FILE_BYTES,
  MUSIC_MAX_MIDI_BYTES,
  MUSIC_MIDI_EXT,
  MUSIC_RESERVED_NAMES,
  SongNameSchema,
  SongSchema,
  failure,
  musicMidiPath,
  musicSidecarPath,
  ok,
  type GitOpResult,
  type MediaFileEntry,
  type MusicSongEntry,
  type Song,
} from '@midnite/studio-shared';

import { midiToSong, songToMidi } from './midi-io';

/**
 * Phase 101 Theme B — songs in an Audio project. A song `<name>` is `<name>.mid` (the interchange
 * file, always written) plus `<name>.song.json` (the editor's full state). Reading prefers the
 * sidecar and falls back to importing the `.mid`, so a bare `.mid` dropped into the folder opens.
 * Everything goes through the media store's jail; nothing throws across IPC.
 */
type Scope = { repoId: string; tab: 'audio'; project: string };

export type MusicServiceDeps<W = unknown> = {
  listFiles: (scope: Scope) => Promise<GitOpResult<MediaFileEntry[]>>;
  readFile: (req: Scope & { path: string; encoding: 'utf8' | 'base64' }) => Promise<GitOpResult<string>>;
  writeBytes: (req: Scope & { path: string; data: Buffer }) => Promise<GitOpResult<{ size: number; largeFile: boolean }>>;
  removeFile: (req: Scope & { path: string }) => Promise<GitOpResult>;
  /** Absolute paths from a native open dialog; `null` when cancelled. */
  pickFiles: (window?: W) => Promise<string[] | null>;
  readLocal: (absPath: string) => Promise<Buffer>;
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `"My Song (v2).MID"` → a legal song name. */
export function songNameFromFile(file: string): string {
  const base = basename(file, extname(file))
    .replace(/[/\\\0]/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  const name = base || 'song';
  return (MUSIC_RESERVED_NAMES as readonly string[]).includes(name.toLowerCase()) ? `${name}-song` : name;
}

export function createMusicService<W = unknown>(deps: MusicServiceDeps<W>) {
  const scopeOf = (repoId: string, project: string): Scope => ({ repoId, tab: 'audio', project });

  async function list(repoId: string, project: string): Promise<GitOpResult<MusicSongEntry[]>> {
    const listed = await deps.listFiles(scopeOf(repoId, project));
    if (!listed.ok) {
      // A project that does not exist yet simply has no songs.
      return ok<MusicSongEntry[]>([]);
    }
    const files = listed.value;
    const sidecars = new Set(files.map((f) => f.path));
    const songs: MusicSongEntry[] = [];
    for (const file of files) {
      if (file.path.includes('/') || !file.path.endsWith(MUSIC_MIDI_EXT)) continue;
      const name = file.path.slice(0, -MUSIC_MIDI_EXT.length);
      if (!SongNameSchema.safeParse(name).success) continue;
      songs.push({
        name,
        path: file.path,
        hasSidecar: sidecars.has(musicSidecarPath(name)),
        size: file.size,
        mtimeMs: file.mtimeMs,
      });
    }
    songs.sort((a, b) => a.name.localeCompare(b.name));
    return ok(songs);
  }

  async function read(repoId: string, project: string, name: string): Promise<GitOpResult<Song>> {
    const scope = scopeOf(repoId, project);
    const sidecar = await deps.readFile({ ...scope, path: musicSidecarPath(name), encoding: 'utf8' });
    if (sidecar.ok) {
      try {
        const parsed = SongSchema.safeParse(JSON.parse(sidecar.value));
        if (parsed.success) return ok(parsed.data);
      } catch {
        // A damaged sidecar falls back to the interchange file.
      }
    }
    const mid = await deps.readFile({ ...scope, path: musicMidiPath(name), encoding: 'base64' });
    if (!mid.ok) return failure(`Song "${name}" was not found.`);
    try {
      return ok(midiToSong(Buffer.from(mid.value, 'base64'), name));
    } catch (error) {
      return failure(`"${name}" is not a readable MIDI file: ${message(error)}`);
    }
  }

  async function write(
    repoId: string,
    project: string,
    name: string,
    song: Song,
  ): Promise<GitOpResult<{ size: number; largeFile: boolean }>> {
    const scope = scopeOf(repoId, project);
    let midi: Uint8Array;
    try {
      midi = songToMidi(song);
    } catch (error) {
      return failure(`Could not encode the song as MIDI: ${message(error)}`);
    }
    const wroteMid = await deps.writeBytes({ ...scope, path: musicMidiPath(name), data: Buffer.from(midi) });
    if (!wroteMid.ok) return wroteMid;
    const wroteSidecar = await deps.writeBytes({
      ...scope,
      path: musicSidecarPath(name),
      data: Buffer.from(JSON.stringify(song, null, 2) + '\n', 'utf8'),
    });
    if (!wroteSidecar.ok) return wroteSidecar;
    return ok({ size: midi.byteLength, largeFile: midi.byteLength > MEDIA_LARGE_FILE_BYTES });
  }

  async function importFiles(
    repoId: string,
    project: string,
    window?: W,
  ): Promise<GitOpResult<Array<{ name: string; song: Song }>>> {
    const picked = await deps.pickFiles(window);
    if (!picked || picked.length === 0) return failure('cancelled');
    const existing = await list(repoId, project);
    const taken = new Set(existing.ok ? existing.value.map((s) => s.name) : []);
    const landed: Array<{ name: string; song: Song }> = [];
    let firstError: string | null = null;
    for (const file of picked) {
      try {
        const bytes = await deps.readLocal(file);
        if (bytes.byteLength > MUSIC_MAX_MIDI_BYTES) throw new Error('That MIDI file is too large to import.');
        const base = songNameFromFile(file);
        let name = base;
        for (let n = 2; taken.has(name); n += 1) name = `${base}-${n}`;
        const song = midiToSong(bytes, name);
        const written = await write(repoId, project, name, song);
        if (!written.ok) throw new Error(written.kind === 'error' ? written.message : 'Could not write the song.');
        taken.add(name);
        landed.push({ name, song });
      } catch (error) {
        firstError ??= `${basename(file)}: ${message(error)}`;
      }
    }
    if (landed.length === 0) return failure(firstError ?? 'Nothing was imported.');
    return ok(landed);
  }

  async function remove(repoId: string, project: string, name: string): Promise<GitOpResult> {
    const scope = scopeOf(repoId, project);
    const mid = await deps.removeFile({ ...scope, path: musicMidiPath(name) });
    // The sidecar may not exist (a bare .mid); only the interchange file is required.
    await deps.removeFile({ ...scope, path: musicSidecarPath(name) });
    return mid.ok ? ok() : failure(`Song "${name}" was not found.`);
  }

  return { list, read, write, importFiles, remove };
}

export type MusicService = ReturnType<typeof createMusicService>;
