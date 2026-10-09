import { Midi } from '@tonejs/midi';
import {
  MUSIC_MAX_MIDI_BYTES,
  MUSIC_MAX_NOTES_PER_TRACK,
  MUSIC_MAX_TICKS,
  MUSIC_PITCH_BEND_MAX,
  MUSIC_PITCH_BEND_MIN,
  MUSIC_PPQ,
  SongSchema,
  type Song,
  type SongTrack,
} from '@midnite/studio-shared';

/**
 * Phase 101 Theme B — Standard MIDI File I/O over `@tonejs/midi`.
 *
 * The song model is the editor's truth; the `.mid` is the interchange file. Two library quirks are
 * handled here rather than leaked to callers:
 * - the encoder floors `velocity * 127`, so an exact `n / 127` can land on `n - 1` after float
 *   rounding — values are written as `(n + 0.5) / 127` and read back with `Math.round`;
 * - pitch bends are scaled to ±1 when read but written raw, so they are written raw and
 *   scaled back by 2^13 when read.
 *
 * Type 0 and type 1 files both open: `@tonejs/midi` splits a track by (program, channel). What the
 * library does not model — sysex, aftertouch, RPN/NRPN as such, per-track meta other than the name —
 * is dropped; text, cue, marker and lyric events are carried in the song, and key signatures are read
 * (the library names them by their major key) but never written — see `songToMidi`.
 */

const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16'] as const;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const asVelocity = (n: number): number => (n + 0.5) / 127;

export function songToMidi(song: Song): Uint8Array {
  const midi = new Midi();
  midi.header.name = song.name;
  midi.header.tempos = song.tempos.map((t) => ({ ticks: t.tick, bpm: t.bpm }));
  midi.header.timeSignatures = song.timeSignatures.map((t) => ({
    ticks: t.tick,
    timeSignature: [t.numerator, t.denominator],
  }));
  // Key signatures are not written: @tonejs/midi's encoder emits `index + 7` where the SMF byte is
  // `index - 7`, producing an invalid file. The sidecar keeps them; an imported file's are still read.
  midi.header.meta = song.meta.map((m) => ({ ticks: m.tick, type: m.type, text: m.text }));
  midi.header.update();

  for (const source of song.tracks) {
    const track = midi.addTrack();
    track.name = source.name;
    track.channel = source.channel;
    track.instrument.number = source.program;
    for (const note of source.notes) {
      track.addNote({
        midi: note.pitch,
        ticks: note.startTick,
        durationTicks: note.durationTicks,
        velocity: asVelocity(note.velocity),
      });
    }
    for (const cc of source.controlChanges) {
      track.addCC({ number: cc.controller, ticks: cc.tick, value: asVelocity(cc.value) });
    }
    for (const bend of source.pitchBends) track.addPitchBend({ ticks: bend.tick, value: bend.value });
  }
  return midi.toArray();
}

/** Rescale a tick from the file's resolution to {@link MUSIC_PPQ}. */
const rescale = (ticks: number, ppq: number): number =>
  clamp(ppq === MUSIC_PPQ ? ticks : Math.round((ticks * MUSIC_PPQ) / ppq), 0, MUSIC_MAX_TICKS);

/** Parse a Standard MIDI File (type 0 or 1) into a validated song. Throws on a corrupt file. */
export function midiToSong(bytes: Uint8Array, fallbackName = ''): Song {
  if (bytes.byteLength > MUSIC_MAX_MIDI_BYTES) throw new Error('That MIDI file is too large to import.');
  const midi = new Midi(bytes);
  const ppq = midi.header.ppq > 0 ? midi.header.ppq : MUSIC_PPQ;
  const at = (ticks: number): number => rescale(ticks, ppq);

  const tempos = midi.header.tempos
    .map((t) => ({ tick: at(t.ticks), bpm: clamp(Math.round(t.bpm * 1000) / 1000, 20, 400) }))
    .sort((a, b) => a.tick - b.tick);
  if (tempos.length === 0 || tempos[0]!.tick !== 0) tempos.unshift({ tick: 0, bpm: tempos[0]?.bpm ?? 120 });

  const timeSignatures = midi.header.timeSignatures
    .map((t) => ({
      tick: at(t.ticks),
      numerator: clamp(t.timeSignature[0] ?? 4, 1, 32),
      denominator: ([1, 2, 4, 8, 16, 32].includes(t.timeSignature[1] ?? 4) ? t.timeSignature[1] : 4) as 1 | 2 | 4 | 8 | 16 | 32,
    }))
    .sort((a, b) => a.tick - b.tick);
  if (timeSignatures.length === 0 || timeSignatures[0]!.tick !== 0) {
    timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4 });
  }

  const tracks: SongTrack[] = midi.tracks.map((source, index) => {
    const notes = source.notes.slice(0, MUSIC_MAX_NOTES_PER_TRACK).map((n) => ({
      pitch: clamp(n.midi, 0, 127),
      startTick: at(n.ticks),
      durationTicks: Math.max(1, Math.round((n.durationTicks * MUSIC_PPQ) / ppq)),
      velocity: clamp(Math.round(n.velocity * 127), 1, 127),
    }));
    const controlChanges = Object.values(source.controlChanges)
      .flat()
      .map((cc) => ({ tick: at(cc.ticks), controller: clamp(cc.number, 0, 127), value: clamp(Math.round(cc.value * 127), 0, 127) }))
      .sort((a, b) => a.tick - b.tick);
    const pitchBends = source.pitchBends.map((pb) => ({
      tick: at(pb.ticks),
      value: clamp(Math.round(pb.value * 8192), MUSIC_PITCH_BEND_MIN, MUSIC_PITCH_BEND_MAX),
    }));
    return {
      id: `t${index + 1}`,
      name: source.name.slice(0, 120),
      channel: clamp(source.channel, 0, 15),
      program: clamp(source.instrument.number, 0, 127),
      color: PALETTE[index % PALETTE.length]!,
      notes,
      controlChanges,
      pitchBends,
      automation: [],
      mixer: { volume: 0.8, pan: 0, mute: false, solo: false },
    };
  });

  return SongSchema.parse({
    name: midi.header.name || fallbackName,
    tempos,
    timeSignatures,
    keySignatures: midi.header.keySignatures
      .map((k) => ({ tick: at(k.ticks), key: k.key ?? 'C', scale: k.scale === 'minor' ? 'minor' : 'major' }))
      .filter((k) => k.key),
    meta: midi.header.meta.map((m) => ({ tick: at(m.ticks), type: m.type, text: m.text.slice(0, 2000) })),
    tracks,
  });
}
