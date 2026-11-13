import ForceGraph from 'force-graph';

import { alphaForWeight } from '../knowledge-canvas-colors';
import type { KnowledgeRendererCallbacks } from '../renderer-contract';
import { Base2DRenderer, ClickGate, cssToken } from './base-2d-renderer';
import { straightAlpha, type Link2D, type Node2D } from './knowledge-2d-model';

/**
 * The `force-graph` variant's engine (Phase 89 Theme F).
 *
 * A correction to the phase doc, which calls this "WebGL": `force-graph` draws on an HTML5
 * **Canvas 2D** context — `3d-force-graph` is its WebGL sibling, and 3D is out of scope. It is
 * still the right pick for the large-graph slot: it takes plain `nodes`/`links` arrays (no
 * graphology instance), culls off-screen work, and with `autoPauseRedraw` left on it stops
 * drawing entirely while nothing changes, which is what keeps idle CPU at zero.
 *
 * The library's own d3-force simulation is OFF (`cooldownTicks(0)`): the worker's coordinates are
 * the layout (Theme E), exactly as for sigma, so a layout pill drives this variant too. The live
 * simulation you watch settle is Theme I's job, not this one's.
 */
type FgNode = { id: string; ref: Node2D; x: number; y: number };
type FgLink = { id: string; ref: Link2D; source: string | FgNode; target: string | FgNode };

export class ForceGraphRenderer extends Base2DRenderer {
  private graph: InstanceType<typeof ForceGraph> | null = null;
  private fgNodes: FgNode[] = [];
  private fgLinks: FgLink[] = [];
  private gate: ClickGate | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** Theme tokens resolved once per mount and per theme flip — `getComputedStyle` per node per frame would dominate a 15k-node repaint. */
  private foreground = 'hsl(0 0% 90%)';
  private accent = 'hsl(217 91% 60%)';

  protected mountEngine(): void {
    const container = this.container!;
    const callbacks = this.callbacks as KnowledgeRendererCallbacks;
    this.gate = new ClickGate(callbacks.onNodeClick, callbacks.onNodeDoubleClick);
    const graph = new ForceGraph(container)
      .width(container.clientWidth || 800)
      .height(container.clientHeight || 600)
      .backgroundColor('rgba(0,0,0,0)')
      .cooldownTicks(0)
      .warmupTicks(0)
      .enableNodeDrag(false)
      .nodeLabel(() => '')
      .nodeVisibility((node) => this.paint?.nodeVisible.get((node as FgNode).id) ?? true)
      .nodeCanvasObjectMode(() => 'replace')
      .nodeCanvasObject((node, ctx, scale) => this.drawNode(node as FgNode, ctx, scale))
      .nodePointerAreaPaint((node, color, ctx, scale) => {
        const n = node as FgNode;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(this.radius(n, scale), 4 / scale), 0, Math.PI * 2);
        ctx.fill();
      })
      .linkVisibility((link) => this.paint?.linkVisible.get((link as FgLink).id) ?? true)
      .linkColor((link) => this.linkColor(link as FgLink))
      .linkWidth((link) => (this.paint?.linkEmphasised.has((link as FgLink).id) ? 1.4 : 0.6))
      .onNodeClick((node) => this.gate?.click((node as FgNode).id));
    this.graph = graph;
    this.readTokens();
    this.feed();
    this.fitToModel();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
  }

  protected unmountEngine(): void {
    this.gate?.cancel();
    this.gate = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.graph?._destructor();
    this.graph = null;
    this.container?.replaceChildren();
    this.fgNodes = [];
    this.fgLinks = [];
  }

  protected modelChanged(): void {
    this.feed();
  }

  protected override onResize(): void {
    const container = this.container;
    if (!container || !this.graph) return;
    this.graph.width(container.clientWidth || 800).height(container.clientHeight || 600);
  }

  protected draw(): void {
    if (!this.graph) return;
    for (const node of this.fgNodes) {
      const at = this.positions.get(node.id);
      if (at) {
        node.x = at.x;
        node.y = at.y;
      }
    }
    // With `autoPauseRedraw` on, an accessor result changing does not repaint by itself; re-centring
    // on the current centre is the public API's cheapest way to flag one dirty frame.
    const centre = this.graph.centerAt();
    this.graph.centerAt(centre.x, centre.y);
  }

  protected flyTo(node: Node2D, animate: boolean): void {
    const graph = this.graph;
    if (!graph) return;
    const at = this.positions.get(node.id) ?? node;
    graph.centerAt(at.x, at.y, animate ? 500 : 0);
    graph.zoom(Math.max(graph.zoom(), 2.5), animate ? 500 : 0);
  }

  /** Replace the library's data with the model's nodes and links — a mount, a collapse or a layout switch. */
  private feed(): void {
    const graph = this.graph;
    const model = this.model;
    if (!graph || !model) return;
    this.fgNodes = model.nodes.map((ref) => {
      const at = this.positions.get(ref.id) ?? ref;
      return { id: ref.id, ref, x: at.x, y: at.y };
    });
    this.fgLinks = model.links.map((ref) => ({ id: ref.id, ref, source: ref.source, target: ref.target }));
    graph.graphData({ nodes: this.fgNodes, links: this.fgLinks });
  }

  protected override onRecolor(): void {
    this.readTokens();
  }

  private readTokens(): void {
    this.foreground = `hsl(${cssToken('--foreground') || '0 0% 90%'})`;
    this.accent = `hsl(${cssToken('--primary') || '217 91% 60%'})`;
  }

  /**
   * Fit the camera to the model's FINAL coordinates, computed here rather than with `zoomToFit`: that
   * measures the nodes' CURRENT positions, which at mount are the intro's collapsed start (one
   * point), and force-graph digests `graphData` a tick later than this call. Doing it from the
   * model is independent of both.
   */
  private fitToModel(): void {
    const graph = this.graph;
    const container = this.container;
    const model = this.model;
    if (!graph || !container || !model || model.nodes.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of model.nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const scale = Math.min((width - 80) / Math.max(maxX - minX, 1), (height - 80) / Math.max(maxY - minY, 1));
    graph.centerAt((minX + maxX) / 2, (minY + maxY) / 2, 0);
    graph.zoom(Math.min(Math.max(scale, 0.02), 12), 0);
  }

  private radius(node: FgNode, scale: number): number {
    return Math.max(node.ref.size * 0.5, 1.2) / Math.sqrt(Math.max(scale, 0.05));
  }

  private linkColor(link: FgLink): string {
    const ref = link.ref;
    const base = (this.model?.nodeById.get(ref.source)?.color) ?? 'rgb(128, 128, 128)';
    const alpha = (this.paint?.linkAlpha.get(ref.id) ?? alphaForWeight(ref.weight)) * this.edgeScale;
    return straightAlpha(base, alpha);
  }

  private drawNode(node: FgNode, ctx: CanvasRenderingContext2D, scale: number): void {
    const alpha = this.paint?.nodeAlpha.get(node.id) ?? 1;
    const r = this.radius(node, scale);
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = straightAlpha(node.ref.color, alpha);
    ctx.fill();
    if (this.paint?.selectedNodeId === node.id) {
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = this.accent;
      ctx.stroke();
    }
    // Labels: only what the highlight lights up, or hubs once zoomed in — the label LOD sigma applies.
    const lit = alpha >= 0.85;
    if (lit || (scale > 3 && node.ref.degree >= 12)) {
      ctx.font = `${11 / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = this.foreground;
      ctx.fillText(node.ref.label, node.x, node.y + r + 2 / scale);
    }
  }
}
