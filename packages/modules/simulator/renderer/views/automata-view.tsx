import { useEffect, useRef, useState } from 'react';

import { SimCanvasFrame, Transport } from '../components/transport';
import { useSim } from '../engine/sim-worker-factory';
import type { SimFrame } from '../engine/use-sim';
import type { TicksPerFrame } from '../engine/types';
import { ELEMENTARY_DEFAULTS, ELEMENTARY_MAX_WIDTH, ELEMENTARY_MIN_WIDTH, type ElementaryParams } from '../sims/elementary';
import { fillImage, paintCells, stampPattern, type View } from '../sims/grid';
import { LIFE_DEFAULTS, LIFE_MAX, LIFE_MIN, type LifeParams } from '../sims/life';
import type { RlePattern } from '../sims/rle';
import { AutomataCanvas } from './automata-canvas';
import { AutomataPanel, type Mode } from './automata-panel';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
/** The grid the engine will build for these params (it clamps the same way). */
const lifeSize = (p: LifeParams): [number, number] => [clamp(p.width, LIFE_MIN, LIFE_MAX), clamp(p.height, LIFE_MIN, LIFE_MAX)];
const elementarySize = (p: ElementaryParams): [number, number] => [clamp(p.width, ELEMENTARY_MIN_WIDTH, ELEMENTARY_MAX_WIDTH), clamp(p.height, 32, 1024)];
const POST_EVERY_MS = 50;

/**
 * Emergence: Life-like and elementary cellular automata (Phase 127 Theme C.4). Opens on a seeded random Life
 * grid, paused, so it is never blank. The worker owns the generations; edits go back as a `restore`.
 */
export function AutomataView() {
  const [mode, setMode] = useState<Mode>('life');
  const [life, setLife] = useState<LifeParams>(LIFE_DEFAULTS);
  const [elementary, setElementary] = useState<ElementaryParams>(ELEMENTARY_DEFAULTS);
  const [seed, setSeed] = useState(42);
  const [speed, setSpeed] = useState<TicksPerFrame>(1);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });

  const [w, h] = mode === 'life' ? lifeSize(life) : elementarySize(elementary);
  const dims = useRef<[number, number]>([w, h]);
  dims.current = [w, h];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const image = useRef<ImageData | null>(null);
  /** The last frame as 0/1 cells: what the next stroke edits. */
  const grid = useRef<Uint8Array | null>(null);
  const generation = useRef(0);
  const lastPost = useRef(0);

  const draw = (cells: ArrayLike<number>) => {
    const [gw, gh] = dims.current;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (image.current === null || image.current.width !== gw || image.current.height !== gh) image.current = ctx.createImageData(gw, gh);
    fillImage(image.current, cells, gw * gh);
    ctx.putImageData(image.current, 0, 0);
  };

  const onFrame = (frame: SimFrame) => {
    const [gw, gh] = dims.current;
    // A frame from before a size change is the wrong shape; the re-init's own frame follows.
    if (frame.data.length !== gw * gh) return;
    if (grid.current === null || grid.current.length !== gw * gh) grid.current = new Uint8Array(gw * gh);
    for (let i = 0; i < grid.current.length; i++) grid.current[i] = frame.data[i]! > 0.5 ? 1 : 0;
    generation.current = frame.stats.generation ?? 0;
    draw(frame.data);
  };

  const sim = useSim(mode, { params: mode === 'life' ? life : elementary, seed, onFrame });
  const resetRef = useRef(sim.reset);
  resetRef.current = sim.reset;
  const setSpeedRef = useRef(sim.setSpeed);
  setSpeedRef.current = sim.setSpeed;

  // New params or seed re-init the engine; the first run is the hook's own init.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    grid.current = null;
    resetRef.current();
  }, [life, elementary, seed]);
  useEffect(() => {
    grid.current = null;
    setSpeedRef.current(speed);
  }, [mode, speed]);

  const post = () => {
    if (grid.current === null) return;
    lastPost.current = Date.now();
    sim.restore({ width: dims.current[0], height: dims.current[1], cells: grid.current.slice(), generation: generation.current });
  };

  const onStroke = (cells: [number, number][], erase: boolean, final: boolean) => {
    if (grid.current === null) return;
    const changed = paintCells(grid.current, dims.current[0], dims.current[1], cells, erase ? 0 : 1);
    if (changed > 0) draw(grid.current);
    if (final || (changed > 0 && Date.now() - lastPost.current >= POST_EVERY_MS)) post();
  };

  const onStamp = (pattern: RlePattern): string | null => {
    if (grid.current === null) return 'The grid is not ready yet';
    const [gw, gh] = dims.current;
    stampPattern(grid.current, gw, gh, pattern.cells, Math.floor((gw - pattern.width) / 2), Math.floor((gh - pattern.height) / 2));
    draw(grid.current);
    post();
    return null;
  };

  return (
    <section aria-label="Emergence" className="flex h-full min-h-0 flex-col">
      <Transport
        playing={sim.playing}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
        speed={speed}
        onSpeed={setSpeed}
        seed={seed}
        onSeed={setSeed}
        tick={sim.tick}
        stats={sim.stats}
      />
      {sim.error !== null && (
        <p role="alert" className="px-3 py-1 text-xs text-destructive">
          {sim.error}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <SimCanvasFrame className="flex min-h-0 min-w-0 flex-1" playing={sim.playing} onPlay={sim.play} onPause={sim.pause} onStep={sim.step}>
          <AutomataCanvas w={w} h={h} canvasRef={canvasRef} view={view} onView={setView} editable={mode === 'life'} onStroke={onStroke} />
        </SimCanvasFrame>
        <AutomataPanel
          mode={mode}
          onMode={setMode}
          life={life}
          onLife={setLife}
          elementary={elementary}
          onElementary={setElementary}
          onStamp={onStamp}
          gridSize={[w, h]}
        />
      </div>
    </section>
  );
}
