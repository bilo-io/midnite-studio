import { type MidniteStudioBridge, type Song } from '@midnite/studio-shared';

import { audibleTracks, trackEvents, type ScheduledNote } from './scheduler';
import { createTickMap } from './tick-map';
import { loadTone, makeGmInstrument } from './tone-host';
import { encodeWav } from './wav';

type GmBridge = Pick<MidniteStudioBridge['media']['audio'], 'gm'>;
type ToneModule = typeof import('tone');

export type RenderOptions = {
  bridge?: GmBridge;
  /** Seconds of release/reverb tail after the last note. */
  tailSeconds?: number;
  sampleRate?: number;
  /** Test seam. */
  loadTone?: () => Promise<ToneModule>;
};

export type RenderedWav = { bytes: Uint8Array; durationSeconds: number; sampleRate: number };

/**
 * Renders a song to a 16-bit stereo WAV with `Tone.Offline` — for export (Theme J) and previews.
 * Honors mute/solo and the tempo map exactly as live playback does.
 */
export async function renderSongToWav(
  song: Song,
  options: RenderOptions = {},
): Promise<RenderedWav> {
  const Tone = await (options.loadTone ?? loadTone)();
  const map = createTickMap(song.tempos);
  const tracks = audibleTracks(song);
  let lastTick = 0;
  for (const t of tracks)
    for (const n of t.notes) lastTick = Math.max(lastTick, n.startTick + n.durationTicks);
  const durationSeconds = Math.max(0.1, map.ticksToSeconds(lastTick) + (options.tailSeconds ?? 1));
  const sampleRate = options.sampleRate ?? 44100;

  const buffer = await Tone.Offline(
    async ({ transport }) => {
      transport.bpm.value = 60;
      for (const track of tracks) {
        const instrument = await makeGmInstrument(track, options.bridge, Tone);
        const part = new Tone.Part<ScheduledNote>(
          (time, note) => instrument.play(note, time),
          trackEvents(track, map),
        );
        part.start(0);
      }
      transport.start(0);
    },
    durationSeconds,
    2,
    sampleRate,
  );

  const channels = [0, 1].map((c) =>
    buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)),
  );
  return { bytes: encodeWav(channels, sampleRate), durationSeconds, sampleRate };
}
