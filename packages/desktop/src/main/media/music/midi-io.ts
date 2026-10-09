import { Midi } from '@tonejs/midi';
import {
  MUSIC_MAX_AUTOMATION_POINTS,
  expandClips,
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

/**
 * Theme F: CC 7 (channel volume) and CC 10 (pan) are the mixer's, not loose controllers. In the song
 * they live in `mixer` and the `volume`/`pan` automation lanes; in the file they are those CCs.
 * Volume maps 0..1 to 0..127 (louder than unity, which MIDI cannot say, is written at 127); pan maps
 * -1..1 to 0..127 around the centre at 64.
 */
export const CC_VOLUME = 7;
export const CC_PAN = 10;
export const volumeToCc = (volume: number): number => clamp(Math.round(volume * 127), 0, 127);
export const ccToVolume = (value: number): number => clamp(value, 0, 127) / 127;
export const panToCc = (pan: number): number => clamp(Math.round(pan * 63 + 64), 0, 127);
export const ccToPan = (value: number): number => clamp((value - 64) / 63, -1, 1);
const DEFAULT_VOLUME = 0.8;

/** The CC events a track's mixer strip and its volume/pan lanes write, for the `.mid`. */
function mixerControlChanges(track: SongTrack): { tick: number; controller: number; value: number }[] {
  const out: { tick: number; controller: number; value: number }[] = [];
  const lane = (target: string) => track.automation.find((l) => l.target === target && l.points.length > 0);
  const volumeLane = lane('volume');
  const panLane = lane('pan');
  if (volumeLane) for (const p of volumeLane.points) out.push({ tick: p.tick, controller: CC_VOLUME, value: volumeToCc(p.value) });
  else if (track.mixer.volume !== DEFAULT_VOLUME) out.push({ tick: 0, controller: CC_VOLUME, value: volumeToCc(track.mixer.volume) });
  if (panLane) for (const p of panLane.points) out.push({ tick: p.tick, controller: CC_PAN, value: panToCc(p.value) });
  else if (track.mixer.pan !== 0) out.push({ tick: 0, controller: CC_PAN, value: panToCc(track.mixer.pan) });
  return out;
}

export function songToMidi(source: Song): Uint8Array {
  // Clips play out into plain notes: a .mid has no clips, and a DAW must hear what the editor plays.
  const song = expandClips(source);
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
    const mirrored = mixerControlChanges(source);
    const taken = new Set(mirrored.map((cc) => `${cc.tick}:${cc.controller}`));
    // A raw CC 7/10 an agent wrote loses to the mixer's own at the same tick.
    const raw = source.controlChanges.filter((cc) => !taken.has(`${cc.tick}:${cc.controller}`));
    for (const cc of [...mirrored, ...raw]) {
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
    const allCc = Object.values(source.controlChanges)
      .flat()
      .map((cc) => ({ tick: at(cc.ticks), controller: clamp(cc.number, 0, 127), value: clamp(Math.round(cc.value * 127), 0, 127) }))
      .sort((a, b) => a.tick - b.tick || a.controller - b.controller);
    const controlChanges = allCc.filter((cc) => cc.controller !== CC_VOLUME && cc.controller !== CC_PAN);
    const mixer = { volume: DEFAULT_VOLUME, pan: 0, mute: false, solo: false };
    const automation: SongTrack['automation'] = [];
    for (const [controller, target] of [[CC_VOLUME, 'volume'], [CC_PAN, 'pan']] as const) {
      const events = allCc.filter((cc) => cc.controller === controller);
      const convert = controller === CC_VOLUME ? ccToVolume : ccToPan;
      const first = events[0];
      if (first && first.tick === 0) mixer[target] = convert(first.value);
      // A single opening value is just the fader; a moving one becomes a lane.
      if (events.length > 1 || (first && first.tick > 0)) {
        automation.push({
          id: `lane${automation.length + 1}`,
          target,
          curve: 'step',
          points: events.slice(0, MUSIC_MAX_AUTOMATION_POINTS).map((cc) => ({ tick: cc.tick, value: convert(cc.value) })),
        });
      }
    }
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
      automation,
      mixer,
      effects: [],
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
