import { SongSchema, type Song } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createMusicEngine, type EngineHost, type InstrumentHandle } from './engine';
import type { ScheduledNote } from './scheduler';

function fakeHost() {
  const parts: { events: readonly ScheduledNote[]; disposed: boolean; fire: (n: ScheduledNote, t: number) => void }[] = [];
  const clickParts: { clicks: readonly { time: number; accent: boolean }[]; disposed: boolean }[] = [];
  const instruments: { play: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
  const transport = { start: vi.fn(), pause: vi.fn(), stop: vi.fn(), seconds: 0, loop: false, setLoopPoints: vi.fn() };
  const host: EngineHost = {
    resumeContext: vi.fn(async () => undefined),
    suspendContext: vi.fn(async () => undefined),
    transport,
    createInstrument: vi.fn(async () => {
      const inst = { play: vi.fn(), dispose: vi.fn() };
      instruments.push(inst);
      return inst as InstrumentHandle;
    }),
    schedulePart: (events, fire) => {
      const part = { events, disposed: false, fire };
      parts.push(part);
      return { dispose: () => (part.disposed = true) };
    },
    scheduleClicks: (clicks) => {
      const part = { clicks, disposed: false };
      clickParts.push(part);
      return { dispose: () => (part.disposed = true) };
    },
    dispose: vi.fn(),
  };
  return { host, parts, clickParts, instruments, transport };
}

const song = (overrides: Record<string, unknown> = {}): Song =>
  SongSchema.parse({
    tracks: [
      { id: 'a', notes: [{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 100 }] },
      { id: 'b', notes: [{ pitch: 64, startTick: 480, durationTicks: 480, velocity: 100 }] },
    ],
    ...overrides,
  });

const live = (parts: { disposed: boolean }[]) => parts.filter((p) => !p.disposed);

describe('music engine', () => {
  it('schedules one part per track with tempo-mapped times', async () => {
    const { host, parts } = fakeHost();
    const engine = createMusicEngine(host);
    await engine.setSong(song());
    expect(live(parts)).toHaveLength(2);
    expect(parts[1]!.events[0]).toMatchObject({ pitch: 64, time: 0.5, duration: 0.5 });
  });

  it('reschedules only the touched track on a note edit', async () => {
    const { host, parts, instruments } = fakeHost();
    const engine = createMusicEngine(host);
    const first = song();
    await engine.setSong(first);
    const edited = structuredClone(first);
    edited.tracks[0]!.notes.push({ pitch: 67, startTick: 960, durationTicks: 480, velocity: 90 });
    await engine.setSong(edited);
    expect(parts).toHaveLength(3);
    expect(parts[0]!.disposed).toBe(true);
    expect(parts[1]!.disposed).toBe(false);
    expect(instruments).toHaveLength(2);
  });

  it('reschedules every track when the tempo map moves', async () => {
    const { host, parts } = fakeHost();
    const engine = createMusicEngine(host);
    await engine.setSong(song());
    await engine.setSong(song({ tempos: [{ tick: 0, bpm: 60 }] }));
    expect(parts).toHaveLength(4);
    expect(parts[3]!.events[0]!.time).toBe(1);
  });

  it('drops a muted track and honors solo', async () => {
    const { host, parts } = fakeHost();
    const engine = createMusicEngine(host);
    const base = song();
    await engine.setSong(base);
    const soloed = structuredClone(base);
    soloed.tracks[1]!.mixer.solo = true;
    await engine.setSong(soloed);
    expect(live(parts)).toHaveLength(1);
    expect(parts.find((p) => !p.disposed)!.events[0]!.pitch).toBe(64);
  });

  it('plays the instrument when a part fires', async () => {
    const { host, parts, instruments } = fakeHost();
    const engine = createMusicEngine(host);
    await engine.setSong(song());
    parts[0]!.fire(parts[0]!.events[0]!, 1.5);
    expect(instruments[0]!.play).toHaveBeenCalledWith(expect.objectContaining({ pitch: 60 }), 1.5);
  });

  it('resumes the context on play and tracks state', async () => {
    const { host, transport } = fakeHost();
    const engine = createMusicEngine(host);
    const seen: string[] = [];
    engine.subscribe(() => seen.push(engine.getState()));
    await engine.play();
    expect(host.resumeContext).toHaveBeenCalled();
    expect(transport.start).toHaveBeenCalled();
    engine.pause();
    engine.stop();
    expect(seen).toEqual(['playing', 'paused', 'stopped']);
    expect(transport.seconds).toBe(0);
  });

  it('seeks in ticks through the tempo map', async () => {
    const { host, transport } = fakeHost();
    const engine = createMusicEngine(host);
    await engine.setSong(song({ tempos: [{ tick: 0, bpm: 60 }] }));
    engine.seek(480);
    expect(transport.seconds).toBe(1);
    expect(engine.getPositionTicks()).toBe(480);
  });

  it('sets loop points in seconds and turns looping off', async () => {
    const { host, transport } = fakeHost();
    const engine = createMusicEngine(host);
    await engine.setSong(song());
    engine.setLoop({ startTick: 0, endTick: 960 });
    expect(transport.setLoopPoints).toHaveBeenCalledWith(0, 1);
    expect(transport.loop).toBe(true);
    engine.setLoop(null);
    expect(transport.loop).toBe(false);
  });

  it('schedules clicks only while the metronome is on', async () => {
    const { host, clickParts } = fakeHost();
    const engine = createMusicEngine(host);
    await engine.setSong(song());
    expect(clickParts).toHaveLength(0);
    engine.setMetronome(true);
    expect(clickParts).toHaveLength(1);
    expect(clickParts[0]!.clicks[0]).toEqual({ time: 0, accent: true });
    engine.setMetronome(false);
    expect(clickParts[0]!.disposed).toBe(true);
  });

  it('pauses and suspends the context when hidden, without auto-resuming', async () => {
    const { host, transport } = fakeHost();
    const engine = createMusicEngine(host);
    await engine.play();
    engine.setHidden(true);
    expect(transport.pause).toHaveBeenCalled();
    expect(host.suspendContext).toHaveBeenCalled();
    expect(engine.getState()).toBe('paused');
    engine.setHidden(false);
    expect(engine.getState()).toBe('paused');
  });

  it('discards an instrument that finishes loading after its track was removed', async () => {
    const { host, instruments, parts } = fakeHost();
    const engine = createMusicEngine(host);
    const pending = engine.setSong(song());
    const removal = engine.setSong(song({ tracks: [] }));
    await Promise.all([pending, removal]);
    expect(live(parts)).toHaveLength(0);
    expect(instruments.every((i) => i.dispose.mock.calls.length > 0)).toBe(true);
  });
});
