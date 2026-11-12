import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import { useFrameChrome } from '@midnite/studio-frame';

import { SimCanvasFrame, Transport } from '../components/transport';
import { useSim } from '../engine/sim-worker-factory';
import type { TicksPerFrame } from '../engine/types';
import { MAX_BODIES, type Body, type NBodyParams } from '../sims/nbody';
import { NBODY_PRESETS, presetParams, type NBodyPresetId } from '../sims/nbody-presets';
import { createTrails } from '../sims/trails';
import { NBodyScene, type CameraTarget, type NBodyStore } from './nbody-scene';

const PALETTE = ['#f472b6', '#a78bfa', '#34d399', '#fb923c', '#22d3ee', '#facc15'];

/** Four significant figures, the read-out the phase asks for. */
export const sig4 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '—' : v === 0 ? '0' : v.toPrecision(4));

/** The furthest body from the origin, which sets how far back the camera starts. */
const extent = (bodies: Body[]) => Math.max(1, ...bodies.map((b) => Math.hypot(b.x, b.y, b.z))) * 2.5;

/** The right side panel's number field: edits locally, applies a valid value on Enter or blur, otherwise reverts. */
function NumberField({ label, value, valid, onCommit }: { label: string; value: number; valid: (n: number) => boolean; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = Number(draft);
  const bad = draft !== null && (draft.trim() === '' || !Number.isFinite(n) || !valid(n));
  const commit = () => {
    if (draft !== null && !bad) onCommit(n);
    setDraft(null);
  };
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <input
        aria-label={label}
        aria-invalid={bad}
        className={`w-28 rounded border bg-background px-1 py-0.5 tabular-nums ${bad ? 'border-destructive' : 'border-border'}`}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setDraft(null);
        }}
        onBlur={commit}
      />
    </label>
  );
}

/** Virtual worlds: n-body gravity (Phase 127 Theme D). */
export function WorldsView() {
  const { IconButton } = useFrameChrome();
  const [presetId, setPresetId] = useState<NBodyPresetId>('sun-earth-moon');
  const [params, setParams] = useState<NBodyParams>(() => presetParams('sun-earth-moon'));
  const [seed, setSeed] = useState(1);
  const [speed, setSpeed] = useState<TicksPerFrame>(1);
  const [bodyScale, setBodyScale] = useState(100);
  const [trails, setTrails] = useState(true);
  const target = useRef<CameraTarget>({ x: 0, y: 0, z: 0 });
  const store = useRef<NBodyStore>({ positions: new Float32Array(0), trails: createTrails(0) });

  const onFrame = useCallback(({ data }: { data: Float32Array }) => {
    const s = store.current;
    if (data.length !== s.trails.count * 3) return; // a frame from before the latest re-init
    if (s.positions.length !== data.length) s.positions = new Float32Array(data.length);
    s.positions.set(data);
    s.trails.push(s.positions);
  }, []);
  const sim = useSim('nbody', { params, seed, onFrame });

  // Every params change re-inits the engine (the hook has already done the first init on mount).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    store.current = { positions: new Float32Array(3 * params.bodies.length), trails: createTrails(params.bodies.length) };
    sim.reset();
    // `sim` is a fresh object each render; only a params or seed change should re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, seed]);
  useEffect(() => {
    store.current = { positions: new Float32Array(3 * params.bodies.length), trails: createTrails(params.bodies.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id: NBodyPresetId) => {
    const next = presetParams(id);
    setPresetId(id);
    setParams(next);
    setBodyScale(next.G === 1 ? 1 : 50);
    target.current = { x: 0, y: 0, z: 0 };
  };
  const atLimit = params.bodies.length >= MAX_BODIES;
  const addBody = () => {
    const t = target.current;
    const mass = Math.min(...params.bodies.map((b) => b.mass), 1);
    const n = params.bodies.length;
    const radius = Math.min(...params.bodies.map((b) => b.radius), 1);
    const body: Body = { name: `Body ${n + 1}`, mass, x: t.x, y: t.y, z: t.z, vx: 0, vy: 0, vz: 0, color: PALETTE[n % PALETTE.length]!, radius };
    setParams({ ...params, bodies: [...params.bodies, body] });
  };
  const distance = useMemo(() => extent(params.bodies), [params.bodies]);

  return (
    <section aria-label="Virtual worlds" className="flex h-full flex-col">
      <h1 className="sr-only">Virtual worlds</h1>
      <Transport
        playing={sim.playing}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
        speed={speed}
        onSpeed={(s) => {
          setSpeed(s);
          sim.setSpeed(s);
        }}
        seed={seed}
        onSeed={setSeed}
        tick={sim.tick}
        stats={{}}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <SimCanvasFrame playing={sim.playing} onPlay={sim.play} onPause={sim.pause} onStep={sim.step}>
            <div className="h-[calc(100vh-12rem)] min-h-64">
              <NBodyScene bodies={params.bodies} store={store} bodyScale={bodyScale} trails={trails} distance={distance} target={target.current} />
            </div>
          </SimCanvasFrame>
        </div>
        <aside aria-label="World settings" className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-l border-border p-3 text-sm">
          <label className="flex flex-col gap-1 text-xs">
            Preset
            <select aria-label="Preset" className="rounded border border-border bg-background px-1 py-1 text-sm" value={presetId} onChange={(e) => choose(e.target.value as NBodyPresetId)}>
              {NBODY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <NumberField label="dt" value={params.dt} valid={(n) => n > 0} onCommit={(dt) => setParams({ ...params, dt })} />
          <NumberField label="Softening" value={params.softening} valid={(n) => n >= 0} onCommit={(softening) => setParams({ ...params, softening })} />
          <label className="flex items-center justify-between gap-2 text-xs">
            Body scale
            <input aria-label="Body scale" type="range" min={1} max={1000} value={bodyScale} onChange={(e) => setBodyScale(Number(e.target.value))} />
            <span className="w-10 text-right tabular-nums">{bodyScale}×</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" aria-label="Trails" checked={trails} onChange={(e) => setTrails(e.target.checked)} />
            Trails
          </label>
          <dl aria-label="Energy" className="grid grid-cols-2 gap-x-2 rounded border border-border p-2 text-xs tabular-nums">
            <dt className="text-muted-foreground">Energy</dt>
            <dd data-testid="energy">{sig4(sim.stats.energy)}</dd>
            <dt className="text-muted-foreground">Energy drift</dt>
            <dd data-testid="energy-drift">{sig4(sim.stats.energyDrift)}</dd>
          </dl>
          {sim.error !== null && (
            <p role="alert" className="text-xs text-destructive">
              {sim.error}
            </p>
          )}
          <table aria-label="Bodies" className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th>Name</th>
                <th>Mass</th>
                <th aria-label="Colour" />
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {params.bodies.map((b, i) => (
                <tr key={`${i}-${b.name}`}>
                  <td className="truncate pr-1">{b.name}</td>
                  <td className="tabular-nums pr-1">{b.mass.toPrecision(3)}</td>
                  <td>
                    <span className="inline-block size-3 rounded-full align-middle" style={{ background: b.color }} />
                  </td>
                  <td>
                    <IconButton icon={LuTrash2} label={`Remove ${b.name}`} onClick={() => setParams({ ...params, bodies: params.bodies.filter((_, k) => k !== i) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <IconButton icon={LuPlus} label="Add body" onClick={addBody} disabled={atLimit} />
            {atLimit && <span className="text-xs text-muted-foreground">{MAX_BODIES} bodies is the limit</span>}
          </div>
        </aside>
      </div>
    </section>
  );
}
