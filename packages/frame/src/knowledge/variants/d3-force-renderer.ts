import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

import { communityNodeId } from '../knowledge-community-collapse';
import { hashUnit } from '../knowledge-3d-scene';
import type { KnowledgeRendererCallbacks } from '../renderer-contract';
import { Base2DRenderer, ClickGate, cssToken } from './base-2d-renderer';
import { edgeRamp, fitCamera, SETTLE, settleVerdict, zoomAt, type Camera } from './d3-force-settle';
import { straightAlpha, type Node2D } from './knowledge-2d-model';

/**
 * The live `d3-force` variant (Phase 89 Theme I).
 *
 * The one variant that does NOT draw the worker's layout: it runs its own force simulation and
 * you watch the graph settle. That is the point of it, and also its cost, so the simulation is
 * governed rather than left to decay: it is driven by hand from a single frame callback with a
 * per-frame time budget (`SETTLE.frameBudgetMs`), and it stops at a HARD ceiling (`settleVerdict`:
 * alpha floor, tick ceiling or wall-clock ceiling, whichever comes first). After that no frame is
 * scheduled at all — idle CPU is zero, and the canvas only redraws on an event (pan, zoom,
 * selection, filter). Pausing (Phase 84) halts the simulation outright and unpausing resumes it.
 *
 * Drawing is own Canvas 2D: edges in three batched paths, nodes with cached straight-alpha fills.
 */
type SimNode = SimulationNodeDatum & { id: string; ref: Node2D; x: number; y: number };
type SimLink = SimulationLinkDatum<SimNode>;

const FIT_EVERY_TICKS = 10;
const DRAG_THRESHOLD_PX = 4;

export class D3ForceRenderer extends Base2DRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private sim: Simulation<SimNode, SimLink> | null = null;
  private simNodes: SimNode[] = [];
  /** Where every node last was, across model rebuilds — a collapse or expand re-seeds from it, so the graph does not explode again. */
  private readonly simPos = new Map<string, { x: number; y: number }>();
  private camera: Camera = { k: 1, x: 0, y: 0 };
  /** Set once the user pans or zooms: auto-fit then stops fighting them. */
  private userMoved = false;
  private ticks = 0;
  private maxTicks: number = SETTLE.maxTicks;
  private startedAt = 0;
  private pausedAt: number | null = null;
  private state: 'idle' | 'running' | 'settled' | 'ceiling' = 'idle';
  private simFrame: number | null = null;
  private gate: ClickGate | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cleanup: Array<() => void> = [];
  private foreground = 'hsl(0 0% 90%)';
  private accent = 'hsl(217 91% 60%)';
  private fillCache = new Map<string, string>();
  /** Edge fade-in applies to a fresh layout only; a collapse re-settle keeps its edges. */
  private rampEdges = true;
  private bucketPaint: unknown = null;
  private bucketModel: unknown = null;
  private buckets: Uint8Array = new Uint8Array(0);

  /** The simulation's lifecycle, for tests and the bake-off harness: never a UI affordance. */
  get simulationState(): { state: 'idle' | 'running' | 'settled' | 'ceiling'; ticks: number; frameScheduled: boolean } {
    return { state: this.state, ticks: this.ticks, frameScheduled: this.simFrame !== null };
  }

  protected mountEngine(): void {
    const container = this.container!;
    const callbacks = this.callbacks as KnowledgeRendererCallbacks;
    this.gate = new ClickGate(callbacks.onNodeClick, callbacks.onNodeDoubleClick);
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.cursor = 'grab';
    container.replaceChildren(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.readTokens();
    this.sizeCanvas();
    this.bindPointer(canvas);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.userMoved = false;
    this.simPos.clear();
    this.buildSim(false);
  }

  protected unmountEngine(): void {
    this.cancelSimFrame();
    this.sim?.stop();
    this.sim = null;
    this.simNodes = [];
    this.gate?.cancel();
    this.gate = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const undo of this.cleanup) undo();
    this.cleanup = [];
    this.container?.replaceChildren();
    this.canvas = null;
    this.ctx = null;
    this.state = 'idle';
    this.pausedAt = null;
  }

  /** A collapse or expand: re-seed from where nodes were and re-settle briefly. */
  protected modelChanged(): void {
    this.cancelSimFrame();
    this.sim?.stop();
    this.buildSim(true);
  }

  /** Starting the simulation IS this variant's intro: edges fade in on `edgeRamp` as the layout forms. */
  override playIntro(): void {
    if (!this.model) return;
    this.cancelSimFrame();
    this.sim?.stop();
    this.buildSim(false);
  }

  /** The worker's coordinates are not this variant's layout, so a layout switch changes nothing here. */
  override retarget(): void {}

  override setPaused(paused: boolean): void {
    const wasPaused = this.paused;
    super.setPaused(paused);
    if (paused === wasPaused) return;
    if (paused) {
      this.pausedAt = this.now();
      this.cancelSimFrame();
      return;
    }
    if (this.pausedAt !== null) this.startedAt += this.now() - this.pausedAt;
    this.pausedAt = null;
    if (this.state === 'running') this.scheduleSim();
  }

  protected override onResize(): void {
    this.sizeCanvas();
    if (!this.userMoved) this.fit();
  }

  protected override onRecolor(): void {
    this.readTokens();
    this.fillCache.clear();
  }

  protected flyTo(node: Node2D): void {
    const at = this.positions.get(node.id) ?? node;
    const size = this.viewport();
    const k = Math.max(this.camera.k, 2);
    this.camera = { k, x: size.width / 2 - at.x * k, y: size.height / 2 - at.y * k };
    this.userMoved = true;
    this.draw();
  }

  protected draw(): void {
    const ctx = this.ctx;
    const paint = this.paint;
    const model = this.model;
    if (!ctx || !this.canvas || !paint || !model) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const { width, height } = this.viewport();
    const { k, x, y } = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);

    // Edges: three batched paths (rest / dimmed / emphasised) instead of one stroke per edge. The
    // bucket of each edge is computed when the paint changes, so a simulation frame allocates nothing.
    const ramp = this.rampEdges ? edgeRamp(this.ticks) : 1;
    const buckets = this.edgeBuckets(model.links, paint);
    const styles = [
      { alpha: 0.28 * ramp, width: 0.6 },
      { alpha: 0.07 * ramp, width: 0.5 },
      { alpha: 0.85 * ramp, width: 1.4 },
    ];
    ctx.strokeStyle = this.foreground;
    for (let bucket = 0; bucket < styles.length; bucket += 1) {
      ctx.globalAlpha = styles[bucket]!.alpha;
      ctx.lineWidth = styles[bucket]!.width / k;
      ctx.beginPath();
      for (let i = 0; i < model.links.length; i += 1) {
        if (buckets[i] !== bucket) continue;
        const link = model.links[i]!;
        const a = this.positions.get(link.source);
        const b = this.positions.get(link.target);
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Nodes.
    for (const node of model.nodes) {
      if (!(paint.nodeVisible.get(node.id) ?? true)) continue;
      const at = this.positions.get(node.id);
      if (!at) continue;
      const alpha = paint.nodeAlpha.get(node.id) ?? 1;
      const r = Math.max(node.size * 0.5, 1.2) / Math.sqrt(Math.max(k, 0.05));
      ctx.beginPath();
      ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
      ctx.fillStyle = this.fill(node, alpha);
      ctx.fill();
      if (paint.selectedNodeId === node.id) {
        ctx.lineWidth = 1.5 / k;
        ctx.strokeStyle = this.accent;
        ctx.stroke();
      }
      if (alpha >= 0.85 || (k > 3 && node.degree >= 12)) {
        ctx.font = `${11 / k}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = this.foreground;
        ctx.fillText(node.label, at.x, at.y + r + 2 / k);
      }
    }
  }

  /** 0 rest, 1 dimmed, 2 emphasised, 255 hidden — recomputed only when the paint or the model changes. */
  private edgeBuckets(links: readonly { id: string }[], paint: NonNullable<D3ForceRenderer['paint']>): Uint8Array {
    if (this.bucketPaint === paint && this.bucketModel === this.model) return this.buckets;
    const out = new Uint8Array(links.length);
    for (let i = 0; i < links.length; i += 1) {
      const id = links[i]!.id;
      out[i] = !(paint.linkVisible.get(id) ?? true)
        ? 255
        : paint.linkEmphasised.has(id)
          ? 2
          : (paint.linkAlpha.get(id) ?? 1) < 0.1
            ? 1
            : 0;
    }
    this.buckets = out;
    this.bucketPaint = paint;
    this.bucketModel = this.model;
    return out;
  }

  // --- Simulation -------------------------------------------------------------------------------
  private buildSim(resettle: boolean): void {
    const model = this.model;
    if (!model) return;
    const jitter = 10 * Math.sqrt(Math.max(model.nodes.length, 1));
    const members = new Map<string, Array<{ x: number; y: number }>>();
    if (resettle && this.payload) {
      for (const raw of this.payload.nodes) {
        const at = this.simPos.get(raw.id);
        if (!at) continue;
        const list = members.get(raw.communityName) ?? [];
        list.push(at);
        members.set(raw.communityName, list);
      }
    }
    const seedFor = (node: Node2D): { x: number; y: number } => {
      const known = this.simPos.get(node.id);
      if (known) return known;
      if (resettle) {
        if (node.kind === 'community') {
          const list = members.get(node.communityName);
          if (list && list.length > 0) {
            return {
              x: list.reduce((sum, p) => sum + p.x, 0) / list.length,
              y: list.reduce((sum, p) => sum + p.y, 0) / list.length,
            };
          }
        } else {
          const meta = this.simPos.get(communityNodeId(node.communityName));
          if (meta) return { x: meta.x + (hashUnit(node.id) - 0.5) * 8, y: meta.y + (hashUnit(`${node.id}:y`) - 0.5) * 8 };
        }
      }
      return {
        x: model.centroid.x + (hashUnit(node.id) - 0.5) * jitter,
        y: model.centroid.y + (hashUnit(`${node.id}:y`) - 0.5) * jitter,
      };
    };
    this.simNodes = model.nodes.map((ref) => {
      const at = seedFor(ref);
      return { id: ref.id, ref, x: at.x, y: at.y };
    });
    const ids = new Set(this.simNodes.map((node) => node.id));
    const links: SimLink[] = model.links
      .filter((link) => ids.has(link.source) && ids.has(link.target))
      .map((link) => ({ source: link.source, target: link.target }));
    this.sim = forceSimulation<SimNode>(this.simNodes)
      .stop()
      .force('link', forceLink<SimNode, SimLink>(links).id((node) => node.id).distance(30).strength(0.3))
      .force('charge', forceManyBody<SimNode>().strength(-30).theta(0.9).distanceMax(300))
      .force('center', forceCenter(model.centroid.x, model.centroid.y))
      .alpha(resettle ? 0.6 : 1);
    this.rampEdges = !resettle;
    this.ticks = 0;
    this.maxTicks = resettle ? SETTLE.maxTicksResettle : SETTLE.maxTicks;
    this.startedAt = this.now();
    this.pausedAt = this.paused ? this.startedAt : null;
    this.state = 'running';
    this.publish();
    if (!resettle || !this.userMoved) this.fit();
    if (this.env.prefersReducedMotion() || this.paused) {
      // Reduced motion lands the settled layout at once; a paused view must not tick at all, so it
      // shows the seed layout until unpaused.
      if (!this.paused) this.runToSettle();
      this.draw();
      return;
    }
    this.draw();
    this.scheduleSim();
  }

  /** Run every remaining tick now (reduced motion): bounded by the same ceiling. */
  private runToSettle(): void {
    while (this.step()) {
      /* bounded by settleVerdict */
    }
    this.publish();
    this.fit();
  }

  /** One tick plus the verdict; returns whether the simulation should keep running. */
  private step(): boolean {
    const sim = this.sim;
    if (!sim || this.state !== 'running') return false;
    sim.tick();
    this.ticks += 1;
    const verdict = settleVerdict({
      ticks: this.ticks,
      elapsedMs: this.now() - this.startedAt,
      alpha: sim.alpha(),
      maxTicks: this.maxTicks,
    });
    if (verdict !== 'run') {
      this.state = verdict;
      return false;
    }
    return true;
  }

  private readonly simTick = (): void => {
    this.simFrame = null;
    if (this.state !== 'running' || this.paused) return;
    const began = this.now();
    let running = true;
    while (running && this.now() - began < SETTLE.frameBudgetMs) running = this.step();
    this.publish();
    if (!this.userMoved && this.ticks % FIT_EVERY_TICKS < 3) this.fit();
    this.draw();
    if (this.state === 'running') this.scheduleSim();
    else if (!this.userMoved) {
      this.fit();
      this.draw();
    }
  };

  private scheduleSim(): void {
    if (this.simFrame !== null || this.state !== 'running') return;
    const request = this.env.requestFrame ?? ((cb: () => void) => requestAnimationFrame(cb));
    this.simFrame = request(this.simTick);
  }

  private cancelSimFrame(): void {
    if (this.simFrame === null) return;
    const cancel = this.env.cancelFrame ?? ((handle: number) => cancelAnimationFrame(handle));
    cancel(this.simFrame);
    this.simFrame = null;
  }

  /** Copy the simulation's coordinates into the shared `positions` and the persistent seed map. */
  private publish(): void {
    for (const node of this.simNodes) {
      this.positions.set(node.id, { x: node.x, y: node.y });
      this.simPos.set(node.id, { x: node.x, y: node.y });
    }
  }

  // --- Camera and input -------------------------------------------------------------------------
  private viewport(): { width: number; height: number } {
    const container = this.container;
    return { width: container?.clientWidth || 800, height: container?.clientHeight || 600 };
  }

  private sizeCanvas(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const { width, height } = this.viewport();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
  }

  private fit(): void {
    if (this.simNodes.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of this.simNodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }
    this.camera = fitCamera({ minX, maxX, minY, maxY }, this.viewport());
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.camera.x) / this.camera.k, y: (sy - this.camera.y) / this.camera.k };
  }

  /** The node under a screen point, or null. Uses the simulation's own quadtree-backed `find`. */
  private hit(sx: number, sy: number): SimNode | null {
    const sim = this.sim;
    if (!sim) return null;
    const world = this.screenToWorld(sx, sy);
    const radius = 8 / this.camera.k;
    const found = sim.find(world.x, world.y, radius);
    if (!found) return null;
    return this.paint?.nodeVisible.get(found.id) === false ? null : found;
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    let down: { x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
    const local = (event: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onDown = (event: PointerEvent): void => {
      const p = local(event);
      down = { x: p.x, y: p.y, camX: this.camera.x, camY: this.camera.y, moved: false };
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (event: PointerEvent): void => {
      if (!down) return;
      const p = local(event);
      const dx = p.x - down.x;
      const dy = p.y - down.y;
      if (!down.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      down.moved = true;
      this.userMoved = true;
      this.camera = { ...this.camera, x: down.camX + dx, y: down.camY + dy };
      this.draw();
    };
    const onUp = (event: PointerEvent): void => {
      const was = down;
      down = null;
      canvas.style.cursor = 'grab';
      if (!was || was.moved) return;
      const p = local(event);
      const node = this.hit(p.x, p.y);
      if (node) this.gate?.click(node.id);
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const p = local(event);
      this.userMoved = true;
      this.camera = zoomAt(this.camera, Math.exp(-event.deltaY * 0.0015), p.x, p.y);
      this.draw();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    });
  }

  private readTokens(): void {
    this.foreground = `hsl(${cssToken('--foreground') || '0 0% 90%'})`;
    this.accent = `hsl(${cssToken('--primary') || '217 91% 60%'})`;
  }

  /** Straight-alpha fill strings cached per colour and alpha: a node repaint allocates no strings. */
  private fill(node: Node2D, alpha: number): string {
    const key = `${node.color}|${alpha}`;
    let value = this.fillCache.get(key);
    if (value === undefined) {
      value = straightAlpha(node.color, alpha);
      this.fillCache.set(key, value);
    }
    return value;
  }
}
