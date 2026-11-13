import cytoscape, { type Core, type EdgeSingular, type NodeSingular, type StylesheetJson } from 'cytoscape';

import { DEFAULT_NODE_ALPHA, DIMMED_ALPHA, NEIGHBOR_NODE_ALPHA } from '../knowledge-canvas-colors';
import type { KnowledgeRendererCallbacks } from '../renderer-contract';
import { Base2DRenderer, ClickGate, cssToken } from './base-2d-renderer';
import { type Node2D } from './knowledge-2d-model';

/**
 * The `cytoscape` variant's engine (Phase 89 Theme G).
 *
 * Built in cytoscape's own idiom rather than fought into sigma's shape: the Theme C alpha states are
 * **stylesheet selectors** (`node.dim`, `node.neighbor`, `node.focus`, `edge.emph`) and the engine
 * only toggles classes; positions come from the `preset` layout, i.e. the worker's coordinates
 * (Theme E), so layout pills drive it; the intro is the base class's per-frame position tween
 * written through `batch()`.
 *
 * Canvas-based and the slowest engine in the set at 15k nodes — deliberately not tuned into a number
 * it cannot hold. Theme J's gate is what keeps it off a graph it cannot carry. `haystack` edges and
 * `hideEdgesOnViewport` are the two settings cytoscape's own performance guide asks for at this
 * size, not a tuning pass.
 */
const HUB_DEGREE = 12;
/** Edge opacity during the intro is quantised to this many steps: restyling 37k edges every frame would cost more than the burst. */
const EDGE_FADE_STEPS = 8;

function stylesheet(): StylesheetJson {
  const foreground = `hsl(${cssToken('--foreground') || '0 0% 90%'})`;
  const primary = `hsl(${cssToken('--primary') || '217 91% 60%'})`;
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        'background-opacity': DEFAULT_NODE_ALPHA,
        width: 'data(size)',
        height: 'data(size)',
        'border-width': 0,
        color: foreground,
        'font-size': 10,
        'text-valign': 'bottom',
        'text-margin-y': 3,
      },
    },
    { selector: 'node.hub', style: { label: 'data(label)', 'min-zoomed-font-size': 9 } },
    { selector: 'node.neighbor', style: { 'background-opacity': NEIGHBOR_NODE_ALPHA, label: 'data(label)' } },
    { selector: 'node.focus', style: { 'background-opacity': 1, label: 'data(label)' } },
    { selector: 'node.dim', style: { 'background-opacity': DIMMED_ALPHA, label: '' } },
    { selector: 'node.selected', style: { 'border-width': 2, 'border-color': primary } },
    { selector: 'node.hidden, edge.hidden', style: { display: 'none' } },
    {
      selector: 'edge',
      style: {
        'curve-style': 'haystack',
        'haystack-radius': 0,
        width: 0.6,
        'line-color': 'data(color)',
        // cytoscape's mapper strings are valid style values its typings only model as numbers.
        'line-opacity': 'mapData(weight, 0, 1, 0.15, 0.8)' as unknown as number,
      },
    },
    { selector: 'edge.emph', style: { width: 1.4, 'line-opacity': 0.9 } },
    { selector: 'edge.dim', style: { 'line-opacity': 0.05 } },
  ];
}

export class CytoscapeRenderer extends Base2DRenderer {
  private cy: Core | null = null;
  private gate: ClickGate | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private nodeEles = new Map<string, NodeSingular>();
  private edgeEles = new Map<string, EdgeSingular>();
  /** What each element currently wears, so a repaint touches only the elements that changed. */
  private appliedClass = new Map<string, string>();
  private appliedColor = new Map<string, string>();
  private appliedAt = new Map<string, string>();
  private fadeStep = EDGE_FADE_STEPS;

  protected mountEngine(): void {
    const container = this.container!;
    const callbacks = this.callbacks as KnowledgeRendererCallbacks;
    this.gate = new ClickGate(callbacks.onNodeClick, callbacks.onNodeDoubleClick);
    const cy = cytoscape({
      container,
      elements: [],
      style: stylesheet(),
      layout: { name: 'preset' },
      minZoom: 0.02,
      maxZoom: 12,
      wheelSensitivity: 0.3,
      hideEdgesOnViewport: true,
      textureOnViewport: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });
    cy.on('tap', 'node', (event) => this.gate?.click(event.target.id() as string));
    this.cy = cy;
    this.feed();
    cy.fit(undefined, 40);
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
    this.cy?.destroy();
    this.cy = null;
    this.resetApplied();
  }

  protected modelChanged(): void {
    this.feed();
  }

  protected override onResize(): void {
    this.cy?.resize();
  }

  /** The label and ring colours are baked into the stylesheet, so a theme flip rebuilds it. */
  protected override onRecolor(): void {
    const cy = this.cy;
    const model = this.model;
    if (!cy || !model) return;
    cy.style(stylesheet());
    // Edge colour is the source node's, copied into data at feed time — re-copy it from the re-read colours.
    cy.batch(() => {
      for (const link of model.links) {
        this.edgeEles.get(link.id)?.data('color', model.nodeById.get(link.source)?.color ?? 'rgb(128, 128, 128)');
      }
    });
  }

  protected draw(): void {
    const cy = this.cy;
    const paint = this.paint;
    if (!cy || !paint) return;
    cy.batch(() => {
      for (const [id, ele] of this.nodeEles) {
        const node = this.model!.nodeById.get(id)!;
        const at = this.positions.get(id);
        if (at) {
          const key = `${at.x},${at.y}`;
          if (this.appliedAt.get(id) !== key) {
            this.appliedAt.set(id, key);
            ele.position({ x: at.x, y: at.y });
          }
        }
        if (this.appliedColor.get(id) !== node.color) {
          this.appliedColor.set(id, node.color);
          ele.data('color', node.color);
        }
        const alpha = paint.nodeAlpha.get(id) ?? DEFAULT_NODE_ALPHA;
        const classes = [
          paint.nodeVisible.get(id) === false ? 'hidden' : '',
          alpha >= 1 ? 'focus' : alpha >= NEIGHBOR_NODE_ALPHA ? 'neighbor' : alpha <= DIMMED_ALPHA ? 'dim' : '',
          node.degree >= HUB_DEGREE ? 'hub' : '',
          paint.selectedNodeId === id ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        this.applyClasses(id, ele, classes);
      }
      for (const [id, ele] of this.edgeEles) {
        const classes = [
          paint.linkVisible.get(id) === false ? 'hidden' : '',
          paint.linkEmphasised.has(id) ? 'emph' : (paint.linkAlpha.get(id) ?? 1) < 0.1 ? 'dim' : '',
        ]
          .filter(Boolean)
          .join(' ');
        this.applyClasses(`e:${id}`, ele, classes);
      }
    });
    const step = Math.round(this.edgeScale * EDGE_FADE_STEPS);
    if (step !== this.fadeStep) {
      this.fadeStep = step;
      cy.batch(() => cy.edges().style('opacity', step / EDGE_FADE_STEPS));
    }
  }

  protected flyTo(node: Node2D, animate: boolean): void {
    const cy = this.cy;
    const ele = this.nodeEles.get(node.id);
    if (!cy || !ele) return;
    const zoom = Math.max(cy.zoom(), 2.5);
    if (animate) cy.animate({ center: { eles: ele }, zoom }, { duration: 500 });
    else cy.stop().viewport({ zoom, pan: { x: cy.width() / 2 - ele.position('x') * zoom, y: cy.height() / 2 - ele.position('y') * zoom } });
  }

  private applyClasses(key: string, ele: NodeSingular | EdgeSingular, classes: string): void {
    if (this.appliedClass.get(key) === classes) return;
    this.appliedClass.set(key, classes);
    ele.classes(classes);
  }

  private resetApplied(): void {
    this.nodeEles.clear();
    this.edgeEles.clear();
    this.appliedClass.clear();
    this.appliedColor.clear();
    this.appliedAt.clear();
    this.fadeStep = EDGE_FADE_STEPS;
  }

  /** Replace every element with the model's — a mount, a collapse or a layout switch. */
  private feed(): void {
    const cy = this.cy;
    const model = this.model;
    if (!cy || !model) return;
    this.resetApplied();
    cy.batch(() => {
      cy.elements().remove();
      const nodes = cy.add(
        model.nodes.map((n) => {
          const at = this.positions.get(n.id) ?? n;
          return {
            group: 'nodes' as const,
            data: { id: n.id, label: n.label, size: Math.max(n.size, 3), color: n.color },
            position: { x: at.x, y: at.y },
          };
        }),
      );
      for (const ele of nodes.toArray()) this.nodeEles.set(ele.id(), ele as NodeSingular);
      const edges = cy.add(
        model.links.map((l) => ({
          group: 'edges' as const,
          data: {
            id: l.id,
            source: l.source,
            target: l.target,
            weight: l.weight,
            color: model.nodeById.get(l.source)?.color ?? 'rgb(128, 128, 128)',
          },
        })),
      );
      for (const ele of edges.toArray()) this.edgeEles.set(ele.id(), ele as EdgeSingular);
    });
  }
}
