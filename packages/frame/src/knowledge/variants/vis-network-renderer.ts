import { DataSet, Network, type Edge, type Node } from 'vis-network/standalone';

import { DEFAULT_NODE_ALPHA, DIMMED_ALPHA, NEIGHBOR_NODE_ALPHA } from '../knowledge-canvas-colors';
import type { KnowledgeRendererCallbacks } from '../renderer-contract';
import { Base2DRenderer, ClickGate, cssToken } from './base-2d-renderer';
import type { Node2D } from './knowledge-2d-model';

/**
 * Why this variant exists, given Phase 87 rejected vis-network (Phase 89 Theme H).
 *
 * Phase 87 turned vis-network down for the CDN, not for the library. graphify's generated
 * `graphify-out/graph.html` (line 6) loads `vis-network@9.1.6` from
 * `https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js` through a `<script src>`
 * (`.midnite/tasks/phases/phase-87-knowledge-graph-panel.md`, "The one trap"): a blank pane offline,
 * and a violation of Phase 76's renderer CSP. THIS module imports the npm-bundled
 * `vis-network/standalone` build, which Vite folds into a lazy chunk — nothing is fetched at
 * runtime, so neither objection applies. Do not delete this variant citing Phase 87, and do not
 * "fix" the import back to a script tag.
 *
 * vis-network's own physics is off (`physics: false`): the worker's coordinates are the layout
 * (Theme E), so layout pills drive it. Nodes keep their `x`/`y`; the intro moves them with
 * `moveNode`, the library's way to place a node without a simulation.
 */
const HUB_DEGREE = 12;
/** Edge opacity during the intro steps through this many levels, so an intro restyles the edge set 8 times, not every frame. */
const EDGE_FADE_STEPS = 8;

export class VisNetworkRenderer extends Base2DRenderer {
  private network: Network | null = null;
  private nodes = new DataSet<Node>();
  private edges = new DataSet<Edge>();
  private gate: ClickGate | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** The paint, colours and fade step the item loops last ran for — a positions-only frame skips them. */
  private styledFor: unknown = null;
  private styledStep = -1;
  private appliedNode = new Map<string, string>();
  private appliedEdge = new Map<string, string>();
  private movedTo = new Map<string, { x: number; y: number }>();
  private foreground = 'hsl(0 0% 90%)';
  private accent = 'hsl(217 91% 60%)';

  protected mountEngine(): void {
    const container = this.container!;
    const callbacks = this.callbacks as KnowledgeRendererCallbacks;
    this.gate = new ClickGate(callbacks.onNodeClick, callbacks.onNodeDoubleClick);
    this.readTokens();
    this.nodes = new DataSet<Node>();
    this.edges = new DataSet<Edge>();
    this.feed();
    this.network = new Network(
      container,
      { nodes: this.nodes, edges: this.edges },
      {
        physics: false,
        layout: { improvedLayout: false },
        autoResize: false,
        interaction: {
          dragNodes: false,
          hover: false,
          hideEdgesOnDrag: true,
          hideEdgesOnZoom: true,
          zoomSpeed: 0.6,
          tooltipDelay: 3_600_000,
        },
        nodes: { shape: 'dot', borderWidth: 0, font: { color: this.foreground, size: 11 } },
        edges: { smooth: false, arrows: { to: { enabled: false } }, selectionWidth: 0 },
      },
    );
    this.network.on('click', (params: { nodes: Array<string | number> }) => {
      const id = params.nodes[0];
      if (id !== undefined) this.gate?.click(String(id));
    });
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
    this.network?.destroy();
    this.network = null;
    this.nodes.clear();
    this.edges.clear();
    this.resetApplied();
  }

  protected modelChanged(): void {
    this.feed();
    this.fitToModel();
  }

  protected override onResize(): void {
    const container = this.container;
    if (!container || !this.network) return;
    this.network.setSize(`${container.clientWidth}px`, `${container.clientHeight}px`);
  }

  protected override onRecolor(): void {
    this.readTokens();
    this.network?.setOptions({ nodes: { font: { color: this.foreground } } });
    this.styledFor = null;
  }

  protected draw(): void {
    const network = this.network;
    const paint = this.paint;
    const model = this.model;
    if (!network || !paint || !model) return;

    // Positions first — the only part an intro or layout frame changes. Landed nodes keep the same
    // point object between samples, so reference equality skips them.
    for (const [id, at] of this.positions) {
      if (this.movedTo.get(id) === at) continue;
      this.movedTo.set(id, at);
      network.moveNode(id, at.x, at.y);
    }

    const step = Math.round(this.edgeScale * EDGE_FADE_STEPS);
    if (this.styledFor !== paint || this.styledStep !== step) {
      this.styledFor = paint;
      this.styledStep = step;
      const nodeUpdates: Node[] = [];
      for (const node of model.nodes) {
        const alpha = paint.nodeAlpha.get(node.id) ?? DEFAULT_NODE_ALPHA;
        const hidden = paint.nodeVisible.get(node.id) === false;
        const selected = paint.selectedNodeId === node.id;
        const labelled = alpha >= NEIGHBOR_NODE_ALPHA || (node.degree >= HUB_DEGREE && alpha > DIMMED_ALPHA);
        const signature = `${hidden}|${alpha}|${node.color}|${selected}|${labelled}`;
        if (this.appliedNode.get(node.id) === signature) continue;
        this.appliedNode.set(node.id, signature);
        nodeUpdates.push({
          id: node.id,
          hidden,
          opacity: alpha,
          color: { background: node.color, border: this.accent },
          borderWidth: selected ? 2 : 0,
          label: labelled ? node.label : undefined,
        });
      }
      if (nodeUpdates.length > 0) this.nodes.update(nodeUpdates);

      const edgeUpdates: Edge[] = [];
      for (const link of model.links) {
        const hidden = paint.linkVisible.get(link.id) === false;
        const emphasised = paint.linkEmphasised.has(link.id);
        const opacity = (paint.linkAlpha.get(link.id) ?? 1) * (step / EDGE_FADE_STEPS);
        const color = model.nodeById.get(link.source)?.color ?? 'rgb(128, 128, 128)';
        const signature = `${hidden}|${emphasised}|${opacity}|${color}`;
        if (this.appliedEdge.get(link.id) === signature) continue;
        this.appliedEdge.set(link.id, signature);
        edgeUpdates.push({
          id: link.id,
          hidden,
          width: emphasised ? 1.6 : 0.7,
          color: { color, opacity },
        });
      }
      if (edgeUpdates.length > 0) this.edges.update(edgeUpdates);
    }
    network.redraw();
  }

  protected flyTo(node: Node2D, animate: boolean): void {
    this.network?.focus(node.id, {
      scale: Math.max(this.network.getScale(), 1.6),
      animation: animate ? { duration: 500, easingFunction: 'easeInOutQuad' } : false,
    });
  }

  private readTokens(): void {
    this.foreground = `hsl(${cssToken('--foreground') || '0 0% 90%'})`;
    this.accent = `hsl(${cssToken('--primary') || '217 91% 60%'})`;
  }

  private resetApplied(): void {
    this.appliedNode.clear();
    this.appliedEdge.clear();
    this.movedTo.clear();
    this.styledFor = null;
    this.styledStep = -1;
  }

  /** Replace the data sets with the model's nodes and links — a mount, a collapse or a layout switch. */
  private feed(): void {
    const model = this.model;
    if (!model) return;
    this.resetApplied();
    this.nodes.clear();
    this.edges.clear();
    this.nodes.add(
      model.nodes.map((n) => {
        const at = this.positions.get(n.id) ?? n;
        return { id: n.id, x: at.x, y: at.y, size: Math.max(n.size * 0.8, 3), fixed: true };
      }),
    );
    this.edges.add(model.links.map((l) => ({ id: l.id, from: l.source, to: l.target })));
  }

  /** Fit to the model's FINAL coordinates — at mount the live positions are about to be the intro's collapsed start. */
  private fitToModel(): void {
    const network = this.network;
    const container = this.container;
    const model = this.model;
    if (!network || !container || !model || model.nodes.length === 0) return;
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
    network.moveTo({
      position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      scale: Math.min(Math.max(scale, 0.02), 12),
      animation: false,
    });
  }
}
