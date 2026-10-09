import type * as ToneNs from 'tone';

import {
  gainToDb,
  chainShapeKey,
  lanesKey,
  stripValuesAt,
  type ChainNode,
  type MixerSpec,
  type StripSpec,
} from './mixer-spec';
import type { MixerLevels } from './engine';

/**
 * The Tone.js half of the mixer (Phase 101 Theme F): builds channel strips, effect nodes, meters and
 * automation from a {@link MixerSpec}. Every decision was already made in `mixer-spec.ts`; this file
 * only maps it onto audio nodes, which is why it is the part with no unit tests. Used by the live
 * host and by the offline render, so an exported WAV sounds like playback.
 *
 * Only a type-only import of `tone` here — the module itself is passed in, so the lazy chunk stays one.
 */
type ToneModule = typeof ToneNs;
type FxNode = {
  connect: (destination: unknown) => unknown;
  disconnect: () => unknown;
  dispose: () => unknown;
  set: (options: Record<string, unknown>) => unknown;
};
export type TransportLike = {
  schedule: (cb: (time: number) => void, at: number) => number;
  clear: (id: number) => unknown;
};

type Strip = {
  input: ToneNs.Gain;
  channel: ToneNs.Channel;
  meter: ToneNs.Meter;
  nodes: Map<string, { node: FxNode; type: string; last: Record<string, number> }>;
  shapeKey: string;
  lanes: string;
  scheduled: number[];
};

function createEffectNode(Tone: ToneModule, node: ChainNode): FxNode {
  const p = node.params;
  switch (node.type) {
    case 'reverb':
      return new Tone.Reverb({
        decay: p.decay,
        preDelay: p.preDelay,
        wet: p.wet,
      }) as unknown as FxNode;
    case 'delay':
      return new Tone.FeedbackDelay({
        delayTime: p.delayTime,
        feedback: p.feedback,
        wet: p.wet,
      }) as unknown as FxNode;
    case 'eq3':
      return new Tone.EQ3({ low: p.low, mid: p.mid, high: p.high }) as unknown as FxNode;
    case 'compressor':
      return new Tone.Compressor({
        threshold: p.threshold,
        ratio: p.ratio,
        attack: p.attack,
        release: p.release,
      }) as unknown as FxNode;
    case 'chorus':
      return new Tone.Chorus({
        frequency: p.frequency,
        delayTime: 3.5,
        depth: p.depth,
        wet: p.wet,
      }).start() as unknown as FxNode;
    case 'distortion':
      return new Tone.Distortion({ distortion: p.distortion, wet: p.wet }) as unknown as FxNode;
    default:
      return new Tone.Filter({
        type: 'lowpass',
        frequency: p.frequency,
        Q: p.Q,
      }) as unknown as FxNode;
  }
}

/** dB to a 0..1 meter position over a 60 dB window. */
const meterLevel = (db: number): number =>
  Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0;
const readMeter = (m: ToneNs.Meter): number => {
  const v = m.getValue();
  return meterLevel(Array.isArray(v) ? Math.max(...v) : v);
};

export function createToneMixer(Tone: ToneModule, transport: TransportLike) {
  const master = new Tone.Channel();
  const masterMeter = new Tone.Meter({ smoothing: 0.8 });
  master.connect(masterMeter);
  master.toDestination();
  const strips = new Map<string, Strip>();

  function ensureStrip(trackId: string): Strip {
    let strip = strips.get(trackId);
    if (strip) return strip;
    const channel = new Tone.Channel();
    const meter = new Tone.Meter({ smoothing: 0.8 });
    channel.connect(meter);
    channel.connect(master);
    const input = new Tone.Gain(1);
    input.connect(channel);
    strip = { input, channel, meter, nodes: new Map(), shapeKey: '', lanes: '', scheduled: [] };
    strips.set(trackId, strip);
    return strip;
  }

  function rebuildChain(strip: Strip, chain: readonly ChainNode[]) {
    const wanted = new Set(chain.map((n) => n.id));
    for (const [id, entry] of strip.nodes) {
      if (!wanted.has(id)) {
        entry.node.disconnect();
        entry.node.dispose();
        strip.nodes.delete(id);
      }
    }
    for (const spec of chain) {
      const existing = strip.nodes.get(spec.id);
      if (existing && existing.type !== spec.type) {
        existing.node.disconnect();
        existing.node.dispose();
        strip.nodes.delete(spec.id);
      }
      if (!strip.nodes.has(spec.id))
        strip.nodes.set(spec.id, {
          node: createEffectNode(Tone, spec),
          type: spec.type,
          last: { ...spec.params },
        });
    }
    strip.input.disconnect();
    for (const entry of strip.nodes.values()) entry.node.disconnect();
    let previous: ToneNs.ToneAudioNode = strip.input;
    for (const spec of chain) {
      const node = strip.nodes.get(spec.id)!.node as unknown as ToneNs.ToneAudioNode;
      previous.connect(node);
      previous = node;
    }
    previous.connect(strip.channel);
  }

  function setEffectValue(strip: Strip, effectId: string, param: string, value: number) {
    const entry = strip.nodes.get(effectId);
    if (!entry || !Number.isFinite(value) || entry.last[param] === value) return;
    entry.last[param] = value;
    entry.node.set({ [param]: value });
  }

  function applyStatic(strip: Strip, spec: StripSpec, seconds: number) {
    const at = stripValuesAt(spec, seconds);
    strip.channel.volume.value = gainToDb(at.gain);
    strip.channel.pan.value = at.pan;
    for (const node of spec.chain) {
      for (const [param, fallback] of Object.entries(node.params)) {
        setEffectValue(strip, node.id, param, at.effects[node.id]?.[param] ?? fallback);
      }
    }
  }

  function scheduleLanes(strip: Strip, spec: StripSpec) {
    for (const id of strip.scheduled) transport.clear(id);
    strip.scheduled = [];
    for (const lane of spec.lanes) {
      for (const event of lane.events) {
        strip.scheduled.push(
          transport.schedule((time) => {
            if (lane.kind === 'volume') {
              if (!spec.silenced) strip.channel.volume.setValueAtTime(gainToDb(event.value), time);
            } else if (lane.kind === 'pan') strip.channel.pan.setValueAtTime(event.value, time);
            else setEffectValue(strip, lane.effectId, lane.param, event.value);
          }, event.time),
        );
      }
    }
  }

  return {
    /** Create the strip a new instrument plugs into. */
    inputFor: (trackId: string): ToneNs.Gain => ensureStrip(trackId).input,
    sync(spec: MixerSpec, seconds: number) {
      for (const [id, strip] of strips) {
        if (spec.tracks[id]) continue;
        for (const t of strip.scheduled) transport.clear(t);
        for (const entry of strip.nodes.values()) entry.node.dispose();
        strip.input.dispose();
        strip.channel.dispose();
        strip.meter.dispose();
        strips.delete(id);
      }
      for (const [id, trackSpec] of Object.entries(spec.tracks)) {
        const strip = ensureStrip(id);
        const shape = chainShapeKey(trackSpec.chain);
        if (shape !== strip.shapeKey) {
          rebuildChain(strip, trackSpec.chain);
          strip.shapeKey = shape;
        }
        const lanes = lanesKey(trackSpec);
        if (lanes !== strip.lanes) {
          scheduleLanes(strip, trackSpec);
          strip.lanes = lanes;
        }
        applyStatic(strip, trackSpec, seconds);
      }
      master.volume.value = gainToDb(spec.master.gain);
      master.pan.value = spec.master.pan;
    },
    levels(): MixerLevels {
      const tracks: Record<string, number> = {};
      for (const [id, strip] of strips) tracks[id] = readMeter(strip.meter);
      return { tracks, master: readMeter(masterMeter) };
    },
    dispose() {
      for (const strip of strips.values()) {
        for (const t of strip.scheduled) transport.clear(t);
        for (const entry of strip.nodes.values()) entry.node.dispose();
        strip.input.dispose();
        strip.channel.dispose();
        strip.meter.dispose();
      }
      strips.clear();
      master.dispose();
      masterMeter.dispose();
    },
  };
}

export type ToneMixer = ReturnType<typeof createToneMixer>;
