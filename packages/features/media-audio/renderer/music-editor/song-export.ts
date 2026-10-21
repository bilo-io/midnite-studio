import {
  SongNameSchema,
  sliceSong,
  songEndTick,
  type GitOpResult,
  type MidniteStudioBridge,
  type MusicExportFormat,
  type MusicExportRange,
  type MusicRegion,
  type MusicSendToGeneratorResult,
  type Song,
} from '@midnite/studio-shared';

import type { RenderedWav } from './engine/offline';

type MusicBridge = MidniteStudioBridge['media']['music'];

export type SongExportDeps = {
  music: Pick<MusicBridge, 'export' | 'sendToGenerator'>;
  /** Test seam; the real one lazy-loads Tone.js. */
  render?: (song: Song) => Promise<RenderedWav>;
  /** The GM sample bridge, for the real renderer. */
  gm?: Pick<MidniteStudioBridge['media']['audio'], 'gm'>;
};

/** A legal song name for the wire, whatever the editor's title says. */
export const exportSongName = (song: Song): string => {
  const trimmed = song.name.trim();
  return SongNameSchema.safeParse(trimmed).success ? trimmed : 'song';
};

/** The part of the song an export covers: all of it, or the loop region when one is set. */
export function exportSource(song: Song, range: MusicExportRange, loop: MusicRegion | null): Song {
  return range === 'loop' && loop ? sliceSong(song, loop) : song;
}

const defaultRender = async (song: Song, gm: SongExportDeps['gm']): Promise<RenderedWav> => {
  const { renderSongToWav } = await import('./engine/offline');
  return renderSongToWav(song, { bridge: gm });
};

type Target = { repoId: string; project: string; song: Song; range: MusicExportRange; loop: MusicRegion | null };

/** `.mid` is encoded in main; WAV and MP3 are rendered here (main has no Web Audio) and saved there. */
export async function exportSong(
  deps: SongExportDeps,
  target: Target & { format: MusicExportFormat; bitrateKbps: number; defaultDir?: string },
): Promise<GitOpResult<{ dest: string }>> {
  const source = exportSource(target.song, target.range, target.loop);
  const wav = target.format === 'mid' ? undefined : (await (deps.render ?? ((s) => defaultRender(s, deps.gm)))(source)).bytes;
  return deps.music.export({
    repoId: target.repoId,
    project: target.project,
    name: exportSongName(target.song),
    exportId: `music-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    format: target.format,
    song: source,
    ...(wav ? { wav: new Uint8Array(wav) } : {}),
    ...(target.format === 'mp3' ? { bitrateKbps: target.bitrateKbps } : {}),
    ...(target.defaultDir ? { defaultDir: target.defaultDir } : {}),
  });
}

/** Theme K fallback: a rendered reference plus the deterministic description, linked to the song. */
export async function sendSongToGenerator(deps: SongExportDeps, target: Target): Promise<GitOpResult<MusicSendToGeneratorResult>> {
  const source = exportSource(target.song, target.range, target.loop);
  const rendered = await (deps.render ?? ((s) => defaultRender(s, deps.gm)))(source);
  return deps.music.sendToGenerator({
    repoId: target.repoId,
    project: target.project,
    name: exportSongName(target.song),
    song: target.song,
    wav: new Uint8Array(rendered.bytes),
    durationS: rendered.durationSeconds,
  });
}

/** Whether there is anything to export. */
export const songHasNotes = (song: Song | null): song is Song => song !== null && songEndTick(song) > 0;
