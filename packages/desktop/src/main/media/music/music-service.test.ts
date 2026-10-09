import { SongSchema, failure, ok, type GitOpResult, type MediaFileEntry } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { songToMidi } from './midi-io';
import { createMusicService, songNameFromFile } from './music-service';

/** An in-memory media store, enough for the service's file calls. */
function memory(initial: Record<string, string | Buffer> = {}) {
  const files = new Map<string, Buffer>(Object.entries(initial).map(([k, v]) => [k, Buffer.from(v)]));
  const removed: string[] = [];
  let picked: string[] | null = [];
  const local = new Map<string, Buffer>();
  const service = createMusicService({
    listFiles: async (): Promise<GitOpResult<MediaFileEntry[]>> =>
      ok([...files].map(([path, data]) => ({ path, size: data.length, mtimeMs: 1 }))),
    readFile: async (req) => {
      const data = files.get(req.path);
      return data ? ok(data.toString(req.encoding)) : failure('File not found.');
    },
    writeBytes: async (req) => {
      files.set(req.path, req.data);
      return ok({ size: req.data.length, largeFile: false });
    },
    removeFile: async (req) => {
      if (!files.delete(req.path)) return failure('File not found.');
      removed.push(req.path);
      return ok();
    },
    pickFiles: async () => picked,
    readLocal: async (abs) => local.get(abs) ?? Promise.reject(new Error('ENOENT')),
  });
  return {
    service,
    files,
    removed,
    pick: (paths: string[] | null, contents: Record<string, Buffer> = {}) => {
      picked = paths;
      for (const [k, v] of Object.entries(contents)) local.set(k, v);
    },
  };
}

const song = SongSchema.parse({
  name: 'Demo',
  tracks: [{ id: 't1', name: 'Lead', notes: [{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 100 }] }],
});

describe('music service (Phase 101 Theme B)', () => {
  it('writes both the .mid and the .song.json sidecar, then lists and reads the song', async () => {
    const { service, files } = memory({ 'project.json': '{}', 'take.wav': 'x', 'take.json': '{}' });
    const written = await service.write('r', 'album', 'Demo', song);
    expect(written.ok).toBe(true);
    expect([...files.keys()].sort()).toEqual(['Demo.mid', 'Demo.song.json', 'project.json', 'take.json', 'take.wav']);

    const listed = await service.list('r', 'album');
    expect(listed).toMatchObject({ ok: true, value: [{ name: 'Demo', path: 'Demo.mid', hasSidecar: true }] });

    const read = await service.read('r', 'album', 'Demo');
    expect(read).toEqual({ ok: true, value: song });
  });

  it('opens a bare .mid by importing it, and falls back from a damaged sidecar', async () => {
    const mid = Buffer.from(songToMidi(song));
    const bare = memory({ 'Bare.mid': mid });
    const list = await bare.service.list('r', 'p');
    expect(list).toMatchObject({ ok: true, value: [{ name: 'Bare', hasSidecar: false }] });
    const read = await bare.service.read('r', 'p', 'Bare');
    expect(read.ok && read.value.tracks[0]!.notes).toEqual(song.tracks[0]!.notes);

    const damaged = memory({ 'D.mid': mid, 'D.song.json': '{not json' });
    expect((await damaged.service.read('r', 'p', 'D')).ok).toBe(true);
  });

  it('answers a failure envelope, never a throw, for a missing or unreadable song', async () => {
    const { service } = memory({ 'Junk.mid': 'not midi' });
    expect(await service.read('r', 'p', 'Nope')).toMatchObject({ ok: false, kind: 'error' });
    expect(await service.read('r', 'p', 'Junk')).toMatchObject({ ok: false, kind: 'error' });
  });

  it('imports the picked files under unique names, skipping unreadable ones', async () => {
    const mid = Buffer.from(songToMidi(song));
    const { service, files, pick } = memory({ 'Tune.mid': mid });
    pick(['/x/Tune.mid', '/x/Bad.mid', '/x/project.MID'], {
      '/x/Tune.mid': mid,
      '/x/Bad.mid': Buffer.from('nope'),
      '/x/project.MID': mid,
    });
    const result = await service.importFiles('r', 'p');
    expect(result.ok && result.value.map((s) => s.name)).toEqual(['Tune-2', 'project-song']);
    expect(files.has('Tune-2.mid') && files.has('Tune-2.song.json') && files.has('project-song.mid')).toBe(true);
  });

  it('fails an import that was cancelled or where nothing parses', async () => {
    const { service, pick } = memory();
    pick(null);
    expect(await service.importFiles('r', 'p')).toMatchObject({ ok: false, message: 'cancelled' });
    pick(['/x/Bad.mid'], { '/x/Bad.mid': Buffer.from('nope') });
    const bad = await service.importFiles('r', 'p');
    expect(bad).toMatchObject({ ok: false, kind: 'error' });
  });

  it('deletes the song and its sidecar; a missing .mid is the failure', async () => {
    const { service, removed, files } = memory();
    await service.write('r', 'p', 'Demo', song);
    expect(await service.remove('r', 'p', 'Demo')).toEqual({ ok: true });
    expect(removed.sort()).toEqual(['Demo.mid', 'Demo.song.json']);
    expect(files.size).toBe(0);
    expect(await service.remove('r', 'p', 'Demo')).toMatchObject({ ok: false });
  });

  it('turns a file name into a legal song name', () => {
    expect(songNameFromFile('/a/My Song (v2).MID')).toBe('My Song (v2)');
    expect(songNameFromFile('/a/.hidden.mid')).toBe('hidden');
    expect(songNameFromFile('/a/project.mid')).toBe('project-song');
  });
});
