import { MUSIC_PPQ, SongSchema, ok } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { exportSong, type SongExportDeps, exportSongName, exportSource, sendSongToGenerator, songHasNotes } from './song-export';

const song = SongSchema.parse({
  name: 'Tune',
  tracks: [{ id: 'p', notes: [0, 1, 2, 3].map((i) => ({ pitch: 60 + i, startTick: i * MUSIC_PPQ, durationTicks: MUSIC_PPQ, velocity: 90 })) }],
});
const render = vi.fn(async () => ({ bytes: new Uint8Array([9]), durationSeconds: 4, sampleRate: 44100 }));
const target = { repoId: 'r', project: 'album', song, range: 'song' as const, loop: null };

const deps = () => {
  const music = { export: vi.fn(async (_req: unknown) => ok({ dest: '/x' })), sendToGenerator: vi.fn(async (_req: unknown) => ok({ file: 'f.wav', sessionId: 's', description: 'd', tags: [] as string[] })) };
  return { music, render, as: { music, render } as unknown as SongExportDeps };
};

describe('song export plumbing', () => {
  it('names the song legally and cuts the loop region only when one is set', () => {
    expect(exportSongName(song)).toBe('Tune');
    expect(exportSongName(SongSchema.parse({ name: '../x' }))).toBe('song');
    expect(exportSource(song, 'song', { startTick: 0, endTick: MUSIC_PPQ })).toBe(song);
    expect(exportSource(song, 'loop', null)).toBe(song);
    expect(exportSource(song, 'loop', { startTick: MUSIC_PPQ, endTick: 3 * MUSIC_PPQ }).tracks[0]!.notes).toHaveLength(2);
    expect(songHasNotes(song)).toBe(true);
    expect(songHasNotes(SongSchema.parse({}))).toBe(false);
  });

  it('renders for wav/mp3 but not for mid, and only sends the bitrate for mp3', async () => {
    render.mockClear();
    const d = deps();
    await exportSong(d.as, { ...target, format: 'mid', bitrateKbps: 192 });
    expect(render).not.toHaveBeenCalled();
    expect(d.music.export.mock.calls[0]![0]).not.toHaveProperty('wav');
    await exportSong(d.as, { ...target, format: 'mp3', bitrateKbps: 256 });
    expect(render).toHaveBeenCalledTimes(1);
    expect(d.music.export.mock.calls[1]![0]).toMatchObject({ format: 'mp3', bitrateKbps: 256, wav: new Uint8Array([9]) });
  });

  it('exports the loop region as its own song', async () => {
    const d = deps();
    await exportSong(d.as, { ...target, range: 'loop', loop: { startTick: 0, endTick: MUSIC_PPQ }, format: 'mid', bitrateKbps: 192 });
    const sent = d.music.export.mock.calls[0]![0] as { song: typeof song };
    expect(sent.song.tracks[0]!.notes).toHaveLength(1);
  });

  it('sends the render, its duration and the whole song to Generator', async () => {
    const d = deps();
    const send = d.music.sendToGenerator;
    await sendSongToGenerator(d.as, target);
    expect(send).toHaveBeenCalledWith({ repoId: 'r', project: 'album', name: 'Tune', song, wav: new Uint8Array([9]), durationS: 4 });
  });
});
