import { MUSIC_PPQ, expandClips, type Song, type SongTrack } from '@midnite/studio-shared';

import {
  audibleTracks,
  diffTracks,
  scheduleSignatures,
  tempoSignature,
  trackEvents,
  type ScheduledNote,
} from './scheduler';
import { buildMixerSpec, type MixerSpec } from './mixer-spec';
import { createTickMap, metronomeClicks, type TickMap } from './tick-map';

/**
 * The playback engine (Phase 101 Theme C). All the logic lives here against an {@link EngineHost};
 * `tone-host.ts` is the one adapter that touches Tone.js, so this file and its tests never load it.
 *
 * Time model: the host transport runs at a fixed 60 BPM, so one transport second is one real second
 * and the song's tempo map is baked into note times by {@link createTickMap}. A tempo change
 * therefore reschedules everything; a note edit reschedules only the touched track.
 */
export type Disposable = { dispose: () => void };

export type InstrumentHandle = {
  /** `time` is the audio-context time the host's part callback received. */
  play: (note: ScheduledNote, time: number) => void;
  dispose: () => void;
  /** True when a sampled program is not cached and a synth stands in. */
  missing?: boolean;
};

export type EngineHost = {
  resumeContext: () => Promise<void>;
  /** The audio context clock, for notes that fire outside the transport (keyboard previews). */
  now?: () => number;
  suspendContext: () => Promise<void>;
  transport: {
    start: () => void;
    pause: () => void;
    stop: () => void;
    /** Transport position in seconds (read and write). */
    seconds: number;
    loop: boolean;
    setLoopPoints: (startSeconds: number, endSeconds: number) => void;
  };
  createInstrument: (track: SongTrack) => Promise<InstrumentHandle>;
  schedulePart: (
    events: readonly ScheduledNote[],
    fire: (note: ScheduledNote, time: number) => void,
  ) => Disposable;
  scheduleClicks: (clicks: ReadonlyArray<{ time: number; accent: boolean }>) => Disposable;
  /**
   * Theme F: rebuild the mixer from `spec` — chain shape, strip levels, automation — and set every
   * automated value to what it is at `seconds`. Cheap to call often; the host diffs against its last spec.
   */
  syncMixer?: (spec: MixerSpec, seconds: number) => void;
  /** Peak levels 0..1 per track id, and the master. */
  levels?: () => MixerLevels;
  dispose: () => void;
};

export type MixerLevels = { tracks: Record<string, number>; master: number };

export type EngineState = 'stopped' | 'playing' | 'paused';
export type LoopRegion = { startTick: number; endTick: number };

type TrackSlot = {
  key: string;
  instrument: InstrumentHandle | null;
  part: Disposable | null;
  token: number;
};

/** Ticks of lead-in past the last note that the metronome keeps clicking for. */
const CLICK_TAIL_BARS = 4;

export function createMusicEngine(host: EngineHost) {
  let song: Song | null = null;
  let map: TickMap = createTickMap([]);
  let tempoSig = '';
  let signatures = new Map<string, string>();
  const slots = new Map<string, TrackSlot>();
  let clicksPart: Disposable | null = null;
  let metronome = false;
  let loop: LoopRegion | null = null;
  let state: EngineState = 'stopped';
  let disposed = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());

  let mixerSpec: MixerSpec | null = null;
  const syncMixer = () => {
    if (mixerSpec) host.syncMixer?.(mixerSpec, host.transport.seconds);
  };

  const setState = (next: EngineState) => {
    if (state === next) return;
    state = next;
    emit();
  };

  const endTick = (s: Song) => {
    let end = 0;
    for (const t of s.tracks)
      for (const n of t.notes) end = Math.max(end, n.startTick + n.durationTicks);
    return end;
  };

  function applyLoop() {
    if (loop && loop.endTick > loop.startTick) {
      host.transport.setLoopPoints(
        map.ticksToSeconds(loop.startTick),
        map.ticksToSeconds(loop.endTick),
      );
      host.transport.loop = true;
    } else {
      host.transport.loop = false;
    }
  }

  function scheduleClicks() {
    clicksPart?.dispose();
    clicksPart = null;
    if (!metronome || !song) return;
    const tail = MUSIC_PPQ * 4 * CLICK_TAIL_BARS;
    const loopEnd = loop ? loop.endTick : 0;
    const clicks = metronomeClicks(
      song.timeSignatures,
      Math.max(endTick(song), loopEnd) + tail,
    ).map((c) => ({
      time: map.ticksToSeconds(c.tick),
      accent: c.accent,
    }));
    clicksPart = host.scheduleClicks(clicks);
  }

  function clearSlot(id: string) {
    const slot = slots.get(id);
    if (!slot) return;
    slot.token += 1;
    slot.part?.dispose();
    slot.instrument?.dispose();
    slots.delete(id);
  }

  async function scheduleTrack(track: SongTrack, audible: boolean) {
    let slot = slots.get(track.id);
    const instrumentKey = `${track.channel}:${track.program}`;
    // A program/channel change needs a new instrument; anything else keeps the loaded one.
    if (slot && slot.instrument && slot.key !== instrumentKey) {
      clearSlot(track.id);
      slot = undefined;
    }
    if (!slot) {
      slot = { key: instrumentKey, instrument: null, part: null, token: 0 };
      slots.set(track.id, slot);
    }
    const token = (slot.token += 1);
    slot.part?.dispose();
    slot.part = null;
    if (!audible) return;
    if (!slot.instrument) {
      const instrument = await host.createInstrument(track);
      if (disposed || slot.token !== token || slots.get(track.id) !== slot) {
        instrument.dispose();
        return;
      }
      slot.instrument = instrument;
      emit();
    }
    const instrument = slot.instrument;
    slot.part = host.schedulePart(trackEvents(track, map), (note, time) =>
      instrument.play(note, time),
    );
  }

  async function syncSong(authored: Song) {
    // Clips expand to plain notes here, so the scheduler only ever sees notes.
    const next = expandClips(authored);
    const prevTempo = tempoSig;
    const nextTempo = tempoSignature(next);
    const tempoMoved = prevTempo !== nextTempo;
    if (tempoMoved) map = createTickMap(next.tempos);
    tempoSig = nextTempo;
    const diff = diffTracks(signatures, next);
    const nextSignatures = scheduleSignatures(next);
    signatures = nextSignatures;
    song = next;
    for (const id of diff.removed) clearSlot(id);
    const audible = new Set(audibleTracks(next).map((t) => t.id));
    const touched = tempoMoved ? next.tracks.map((t) => t.id) : [...diff.added, ...diff.changed];
    const byId = new Map(next.tracks.map((t) => [t.id, t] as const));
    await Promise.all(touched.map((id) => scheduleTrack(byId.get(id)!, audible.has(id))));
    if (tempoMoved || metronome) scheduleClicks();
    applyLoop();
    mixerSpec = buildMixerSpec(next, map);
    syncMixer();
  }

  return {
    /** Replaces the song. Only tracks whose notes, instrument or audibility moved are rescheduled. */
    setSong: (next: Song) => syncSong(next),
    /** Scheduled-track ids, for tests and the UI's "loading" hint. */
    loadedTrackIds: () => [...slots.entries()].filter(([, s]) => s.part).map(([id]) => id),
    /** A synth is standing in for a sampled program on at least one track. */
    hasMissingInstrument: () => [...slots.values()].some((s) => s.instrument?.missing),
    /**
     * Sound one pitch on a track's instrument, outside the transport (the piano roll's keyboard
     * gutter, and a note just drawn). Needs a click: it resumes the context like `play()`.
     */
    async previewNote(trackId: string, pitch: number, velocity = 0.8, seconds = 0.4) {
      const instrument = slots.get(trackId)?.instrument;
      if (disposed || !instrument) return;
      await host.resumeContext();
      instrument.play({ time: 0, pitch, duration: seconds, velocity }, host.now?.() ?? 0);
    },
    /** Meter levels for the mixer strips; zeros when the host has no meters (tests, offline render). */
    getLevels: (): MixerLevels => host.levels?.() ?? { tracks: {}, master: 0 },
    getState: () => state,
    getPositionTicks: () => Math.round(map.secondsToTicks(host.transport.seconds)),
    getPositionSeconds: () => host.transport.seconds,
    /** Must be called from a user gesture: the first call resumes the AudioContext. */
    async play() {
      if (disposed) return;
      await host.resumeContext();
      syncMixer();
      host.transport.start();
      setState('playing');
    },
    pause() {
      if (state !== 'playing') return;
      host.transport.pause();
      setState('paused');
    },
    stop() {
      host.transport.stop();
      host.transport.seconds = 0;
      syncMixer();
      setState('stopped');
    },
    seek(tick: number) {
      host.transport.seconds = map.ticksToSeconds(Math.max(0, tick));
      syncMixer();
      emit();
    },
    setLoop(region: LoopRegion | null) {
      loop = region;
      applyLoop();
      if (metronome) scheduleClicks();
      emit();
    },
    getLoop: () => loop,
    setMetronome(on: boolean) {
      metronome = on;
      scheduleClicks();
      emit();
    },
    getMetronome: () => metronome,
    /**
     * The window's visibility gate. Hiding pauses playback and suspends the context so a covered
     * window burns no audio thread; showing again does **not** auto-resume (resuming needs a gesture).
     */
    setHidden(hidden: boolean) {
      if (hidden) {
        if (state === 'playing') {
          host.transport.pause();
          setState('paused');
        }
        void host.suspendContext();
      }
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      disposed = true;
      for (const id of [...slots.keys()]) clearSlot(id);
      clicksPart?.dispose();
      host.dispose();
      listeners.clear();
    },
  };
}

export type MusicEngine = ReturnType<typeof createMusicEngine>;
