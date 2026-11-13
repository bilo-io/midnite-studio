import { useCallback, useEffect, useRef, useState } from 'react';

import { ScenarioPanel } from '../components/scenario-panel';
import { Sparkline } from '../components/sparkline';
import { SimCanvasFrame, Transport } from '../components/transport';
import { useSim } from '../engine/sim-worker-factory';
import type { TicksPerFrame } from '../engine/types';
import { BOIDS_DEFAULTS, BOIDS_MAX, BOIDS_MIN, BOIDS_STRIDE, type BoidsParams } from '../sims/boids';
import { AGENT_CAP, PREDPREY_DEFAULTS, PREDPREY_STRIDE, type PredPreyParams } from '../sims/predprey';
import { decodeBoidsState, decodePredPreyState, parseBoidsParams, parsePredPreyParams } from '../sims/scenario-codec';
import type { SimScenario } from '@midnite/studio-shared';
import { AgentsScene, type AgentStoreRef } from './agents-scene';

type Env = 'boids' | 'predprey';

const ACCENT = '#6366f1';
const BOID_COLOURS: [string, string] = [ACCENT, ACCENT];
const PREDPREY_COLOURS: [string, string] = ['#22c55e', '#ef4444'];
/** The last stretch of population counts the sparkline keeps (one sample per drawn frame). */
export const HISTORY = 2000;

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-12 text-right tabular-nums">{value}</span>
    </label>
  );
}

/** Agent environments: flocking and predator-prey (Phase 127 Theme E). */
export function AgentsView() {
  const [env, setEnv] = useState<Env>('boids');
  const [boids, setBoids] = useState<BoidsParams>(BOIDS_DEFAULTS);
  const [pp, setPP] = useState<PredPreyParams>(PREDPREY_DEFAULTS);
  const [seed, setSeed] = useState(1);
  const [speed, setSpeed] = useState<TicksPerFrame>(1);
  const params = env === 'boids' ? boids : pp;
  const store = useRef<AgentStoreRef['current']>({ data: new Float32Array(0), len: 0 }) as AgentStoreRef;
  const history = useRef<{ prey: number[]; predators: number[] }>({ prey: [], predators: [] });

  const onFrame = useCallback(({ data, stats }: { data: Float32Array; stats: Record<string, number> }) => {
    const s = store.current;
    if (s.data.length < data.length) s.data = new Float32Array(data.length);
    s.data.set(data);
    s.len = data.length;
    if (stats.prey !== undefined) {
      const h = history.current;
      h.prey.push(stats.prey);
      h.predators.push(stats.predators ?? 0);
      if (h.prey.length > HISTORY) {
        h.prey.shift();
        h.predators.shift();
      }
    }
  }, []);
  const sim = useSim(env, { params, seed, onFrame });

  // A params, seed or environment change re-inits the engine (the hook did the first init on mount).
  const first = useRef(true);
  useEffect(() => {
    store.current.len = 0;
    history.current = { prey: [], predators: [] };
    if (first.current) {
      first.current = false;
      return;
    }
    sim.reset();
    // `sim` is a fresh object each render; only these inputs should re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, seed]);

  // A loaded scenario's state is restored once the reset its params trigger has run.
  const pending = useRef<{ env: Env; state: unknown } | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  useEffect(() => {
    const p = pending.current;
    if (p === null || p.env !== env) return;
    pending.current = null;
    sim.restore(p.state);
    // `sim` is a fresh object each render; only a load should restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTick]);

  const capture = async () => ({ seed, params: { ...params }, state: await sim.serialise() });

  const apply = (scenario: SimScenario): string | null => {
    if (scenario.kind === 'boids') {
      const next = parseBoidsParams(scenario.params);
      const state = next === null || scenario.state === undefined ? null : decodeBoidsState(scenario.state, next);
      if (next === null || (scenario.state !== undefined && state === null)) return 'invalid';
      setEnv('boids');
      setBoids(next);
      pending.current = state === null ? null : { env: 'boids', state };
    } else if (scenario.kind === 'predprey') {
      const next = parsePredPreyParams(scenario.params);
      const state = next === null || scenario.state === undefined ? null : decodePredPreyState(scenario.state);
      if (next === null || (scenario.state !== undefined && state === null)) return 'invalid';
      setEnv('predprey');
      setPP(next);
      pending.current = state === null ? null : { env: 'predprey', state };
    } else return 'invalid';
    setSeed(scenario.seed);
    setLoadTick((n) => n + 1);
    return null;
  };

  const series = [
    { label: 'Prey', color: PREDPREY_COLOURS[0], values: history.current.prey },
    { label: 'Predators', color: PREDPREY_COLOURS[1], values: history.current.predators },
  ];
  const stride = env === 'boids' ? BOIDS_STRIDE : PREDPREY_STRIDE;

  return (
    <section aria-label="Agent environments" className="flex h-full flex-col">
      <h1 className="sr-only">Agent environments</h1>
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
        stats={env === 'boids' ? sim.stats : { prey: sim.stats.prey ?? 0, predators: sim.stats.predators ?? 0 }}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <SimCanvasFrame playing={sim.playing} onPlay={sim.play} onPause={sim.pause} onStep={sim.step}>
            <div className="h-[calc(100vh-18rem)] min-h-64">
              <AgentsScene
                key={env}
                store={store}
                box={params.box}
                stride={stride}
                max={env === 'boids' ? BOIDS_MAX : AGENT_CAP}
                colors={env === 'boids' ? BOID_COLOURS : PREDPREY_COLOURS}
              />
            </div>
          </SimCanvasFrame>
          {env === 'predprey' && (
            <div className="border-t border-border p-2">
              <Sparkline series={series} />
              {sim.stats.atCap === 1 && (
                <p role="status" className="text-xs text-muted-foreground">
                  Population cap reached
                </p>
              )}
            </div>
          )}
        </div>
        <aside aria-label="Environment settings" className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-l border-border p-3 text-sm">
          <div role="radiogroup" aria-label="Environment" className="flex gap-1">
            {(['boids', 'predprey'] as const).map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={env === e}
                onClick={() => setEnv(e)}
                className={`flex-1 rounded border border-border px-2 py-1 text-xs ${env === e ? 'bg-accent text-accent-foreground' : ''}`}
              >
                {e === 'boids' ? 'Flocking' : 'Predator–prey'}
              </button>
            ))}
          </div>
          {sim.error !== null && (
            <p role="alert" className="text-xs text-destructive">
              {sim.error}
            </p>
          )}
          {env === 'boids' ? (
            <>
              <Slider label="Count" value={boids.count} min={BOIDS_MIN} max={BOIDS_MAX} step={10} onChange={(count) => setBoids({ ...boids, count })} />
              <Slider label="Separation" value={boids.separation} min={0} max={5} step={0.1} onChange={(separation) => setBoids({ ...boids, separation })} />
              <Slider label="Alignment" value={boids.alignment} min={0} max={5} step={0.1} onChange={(alignment) => setBoids({ ...boids, alignment })} />
              <Slider label="Cohesion" value={boids.cohesion} min={0} max={5} step={0.1} onChange={(cohesion) => setBoids({ ...boids, cohesion })} />
              <Slider label="Radius" value={boids.radius} min={1} max={20} step={0.5} onChange={(radius) => setBoids({ ...boids, radius })} />
              <Slider label="Max speed" value={boids.maxSpeed} min={1} max={12} step={0.5} onChange={(maxSpeed) => setBoids({ ...boids, maxSpeed })} />
            </>
          ) : (
            <>
              <Slider label="Prey" value={pp.prey} min={0} max={2000} step={10} onChange={(prey) => setPP({ ...pp, prey })} />
              <Slider label="Predators" value={pp.predators} min={0} max={500} step={5} onChange={(predators) => setPP({ ...pp, predators })} />
              <Slider label="Prey birth" value={pp.preyBirth} min={0} max={0.05} step={0.001} onChange={(preyBirth) => setPP({ ...pp, preyBirth })} />
              <Slider label="Predator birth" value={pp.predatorBirth} min={0} max={0.2} step={0.005} onChange={(predatorBirth) => setPP({ ...pp, predatorBirth })} />
              <Slider label="Eat gain" value={pp.eatGain} min={5} max={80} step={5} onChange={(eatGain) => setPP({ ...pp, eatGain })} />
            </>
          )}
          <ScenarioPanel kinds={['boids', 'predprey']} kind={env} capture={capture} apply={apply} />
        </aside>
      </div>
    </section>
  );
}
