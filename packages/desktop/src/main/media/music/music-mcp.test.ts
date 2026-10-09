import { MCP_CONTENT_KEY, MCP_TOOLS, emptySong, failure, ok, type MusicChangedEvent, type Song } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createMusicTools } from './music-mcp';

/**
 * vitest: the `music_*` tools against an in-memory song store — note add/remove semantics, validation
 * results (never a throw), working copies, the live `music-changed` push and the piano-roll preview.
 */
const BASE = { repoPath: '/r', project: 'songs', name: 'intro' };

function kit(initial: Song | null = emptySong('intro')) {
  const disk = new Map<string, Song>();
  if (initial) disk.set('intro', initial);
  const changed: MusicChangedEvent[] = [];
  const opened: unknown[] = [];
  const tools = createMusicTools({
    resolveRepo: async (repoPath) => (repoPath === '/r' ? { ok: true, repoId: 'r1' } : { ok: false, kind: 'not-found', message: 'Not an open repository.' }),
    listProjects: async () => ok([{ name: 'songs' }, { name: 'empty' }] as never),
    listSongs: async (_repo, project) =>
      ok(project === 'songs' ? [...disk.keys()].map((name) => ({ name, path: `${name}.mid`, hasSidecar: true, size: 10, mtimeMs: 1 })) : []),
    readSong: async (_repo, _project, name) => {
      const song = disk.get(name);
      return song ? ok(structuredClone(song)) : failure('missing');
    },
    writeSong: vi.fn(async (_repo, _project, name, song) => {
      disk.set(name, song);
      return ok({ size: 42, largeFile: false });
    }),
    emitChanged: (event) => changed.push(event),
    emitOpen: (event) => opened.push(event),
  });
  return { tools, disk, changed, opened };
}

const NOTE = { pitch: 60, startTick: 0, durationTicks: 480, velocity: 90 };

async function withTrack() {
  const k = kit();
  const added = await k.tools.music_add_track({ ...BASE, trackName: 'Lead', program: 80 });
  return { ...k, trackId: added.trackId! };
}

describe('music tools', () => {
  it('lists songs per project and skips projects with none', async () => {
    const { tools } = kit();
    expect(await tools.music_list({ repoPath: '/r' })).toEqual({ projects: [{ name: 'songs', songs: [{ name: 'intro', hasSidecar: true, size: 10 }] }] });
  });

  it('answers an unknown repo or song as an error the caller can read', async () => {
    const { tools } = kit(null);
    await expect(tools.music_get_info({ ...BASE, repoPath: '/nope' })).rejects.toMatchObject({ kind: 'not-found' });
    await expect(tools.music_get_info(BASE)).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('adds a track with an id, and a song starts with none', async () => {
    const { tools, changed } = kit();
    expect((await tools.music_get_tracks(BASE)).tracks).toEqual([]);
    const result = await tools.music_add_track({ ...BASE, trackName: 'Bass', program: 33, channel: 1, color: '#ff0000' });
    expect(result).toMatchObject({ ok: true, trackId: 'track-1', trackIndex: 0, unsaved: true });
    expect((await tools.music_get_tracks(BASE)).tracks[0]).toMatchObject({ id: 'track-1', name: 'Bass', program: 33, channel: 1, noteCount: 0 });
    expect(changed.at(-1)).toMatchObject({ summary: 'Added the track Bass', saved: false });
  });

  it('adds notes sorted by start then pitch, addressed by id, index or numeric string', async () => {
    const { tools, trackId } = await withTrack();
    await tools.music_add_notes({ ...BASE, track: trackId, notes: [{ ...NOTE, startTick: 480, pitch: 64 }, NOTE] });
    await tools.music_add_notes({ ...BASE, track: 0, notes: [{ ...NOTE, pitch: 55 }] });
    const byString = await tools.music_get_notes({ ...BASE, track: '0' });
    expect(byString.notes.map((n) => [n.startTick, n.pitch])).toEqual([[0, 55], [0, 60], [480, 64]]);
    expect(byString).toMatchObject({ total: 3, truncated: false });
  });

  it('returns ok:false with errors, and changes nothing, for a bad track or a note the model refuses', async () => {
    const { tools, trackId, changed } = await withTrack();
    const before = changed.length;
    const unknown = await tools.music_add_notes({ ...BASE, track: 'nope', notes: [NOTE] });
    expect(unknown).toMatchObject({ ok: false, errors: [{ path: 'track' }] });
    // The schema ceiling is enforced on the whole result, so an input that slipped past the tool schema still cannot corrupt the song.
    const tooLong = await tools.music_add_notes({ ...BASE, track: trackId, notes: [{ ...NOTE, startTick: 480 * 4 * 2001 }] });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.errors?.[0]?.path).toContain('tracks');
    expect((await tools.music_get_notes({ ...BASE, track: trackId })).total).toBe(0);
    expect(changed.length).toBe(before);
  });

  it('rejects out-of-range input at the registry schema, before any handler runs', () => {
    const schema = MCP_TOOLS.music_add_notes.input;
    expect(schema.safeParse({ ...BASE, track: 0, notes: [{ ...NOTE, pitch: 200 }] }).success).toBe(false);
    expect(schema.safeParse({ ...BASE, track: 0, notes: [{ ...NOTE, velocity: 0 }] }).success).toBe(false);
    expect(schema.safeParse({ ...BASE, track: 0, notes: [] }).success).toBe(false);
    expect(MCP_TOOLS.music_set_tempo.input.safeParse({ ...BASE, bpm: 5 }).success).toBe(false);
  });

  it('removes notes by tick range and pitch; an empty match is a successful no-op', async () => {
    const { tools, trackId, changed } = await withTrack();
    await tools.music_add_notes({
      ...BASE,
      track: trackId,
      notes: [NOTE, { ...NOTE, pitch: 64 }, { ...NOTE, startTick: 480 }, { ...NOTE, startTick: 960 }],
    });
    expect(await tools.music_remove_notes({ ...BASE, track: trackId, fromTick: 0, toTick: 480, pitches: [64] })).toMatchObject({ ok: true, removed: 1, noteCount: 3 });
    expect(await tools.music_remove_notes({ ...BASE, track: trackId, fromTick: 480 })).toMatchObject({ ok: true, removed: 2, noteCount: 1 });
    const events = changed.length;
    expect(await tools.music_remove_notes({ ...BASE, track: trackId, fromTick: 5000 })).toMatchObject({ ok: true, removed: 0 });
    expect(changed.length).toBe(events);
  });

  it('sets the tempo at a tick, replacing the event there, keeping the map sorted', async () => {
    const { tools } = kit();
    await tools.music_set_tempo({ ...BASE, bpm: 90 });
    await tools.music_set_tempo({ ...BASE, bpm: 140, tick: 1920 });
    await tools.music_set_tempo({ ...BASE, bpm: 100, tick: 960 });
    expect((await tools.music_get_info(BASE)).tempos).toEqual([
      { tick: 0, bpm: 90 },
      { tick: 960, bpm: 100 },
      { tick: 1920, bpm: 140 },
    ]);
  });

  it('adds controller changes and pitch bends sorted by tick', async () => {
    const { tools, trackId } = await withTrack();
    expect(await tools.music_add_cc({ ...BASE, track: trackId, events: [{ tick: 480, controller: 7, value: 100 }, { tick: 0, controller: 10, value: 64 }] })).toMatchObject({ ok: true, added: 2 });
    expect(await tools.music_add_pitchbends({ ...BASE, track: trackId, events: [{ tick: 0, value: 4096 }] })).toMatchObject({ ok: true, added: 1 });
    expect(await tools.music_get_track({ ...BASE, track: trackId })).toMatchObject({ controlChangeCount: 2, pitchBendCount: 1 });
  });

  it('summarises a track: pitch range and tick span', async () => {
    const { tools, trackId } = await withTrack();
    await tools.music_add_notes({ ...BASE, track: trackId, notes: [NOTE, { ...NOTE, pitch: 72, startTick: 960, durationTicks: 240 }] });
    expect(await tools.music_get_track({ ...BASE, track: trackId })).toMatchObject({ pitchRange: [60, 72], tickRange: [0, 1200], noteCount: 2 });
    expect(await tools.music_get_info(BASE)).toMatchObject({ trackCount: 1, noteCount: 2, endTick: 1200, bars: 1, unsaved: true });
  });

  it('pages notes with a limit and says it truncated', async () => {
    const { tools, trackId } = await withTrack();
    await tools.music_add_notes({ ...BASE, track: trackId, notes: Array.from({ length: 5 }, (_, i) => ({ ...NOTE, startTick: i * 480 })) });
    expect(await tools.music_get_notes({ ...BASE, track: trackId, limit: 2 })).toMatchObject({ total: 5, truncated: true });
  });

  it('pushes every edit to the editor as one event carrying the whole song, then writes only on save', async () => {
    const { tools, trackId, changed, disk } = await withTrack();
    await tools.music_add_notes({ ...BASE, track: trackId, notes: [NOTE] });
    const last = changed.at(-1)!;
    expect(last).toMatchObject({ repoId: 'r1', project: 'songs', name: 'intro', summary: 'Added 1 note to Lead', saved: false });
    expect(last.song.tracks[0]?.notes).toHaveLength(1);
    expect(disk.get('intro')?.tracks).toHaveLength(0);

    expect(await tools.music_save(BASE)).toEqual({ ok: true, size: 42 });
    expect(disk.get('intro')?.tracks[0]?.notes).toHaveLength(1);
    expect(changed.at(-1)).toMatchObject({ summary: 'Saved the song', saved: true });
    expect((await tools.music_get_info(BASE)).unsaved).toBe(false);
  });

  it('reports a failed save as ok:false, not a throw', async () => {
    const k = kit();
    const failing = createMusicTools({
      resolveRepo: async () => ({ ok: true, repoId: 'r1' }),
      listProjects: async () => ok([]),
      listSongs: async () => ok([]),
      readSong: async () => ok(emptySong('intro')),
      writeSong: async () => failure('disk full'),
      emitChanged: () => undefined,
      emitOpen: () => undefined,
    });
    expect(await failing.music_save(BASE)).toMatchObject({ ok: false, errors: [{ message: 'disk full' }] });
    void k;
  });

  it('music_open reloads from disk, drops unsaved edits and asks the window to show the song', async () => {
    const { tools, trackId, opened } = await withTrack();
    await tools.music_add_notes({ ...BASE, track: trackId, notes: [NOTE] });
    expect(await tools.music_open(BASE)).toEqual({ opened: true, name: 'intro', trackCount: 0, noteCount: 0 });
    expect(opened).toEqual([{ repoId: 'r1', project: 'songs', name: 'intro' }]);
  });

  it('adopt validates a whole song like any edit', async () => {
    const { tools, changed } = kit();
    expect(await tools.adopt(BASE, { not: 'a song', tracks: 'x' }, 'x')).toMatchObject({ ok: false });
    expect(changed).toHaveLength(0);
    expect(await tools.adopt(BASE, { ...emptySong('intro'), tracks: [{ id: 'a', notes: [NOTE] }] }, 'Wrote it')).toEqual({ ok: true });
    expect(tools.peek('r1', 'songs', 'intro')).toMatchObject({ saved: false, revision: 1 });
  });

  it('renders a piano-roll PNG for a bar range as image content', async () => {
    const { tools, trackId } = await withTrack();
    await tools.music_add_notes({ ...BASE, track: trackId, notes: [NOTE, { ...NOTE, pitch: 67, startTick: 960 }] });
    const out = (await tools.music_render_preview({ ...BASE, fromBar: 1, bars: 2 })) as unknown as Record<string, Array<{ type: string; data?: string; text?: string }>>;
    const [text, image] = out[MCP_CONTENT_KEY]!;
    expect(text!.text).toContain('bars 1-2');
    expect(text!.text).toContain('Lead');
    expect(image).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(Buffer.from(image!.data!, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
