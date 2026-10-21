import {
  MCP_CONTENT_KEY,
  MUSIC_PREVIEW_DEFAULT_BARS,
  MUSIC_MCP_NOTES_DEFAULT_LIMIT,
  SongSchema,
  songEndTick,
  type GitOpResult,
  type MediaProject,
  type McpToolInput,
  type McpToolOutput,
  type MusicChangedEvent,
  type MusicIssue,
  type MusicOpenEvent,
  type MusicSongEntry,
  type Song,
  type SongTrack,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';
import { renderPianoRoll, ticksPerBarOf } from './music-preview';

/**
 * The `music_*` MCP tools' implementations (Media ▸ Audio ▸ Editor, Phase 101 Theme H).
 *
 * Deliberately **ungated**: the app's global MCP server wraps every tool that changes a song in the
 * `allowMusic` switch (`main/mcp/music-tools.ts`), and an agent engine's private per-run server only
 * ever answers for the one song it was started for. What is here is the semantics.
 *
 * **Working copies.** An edit never touches disk. The first call about a song loads it (the sidecar,
 * or the `.mid` imported) into a working copy held here; every edit validates the *whole result*
 * against `SongSchema` before it is kept, so an invalid call changes nothing and answers
 * `{ ok: false, errors }` rather than throwing. Each successful edit pushes the full song to the open
 * editor as one `music-changed` event — a single undoable step on that side — and `music_save` writes
 * `<name>.mid` and `<name>.song.json`. `music_open` drops the working copy first, so it always
 * starts from what is on disk.
 *
 * Every dependency is injected, so the whole surface runs without Electron.
 */
export type MusicMcpDeps = {
  /** `repoPath` → the open repository's id, or the refusal to answer with. */
  resolveRepo: (repoPath: string) => Promise<{ ok: true; repoId: string } | { ok: false; kind: 'not-found' | 'refused'; message: string }>;
  listProjects: (repoId: string) => Promise<GitOpResult<MediaProject[]>>;
  listSongs: (repoId: string, project: string) => Promise<GitOpResult<MusicSongEntry[]>>;
  readSong: (repoId: string, project: string, name: string) => Promise<GitOpResult<Song>>;
  writeSong: (repoId: string, project: string, name: string, song: Song) => Promise<GitOpResult<{ size: number; largeFile: boolean }>>;
  emitChanged: (event: MusicChangedEvent) => void;
  emitOpen: (event: MusicOpenEvent) => void;
};

type Target = { repoPath: string; project: string; name: string };
/** `revision` counts accepted edits, so a caller can tell whether a run changed anything. */
type Session = { repoId: string; project: string; name: string; song: Song; saved: boolean; revision: number };

const LIST_LIMIT = 200;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const issues = (...messages: Array<[string, string]>): { ok: false; errors: MusicIssue[] } => ({
  ok: false,
  errors: messages.map(([path, message]) => ({ path, message })),
});

export function createMusicTools(deps: MusicMcpDeps) {
  const sessions = new Map<string, Session>();
  const keyOf = (repoId: string, project: string, name: string): string => `${repoId}\0${project}\0${name}`;

  async function repoFor(repoPath: string): Promise<string> {
    const resolved = await deps.resolveRepo(repoPath);
    if (!resolved.ok) throw new McpToolError(resolved.kind, resolved.message);
    return resolved.repoId;
  }

  /** The working copy for a target, loaded from disk the first time. */
  async function session(target: Target): Promise<Session> {
    const repoId = await repoFor(target.repoPath);
    const key = keyOf(repoId, target.project, target.name);
    const held = sessions.get(key);
    if (held) return held;
    const read = await deps.readSong(repoId, target.project, target.name);
    if (!read.ok) throw new McpToolError('not-found', read.kind === 'error' ? read.message : `Song "${target.name}" was not found.`);
    const created: Session = { repoId, project: target.project, name: target.name, song: read.value, saved: true, revision: 0 };
    sessions.set(key, created);
    return created;
  }

  const trackIndex = (song: Song, ref: string | number): number => {
    if (typeof ref === 'number') return ref < song.tracks.length ? ref : -1;
    const byId = song.tracks.findIndex((t) => t.id === ref);
    if (byId >= 0) return byId;
    return /^\d+$/.test(ref) && Number(ref) < song.tracks.length ? Number(ref) : -1;
  };
  const noTrack = (song: Song, ref: string | number) =>
    issues(['track', `No track "${ref}". Tracks: ${song.tracks.map((t, i) => `${i}:${t.id}`).join(', ') || '(none yet — call music_add_track)'}.`]);

  /** Keep `next` only when the whole song still validates; otherwise answer the problems and change nothing. */
  function commit(s: Session, next: Song, summary: string): { ok: true } | { ok: false; errors: MusicIssue[] } {
    const parsed = SongSchema.safeParse(next);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.') || '(song)', message: i.message })) };
    }
    s.song = parsed.data;
    s.saved = false;
    s.revision += 1;
    deps.emitChanged({ repoId: s.repoId, project: s.project, name: s.name, song: parsed.data, summary, saved: false });
    return { ok: true };
  }

  const noteCount = (song: Song): number => song.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  const label = (track: SongTrack, index: number): string => track.name || `track ${index + 1}`;

  function summarize(track: SongTrack, index: number): McpToolOutput<'music_get_track'> {
    let lo = 127;
    let hi = 0;
    let first = Number.POSITIVE_INFINITY;
    let last = 0;
    for (const n of track.notes) {
      lo = Math.min(lo, n.pitch);
      hi = Math.max(hi, n.pitch);
      first = Math.min(first, n.startTick);
      last = Math.max(last, n.startTick + n.durationTicks);
    }
    return {
      index,
      id: track.id,
      name: track.name,
      channel: track.channel,
      program: track.program,
      color: track.color,
      noteCount: track.notes.length,
      controlChangeCount: track.controlChanges.length,
      pitchBendCount: track.pitchBends.length,
      ...(track.notes.length ? { pitchRange: [lo, hi] as [number, number], tickRange: [first, last] as [number, number] } : {}),
    };
  }

  // --- reads --------------------------------------------------------------------

  async function music_list(input: McpToolInput<'music_list'>): Promise<McpToolOutput<'music_list'>> {
    const repoId = await repoFor(input.repoPath);
    const listed = await deps.listProjects(repoId);
    if (!listed.ok) throw new McpToolError('error', listed.kind === 'error' ? listed.message : 'Could not list projects.');
    const projects: McpToolOutput<'music_list'>['projects'] = [];
    for (const p of listed.value.filter((p) => input.project === undefined || p.name === input.project)) {
      const songs = await deps.listSongs(repoId, p.name);
      const entries = songs.ok ? songs.value : [];
      if (entries.length === 0 && input.project === undefined) continue;
      projects.push({
        name: p.name,
        songs: entries.slice(0, LIST_LIMIT).map((s) => ({ name: s.name, hasSidecar: s.hasSidecar, size: s.size })),
      });
    }
    return { projects };
  }

  async function music_get_info(input: McpToolInput<'music_get_info'>): Promise<McpToolOutput<'music_get_info'>> {
    const s = await session(input);
    const song = s.song;
    return {
      name: song.name || s.name,
      ppq: song.ppq,
      tempos: song.tempos,
      timeSignatures: song.timeSignatures,
      keySignatures: song.keySignatures.map((k) => ({ tick: k.tick, key: k.key, scale: k.scale })),
      trackCount: song.tracks.length,
      noteCount: noteCount(song),
      endTick: songEndTick(song),
      bars: Math.ceil(songEndTick(song) / ticksPerBarOf(song)),
      unsaved: !s.saved,
    };
  }

  async function music_get_tracks(input: McpToolInput<'music_get_tracks'>): Promise<McpToolOutput<'music_get_tracks'>> {
    const { song } = await session(input);
    return { tracks: song.tracks.map((t, i) => summarize(t, i)) };
  }

  async function music_get_track(input: McpToolInput<'music_get_track'>): Promise<McpToolOutput<'music_get_track'>> {
    const { song } = await session(input);
    const index = trackIndex(song, input.track);
    if (index < 0) throw new McpToolError('not-found', noTrack(song, input.track).errors[0]!.message);
    return summarize(song.tracks[index]!, index);
  }

  async function music_get_notes(input: McpToolInput<'music_get_notes'>): Promise<McpToolOutput<'music_get_notes'>> {
    const { song } = await session(input);
    const index = trackIndex(song, input.track);
    if (index < 0) throw new McpToolError('not-found', noTrack(song, input.track).errors[0]!.message);
    const from = input.fromTick ?? 0;
    const to = input.toTick ?? Number.POSITIVE_INFINITY;
    const inRange = song.tracks[index]!.notes.filter((n) => n.startTick >= from && n.startTick < to);
    const limit = input.limit ?? MUSIC_MCP_NOTES_DEFAULT_LIMIT;
    return { notes: inRange.slice(0, limit), total: inRange.length, truncated: inRange.length > limit };
  }

  async function music_render_preview(input: McpToolInput<'music_render_preview'>): Promise<McpToolOutput<'music_render_preview'>> {
    const { song } = await session(input);
    const bars = input.bars ?? MUSIC_PREVIEW_DEFAULT_BARS;
    const fromBar = input.fromBar ?? 1;
    const roll = renderPianoRoll(song, fromBar, bars);
    const legend = song.tracks.map((t, i) => `${label(t, i)} ${t.color}`).join(', ') || 'no tracks';
    return {
      [MCP_CONTENT_KEY]: [
        {
          type: 'text',
          text:
            `${song.name || input.name}: bars ${fromBar}-${fromBar + bars - 1} (${ticksPerBarOf(song)} ticks per bar), ` +
            `${roll.pitchRange ? `pitches ${roll.pitchRange[0]}-${roll.pitchRange[1]}` : 'no notes in this range'}. Time runs left to right, pitch bottom to top. Tracks: ${legend}.`,
        },
        { type: 'image', data: roll.png.toString('base64'), mimeType: 'image/png' },
      ],
    };
  }

  // --- writes -------------------------------------------------------------------

  async function music_open(input: McpToolInput<'music_open'>): Promise<McpToolOutput<'music_open'>> {
    const repoId = await repoFor(input.repoPath);
    // Always start from disk: the editor is about to show what is saved.
    sessions.delete(keyOf(repoId, input.project, input.name));
    const s = await session(input);
    deps.emitOpen({ repoId, project: input.project, name: input.name });
    return { opened: true, name: input.name, trackCount: s.song.tracks.length, noteCount: noteCount(s.song) };
  }

  async function music_set_tempo(input: McpToolInput<'music_set_tempo'>): Promise<McpToolOutput<'music_set_tempo'>> {
    const s = await session(input);
    const tick = input.tick ?? 0;
    const tempos = [...s.song.tempos.filter((t) => t.tick !== tick), { tick, bpm: input.bpm }].sort((a, b) => a.tick - b.tick);
    const result = commit(s, { ...s.song, tempos }, `Set the tempo to ${input.bpm} BPM`);
    return result.ok ? { ok: true, unsaved: true } : result;
  }

  async function music_add_notes(input: McpToolInput<'music_add_notes'>): Promise<McpToolOutput<'music_add_notes'>> {
    const s = await session(input);
    const index = trackIndex(s.song, input.track);
    if (index < 0) return noTrack(s.song, input.track);
    const track = s.song.tracks[index]!;
    const notes = [...track.notes, ...input.notes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
    const tracks = s.song.tracks.map((t, i) => (i === index ? { ...t, notes } : t));
    const result = commit(s, { ...s.song, tracks }, `Added ${plural(input.notes.length, 'note')} to ${label(track, index)}`);
    return result.ok ? { ok: true, added: input.notes.length, noteCount: noteCount(s.song), unsaved: true } : result;
  }

  async function music_remove_notes(input: McpToolInput<'music_remove_notes'>): Promise<McpToolOutput<'music_remove_notes'>> {
    const s = await session(input);
    const index = trackIndex(s.song, input.track);
    if (index < 0) return noTrack(s.song, input.track);
    const track = s.song.tracks[index]!;
    const from = input.fromTick ?? 0;
    const to = input.toTick ?? Number.POSITIVE_INFINITY;
    const pitches = input.pitches ? new Set(input.pitches) : null;
    const hit = (n: { startTick: number; pitch: number }): boolean => n.startTick >= from && n.startTick < to && (!pitches || pitches.has(n.pitch));
    const kept = track.notes.filter((n) => !hit(n));
    const removed = track.notes.length - kept.length;
    if (removed === 0) return { ok: true, removed: 0, noteCount: noteCount(s.song), unsaved: !s.saved };
    const tracks = s.song.tracks.map((t, i) => (i === index ? { ...t, notes: kept } : t));
    const result = commit(s, { ...s.song, tracks }, `Removed ${plural(removed, 'note')} from ${label(track, index)}`);
    return result.ok ? { ok: true, removed, noteCount: noteCount(s.song), unsaved: true } : result;
  }

  async function music_add_cc(input: McpToolInput<'music_add_cc'>): Promise<McpToolOutput<'music_add_cc'>> {
    const s = await session(input);
    const index = trackIndex(s.song, input.track);
    if (index < 0) return noTrack(s.song, input.track);
    const track = s.song.tracks[index]!;
    const controlChanges = [...track.controlChanges, ...input.events].sort((a, b) => a.tick - b.tick);
    const tracks = s.song.tracks.map((t, i) => (i === index ? { ...t, controlChanges } : t));
    const result = commit(s, { ...s.song, tracks }, `Added ${plural(input.events.length, 'controller change')} to ${label(track, index)}`);
    return result.ok ? { ok: true, added: input.events.length, unsaved: true } : result;
  }

  async function music_add_pitchbends(input: McpToolInput<'music_add_pitchbends'>): Promise<McpToolOutput<'music_add_pitchbends'>> {
    const s = await session(input);
    const index = trackIndex(s.song, input.track);
    if (index < 0) return noTrack(s.song, input.track);
    const track = s.song.tracks[index]!;
    const pitchBends = [...track.pitchBends, ...input.events].sort((a, b) => a.tick - b.tick);
    const tracks = s.song.tracks.map((t, i) => (i === index ? { ...t, pitchBends } : t));
    const result = commit(s, { ...s.song, tracks }, `Added ${plural(input.events.length, 'pitch bend')} to ${label(track, index)}`);
    return result.ok ? { ok: true, added: input.events.length, unsaved: true } : result;
  }

  async function music_add_track(input: McpToolInput<'music_add_track'>): Promise<McpToolOutput<'music_add_track'>> {
    const s = await session(input);
    let n = s.song.tracks.length + 1;
    while (s.song.tracks.some((t) => t.id === `track-${n}`)) n += 1;
    const id = `track-${n}`;
    const fresh = {
      id,
      name: input.trackName ?? '',
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.program !== undefined ? { program: input.program } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    };
    const parsed = SongSchema.safeParse({ ...s.song, tracks: [...s.song.tracks, fresh] });
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.') || '(song)', message: i.message })) };
    }
    const result = commit(s, parsed.data, `Added the track ${input.trackName || id}`);
    return result.ok ? { ok: true, trackId: id, trackIndex: s.song.tracks.length - 1, unsaved: true } : result;
  }

  async function music_save(input: McpToolInput<'music_save'>): Promise<McpToolOutput<'music_save'>> {
    const s = await session(input);
    const written = await deps.writeSong(s.repoId, s.project, s.name, s.song);
    if (!written.ok) return issues(['song', written.kind === 'error' ? written.message : 'Could not save the song.']);
    s.saved = true;
    deps.emitChanged({ repoId: s.repoId, project: s.project, name: s.name, song: s.song, summary: 'Saved the song', saved: true });
    return { ok: true, size: written.value.size };
  }

  return {
    music_list,
    music_open,
    music_get_info,
    music_set_tempo,
    music_get_tracks,
    music_get_track,
    music_get_notes,
    music_add_notes,
    music_remove_notes,
    music_add_cc,
    music_add_pitchbends,
    music_add_track,
    music_save,
    music_render_preview,
    /**
     * Replace a whole song (a single-pass engine's answer) — validated like any edit, announced as one
     * `music-changed` event. A song that does not validate changes nothing.
     */
    adopt: async (target: Target, song: unknown, summary: string): Promise<{ ok: true } | { ok: false; errors: MusicIssue[] }> => {
      const s = await session(target);
      return commit(s, song as Song, summary);
    },
    /** The working copy, when one is held — what an engine reads back after a run. */
    peek: (repoId: string, project: string, name: string): Session | undefined => sessions.get(keyOf(repoId, project, name)),
    /** Forget a working copy so the next call reloads from disk. */
    drop: (repoId: string, project: string, name: string): void => void sessions.delete(keyOf(repoId, project, name)),
  };
}

export type MusicTools = ReturnType<typeof createMusicTools>;
/** The tools an MCP call can name (everything but the engine helpers). */
export type MusicToolHandlers = Omit<MusicTools, 'peek' | 'drop' | 'adopt'>;
