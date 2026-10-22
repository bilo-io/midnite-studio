import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import {
  buildScene3D,
  computeCurvedEdge2D,
  computeHighlightSets,
  hashUnit,
  isCommunityVisible,
  isLinkVisible,
  projectScenePoint,
  searchMatches,
  SYNAPSE_CLUSTER_PALETTE,
  TELEMETRY_CLUSTER_PALETTE,
  type KnowledgeStyleId,
  type Node3D,
  type Scene3D,
} from './knowledge-3d-scene';
import { communityNameFromNodeId } from './knowledge-community-collapse';
import { communityColor } from './knowledge-community-colors';
import type { KnowledgeFilterState } from './knowledge-filters';
import { useKnowledgeFiltersStore } from './knowledge-filters-store';
import { useKnowledgeHost } from './knowledge-host';
import type {
  KnowledgeMountOptions,
  KnowledgeRenderer,
  KnowledgeRendererCallbacks,
  KnowledgeVariantProps,
} from './renderer-contract';
import { useKnowledgeRenderer } from './use-knowledge-renderer';

/**
 * Interactive 3D perspective renderer (`use-3d-graph.tsx`) implementing `KnowledgeRenderer`.
 *
 * Powers both `telemetry-3d` (reference image 1: tactical dark grid, high-contrast neon
 * clusters, straight crisp vectors, cluster callouts `K - 5.3` / `N - 4.9`, numeric node
 * readouts, and HUD data panels) and `synapse-3d` (reference image 2: deep space backdrop,
 * glowing cyan/magenta/violet spheres, sweeping curved 3D filaments, and floating 8-decimal
 * edge confidence scores `0.98300614`, `0.9402857`, `1.0`).
 *
 * Also exports `paintScene3DFrame`, used by both the live interactive canvas and the
 * Settings 3-cluster 3D style thumbnails so every thumbnail renders through the exact
 * same 3D projection and painting pipeline.
 */

export type PaintScene3DOptions = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scene: Scene3D;
  styleId: KnowledgeStyleId;
  rx: number;
  ry: number;
  rz: number;
  zoom: number;
  panX?: number;
  panY?: number;
  selectedNodeId?: string | null;
  hoveredNodeId?: string | null;
  litNodeIds?: ReadonlySet<string> | null;
  hiddenCommunities?: ReadonlySet<string>;
  visibleEdgeIds?: ReadonlySet<string> | null;
  thumbnail?: boolean;
};

export type ProjectedNodeHit = {
  node: Node3D;
  sx: number;
  sy: number;
  z: number;
  r: number;
};

function resolveCommunityRgb(community: number): string {
  if (typeof document !== 'undefined') {
    const rgb = communityColor(community, (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    );
    if (rgb && rgb !== 'rgb(136, 136, 136)') return rgb;
  }
  const fallback = ['#38bdf8', '#facc15', '#ec4899', '#34d399', '#a855f7', '#fb923c'];
  return fallback[Math.abs(community) % fallback.length]!;
}

/**
 * Paints one frame of a `Scene3D` in any of the 6 `KnowledgeStyleId` presentation styles.
 * Returns the depth-sorted projected nodes for pointer hit-testing.
 */
export function paintScene3DFrame(opts: PaintScene3DOptions): ProjectedNodeHit[] {
  const {
    ctx,
    width,
    height,
    scene,
    styleId,
    rx,
    ry,
    rz,
    zoom,
    panX = 0,
    panY = 0,
    selectedNodeId = null,
    hoveredNodeId = null,
    litNodeIds = null,
    hiddenCommunities = new Set<string>(),
    visibleEdgeIds = null,
    thumbnail = false,
  } = opts;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // 1. Style-specific 3D space backdrop
  if (styleId === 'telemetry-3d') {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#050a14');
    bg.addColorStop(0.6, '#070f1e');
    bg.addColorStop(1, '#040811');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle telemetry dot/line coordinate grid
    const step = thumbnail ? 18 : 34;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = step; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  } else if (styleId === 'synapse-3d') {
    const bg = ctx.createRadialGradient(
      width * 0.48,
      height * 0.48,
      10,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    bg.addColorStop(0, '#071324');
    bg.addColorStop(0.55, '#040914');
    bg.addColorStop(1, '#020409');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  } else if (styleId === 'constellation') {
    const bg = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      5,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.75,
    );
    bg.addColorStop(0, '#0a0f1d');
    bg.addColorStop(1, '#04060c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#090d16');
    bg.addColorStop(1, '#05080f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  const centerX = width * 0.52 + panX;
  const centerY = height * 0.5 + panY;
  const scaleFactor = thumbnail
    ? Math.min(width / 320, height / 210)
    : Math.min(width / 350, height / 280);

  const filterCommunityState = { hiddenCommunities };

  // Project all visible nodes
  const projectedById = new Map<string, ProjectedNodeHit>();
  const hits: ProjectedNodeHit[] = [];

  for (const node of scene.nodes) {
    if (!isCommunityVisible(node.communityName, filterCommunityState)) continue;
    const scaledPos: [number, number, number] = [
      node.pos[0] * scaleFactor,
      node.pos[1] * scaleFactor,
      node.pos[2] * scaleFactor,
    ];
    const proj = projectScenePoint(scaledPos, rx, ry, rz, centerX, centerY, zoom);
    if (!proj.visible) continue;
    const baseR = thumbnail ? Math.max(2.3, node.radius * 0.58) : node.radius;
    const r = Math.max(1.8, baseR * proj.scale * (styleId === 'clusters' ? 1.35 : 1));
    const hit: ProjectedNodeHit = {
      node,
      sx: proj.sx,
      sy: proj.sy,
      z: proj.z,
      r,
    };
    projectedById.set(node.id, hit);
    hits.push(hit);
  }

  // Sort back-to-front by Z (larger Z is further away in project3D where depth = fov + z + camDist)
  hits.sort((a, b) => b.z - a.z);

  // Optional 3D Orbit rings guide for 'orbit' style
  if (styleId === 'orbit') {
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.16)';
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 3; ring += 1) {
      const rr = ring * 44 * scaleFactor;
      ctx.beginPath();
      for (let s = 0; s <= 48; s += 1) {
        const a = (s / 48) * Math.PI * 2;
        const p = projectScenePoint(
          [Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.95, 0],
          rx,
          ry,
          rz,
          centerX,
          centerY,
          zoom,
        );
        if (s === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Optional 3D cluster envelopes for 'clusters' style
  if (styleId === 'clusters') {
    for (let i = 0; i < scene.clusters.length; i += 1) {
      const c = scene.clusters[i]!;
      if (!isCommunityVisible(c.communityName, filterCommunityState)) continue;
      const p = projectScenePoint(
        [c.pos[0] * scaleFactor, (c.pos[1] + 24) * scaleFactor, c.pos[2] * scaleFactor],
        rx,
        ry,
        rz,
        centerX,
        centerY,
        zoom,
      );
      if (!p.visible) continue;
      const envR = (thumbnail ? 32 : 58) * p.scale;
      const pal = TELEMETRY_CLUSTER_PALETTE[c.community % TELEMETRY_CLUSTER_PALETTE.length]!;
      const grad = ctx.createRadialGradient(p.sx, p.sy, envR * 0.1, p.sx, p.sy, envR);
      grad.addColorStop(0, pal.glow.replace('0.55', '0.22'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, envR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Draw edges
  const useCurvedEdges = styleId === 'synapse-3d' || styleId === 'constellation' || styleId === 'orbit';
  const maxEdgeLabels = thumbnail ? 8 : 56;
  let edgeLabelsDrawn = 0;

  for (let i = 0; i < scene.edges.length; i += 1) {
    const edge = scene.edges[i]!;
    if (visibleEdgeIds && !visibleEdgeIds.has(edge.id)) continue;
    const s = projectedById.get(edge.sourceId);
    const t = projectedById.get(edge.targetId);
    if (!s || !t) continue;

    const isLit =
      litNodeIds === null ||
      (litNodeIds.has(edge.sourceId) && litNodeIds.has(edge.targetId)) ||
      selectedNodeId === edge.sourceId ||
      selectedNodeId === edge.targetId ||
      hoveredNodeId === edge.sourceId ||
      hoveredNodeId === edge.targetId;

    const depthAlpha = Math.max(0.18, Math.min(1, 1.15 - (s.z + t.z) / (600 * scaleFactor)));
    const alphaMul = isLit ? depthAlpha : depthAlpha * 0.16;

    if (styleId === 'telemetry-3d') {
      const sPal = TELEMETRY_CLUSTER_PALETTE[s.node.community % TELEMETRY_CLUSTER_PALETTE.length]!;
      const tPal = TELEMETRY_CLUSTER_PALETTE[t.node.community % TELEMETRY_CLUSTER_PALETTE.length]!;
      if (s.node.community === t.node.community) {
        ctx.strokeStyle = sPal.fill;
      } else {
        const grad = ctx.createLinearGradient(s.sx, s.sy, t.sx, t.sy);
        grad.addColorStop(0, sPal.fill);
        grad.addColorStop(1, tPal.fill);
        ctx.strokeStyle = grad;
      }
      ctx.globalAlpha = Math.min(0.85, (0.34 + edge.confidence * 0.25) * alphaMul);
      ctx.lineWidth = thumbnail ? 0.85 : isLit && selectedNodeId ? 1.35 : 0.95;
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy);
      ctx.lineTo(t.sx, t.sy);
      ctx.stroke();
    } else if (styleId === 'synapse-3d') {
      const isBridge = s.node.community !== t.node.community || i % 3 === 1;
      const pal = isBridge
        ? SYNAPSE_CLUSTER_PALETTE[1]! // vibrant magenta/violet arc
        : SYNAPSE_CLUSTER_PALETTE[s.node.community % SYNAPSE_CLUSTER_PALETTE.length]!;
      const { cx, cy, mx, my } = computeCurvedEdge2D(s.sx, s.sy, t.sx, t.sy, edge.curveArch);
      ctx.strokeStyle = pal.fill;
      ctx.globalAlpha = Math.min(0.92, (isBridge ? 0.56 : 0.34) * alphaMul);
      ctx.lineWidth = thumbnail ? (isBridge ? 1.25 : 0.75) : isBridge ? 1.65 : 0.95;
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy);
      ctx.quadraticCurveTo(cx, cy, t.sx, t.sy);
      ctx.stroke();

      // Floating numeric edge confidence weight along the curve (reference image 2)
      const labelStride = thumbnail ? 4 : Math.max(1, Math.floor(scene.edges.length / maxEdgeLabels));
      if (isLit && i % labelStride === 0 && edgeLabelsDrawn < maxEdgeLabels) {
        edgeLabelsDrawn += 1;
        ctx.save();
        ctx.globalAlpha = Math.min(0.92, 0.78 * alphaMul);
        ctx.font = thumbnail ? '600 7px ui-monospace, SFMono-Regular, monospace' : '600 9.5px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = pal.text;
        ctx.textAlign = 'center';
        ctx.fillText(edge.synapseScore, mx, my - 2);
        ctx.restore();
      }
    } else {
      const cRgb = resolveCommunityRgb(s.node.community);
      ctx.strokeStyle = cRgb;
      ctx.globalAlpha = Math.min(0.75, (styleId === 'constellation' ? 0.28 : 0.38) * alphaMul);
      ctx.lineWidth = thumbnail ? 0.8 : 1.05;
      ctx.beginPath();
      if (useCurvedEdges) {
        const { cx, cy } = computeCurvedEdge2D(s.sx, s.sy, t.sx, t.sy, edge.curveArch * 0.75);
        ctx.moveTo(s.sx, s.sy);
        ctx.quadraticCurveTo(cx, cy, t.sx, t.sy);
      } else {
        ctx.moveTo(s.sx, s.sy);
        ctx.lineTo(t.sx, t.sy);
      }
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;

  // 3. Draw nodes back-to-front
  let nodeMetricsDrawn = 0;
  const maxNodeMetrics = thumbnail ? 6 : 36;

  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i]!;
    const { node, sx, sy, r } = hit;
    const isSelected = selectedNodeId === node.id;
    const isHovered = hoveredNodeId === node.id;
    const isLit = litNodeIds === null || litNodeIds.has(node.id) || isSelected || isHovered;
    const alpha = isLit ? 0.96 : 0.18;

    let fill: string;
    let glowColor: string;
    if (styleId === 'telemetry-3d') {
      const pal = TELEMETRY_CLUSTER_PALETTE[node.community % TELEMETRY_CLUSTER_PALETTE.length]!;
      fill = pal.fill;
      glowColor = pal.glow;
    } else if (styleId === 'synapse-3d') {
      const isHub = node.degree >= 4 || hashUnit(node.id) > 0.68;
      const palIdx = isHub ? (node.community % 2 === 0 ? 1 : 2) : 0;
      const pal = SYNAPSE_CLUSTER_PALETTE[palIdx]!;
      fill = pal.fill;
      glowColor = pal.glow;
    } else {
      fill = resolveCommunityRgb(node.community);
      glowColor = fill;
    }

    // Outer halo / bloom for Synapse Flow, Constellation, or high-degree Telemetry hubs
    if (
      isLit &&
      (styleId === 'synapse-3d' ||
        styleId === 'constellation' ||
        (styleId === 'telemetry-3d' && node.degree >= 3) ||
        isSelected ||
        isHovered)
    ) {
      const haloR = r * (styleId === 'synapse-3d' ? 2.8 : 2.2);
      const grad = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, haloR);
      grad.addColorStop(
        0,
        glowColor.startsWith('rgba') ? glowColor : 'rgba(56, 189, 248, 0.45)',
      );
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core sphere
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected || isHovered) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Telemetry numeric node callouts (reference image 1: `77.247`, `29.625`, `15.683`)
    if (styleId === 'telemetry-3d' && isLit && nodeMetricsDrawn < maxNodeMetrics) {
      const stride = thumbnail ? 3 : Math.max(1, Math.floor(hits.length / maxNodeMetrics));
      if (i % stride === 0 || isSelected || isHovered) {
        nodeMetricsDrawn += 1;
        ctx.font = thumbnail
          ? '500 6.5px ui-monospace, SFMono-Regular, monospace'
          : '500 9px ui-monospace, SFMono-Regular, monospace';
        ctx.fillStyle = 'rgba(203, 213, 225, 0.78)';
        ctx.textAlign = 'left';
        ctx.fillText(node.telemetryMetric, sx + r + 3, sy + 2.5);
      }
    }

    // Node label on hover/selection or high-degree hubs in full view
    if (!thumbnail && (isSelected || isHovered || (isLit && node.degree >= 5 && styleId !== 'synapse-3d'))) {
      ctx.font = '600 10.5px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.fillText(node.label, sx + r + 5, sy - 3);
    }
  }

  ctx.globalAlpha = 1;

  // 4. Telemetry HUD cluster callout tags & corner telemetry readouts (reference image 1)
  if (styleId === 'telemetry-3d') {
    for (let i = 0; i < scene.clusters.length; i += 1) {
      const c = scene.clusters[i]!;
      if (!isCommunityVisible(c.communityName, filterCommunityState)) continue;
      const p = projectScenePoint(
        [c.pos[0] * scaleFactor, c.pos[1] * scaleFactor, c.pos[2] * scaleFactor],
        rx,
        ry,
        rz,
        centerX,
        centerY,
        zoom,
      );
      if (!p.visible) continue;
      const pal = TELEMETRY_CLUSTER_PALETTE[c.community % TELEMETRY_CLUSTER_PALETTE.length]!;
      ctx.font = thumbnail
        ? '700 8px ui-monospace, SFMono-Regular, monospace'
        : '700 12px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = pal.fill;
      ctx.textAlign = 'center';
      ctx.fillText(c.codeLabel, p.sx, p.sy);
    }

    // Left HUD telemetry block (matches reference image 1's left-hand data readouts)
    if (!thumbnail && width >= 420) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = '600 11px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.82)';
      ctx.fillText('KNOWLEDGE TELEMETRY // 3D', 18, 28);

      ctx.font = '500 9.5px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = '#facc15';
      ctx.fillText(`NODES  — ${scene.nodes.length.toString().padStart(4, '0')} · CLUSTERS — 0${scene.clusters.length}`, 18, 52);
      ctx.fillText(`LINKS  — ${scene.edges.length.toString().padStart(4, '0')} · FOV      — 420.0`, 18, 65);
      ctx.fillText(`PITCH  — ${(rx * 57.2958).toFixed(2)}° · YAW     — ${(ry * 57.2958).toFixed(2)}°`, 18, 78);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.68)';
      ctx.fillText(`[09] 209 - 9065 T`, 18, 112);
      ctx.fillText(`109 - 8418 - KG`, 18, 125);
      ctx.fillText(`GT - 87.9043`, 18, 138);

      // Yellow pill badge at bottom-left like reference image 1
      ctx.fillStyle = '#facc15';
      ctx.fillRect(18, height - 30, 132, 14);
      ctx.fillStyle = '#050a14';
      ctx.font = '700 8.5px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(
        `3D · ${scene.nodes.length}N · ${scene.edges.length}E`,
        23,
        height - 20,
      );
      ctx.restore();
    } else if (thumbnail) {
      ctx.save();
      ctx.fillStyle = '#facc15';
      ctx.fillRect(8, height - 14, 62, 8);
      ctx.fillStyle = '#050a14';
      ctx.font = '700 5.5px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('596 - S - 8954', 10, height - 8);
      ctx.restore();
    }
  }

  ctx.restore();
  return hits;
}

/**
 * Imperative `KnowledgeRenderer` implementation for the 3D presentation styles.
 */
export class ThreeDKnowledgeRenderer implements KnowledgeRenderer {
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private payload: KnowledgeGraphPayload | null = null;
  private callbacks: KnowledgeRendererCallbacks | null = null;
  private maxNodes = Infinity;
  private styleId: KnowledgeStyleId = 'telemetry-3d';
  private scene: Scene3D | null = null;

  private filters: KnowledgeFilterState = {
    query: '',
    relations: new Set(),
    minWeight: 0,
    minConfidence: 0,
    hiddenCommunities: new Set(),
  };
  private selectedNodeId: string | null = null;
  private hoveredNodeId: string | null = null;
  private collapsedCommunities: ReadonlySet<string> = new Set();
  private paused = false;

  // Camera state: pitch (rx), yaw (ry), roll (rz), zoom, pan
  private rx = -0.32;
  private ry = 0.42;
  private rz = -0.06;
  private zoom = 1.05;
  private panX = 0;
  private panY = 0;

  // Intro scale animation (0 -> 1)
  private introProgress = 1;
  private introStartMs = 0;
  private rafId: number | null = null;
  private lastHits: ProjectedNodeHit[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private cleanupEvents: (() => void) | null = null;

  constructor(private readonly prefersReducedMotion: () => boolean) {}

  setStyleId(styleId: KnowledgeStyleId): void {
    if (this.styleId === styleId) return;
    this.styleId = styleId;
    this.rebuildScene();
    this.draw();
  }

  mount(
    container: HTMLDivElement,
    payload: KnowledgeGraphPayload,
    callbacks: KnowledgeRendererCallbacks,
    options: KnowledgeMountOptions,
  ): void {
    this.dispose();
    this.container = container;
    this.payload = payload;
    this.callbacks = callbacks;
    this.maxNodes = options.maxNodes;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    canvas.setAttribute('data-testid', 'knowledge-3d-canvas');
    container.appendChild(canvas);
    this.canvas = canvas;

    this.rebuildScene();
    this.attachInteractions(canvas);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }

    this.playIntro();
  }

  dispose(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cleanupEvents?.();
    this.cleanupEvents = null;
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.container = null;
    this.scene = null;
    this.lastHits = [];
  }

  applyFilters(filters: KnowledgeFilterState): void {
    this.filters = filters;
    this.draw();
  }

  applyHighlight(selectedNodeId: string | null): void {
    this.selectedNodeId = selectedNodeId;
    this.draw();
  }

  focusNode(nodeId: string | null): void {
    if (!nodeId || !this.scene) return;
    const target = this.scene.nodeById.get(nodeId);
    if (!target) return;
    // Rotate camera gently toward the focused node's azimuth
    const [x, y, z] = target.pos;
    this.ry = Math.atan2(-x, z + 220) * 0.55;
    this.rx = Math.atan2(-y, 240) * 0.45;
    this.draw();
  }

  setCollapsed(collapsedCommunities: ReadonlySet<string>): void {
    this.collapsedCommunities = collapsedCommunities;
    this.rebuildScene();
    this.draw();
  }

  resize(): void {
    this.draw();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused && this.introProgress < 1) {
      this.introProgress = 1;
      this.draw();
    }
  }

  playIntro(): void {
    if (this.paused || this.prefersReducedMotion()) {
      this.introProgress = 1;
      this.draw();
      return;
    }
    this.introProgress = 0.08;
    this.introStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const t = Math.min(1, (now - this.introStartMs) / 520);
      // Ease out cubic
      this.introProgress = 1 - Math.pow(1 - t, 3);
      this.draw();
      if (t < 1 && !this.paused) {
        this.rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : null;
      } else {
        this.introProgress = 1;
        this.rafId = null;
      }
    };
    this.rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : null;
    this.draw();
  }

  retarget(positions: KnowledgeGraphPayload['positions']): void {
    if (!this.payload) return;
    this.payload = { ...this.payload, positions };
    this.rebuildScene();
    this.draw();
  }

  private rebuildScene(): void {
    if (!this.payload) return;
    this.scene = buildScene3D(this.payload, {
      maxNodes: this.maxNodes,
      collapsedCommunities: this.collapsedCommunities,
      orbitLayout: this.styleId === 'orbit',
    });
  }

  private attachInteractions(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startRx = this.rx;
    let startRy = this.ry;

    const hitTest = (clientX: number, clientY: number): Node3D | null => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // Search front-to-back (reverse of back-to-front draw order)
      for (let i = this.lastHits.length - 1; i >= 0; i -= 1) {
        const h = this.lastHits[i]!;
        const dx = x - h.sx;
        const dy = y - h.sy;
        const hitR = Math.max(7, h.r + 3);
        if (dx * dx + dy * dy <= hitR * hitR) return h.node;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      startRx = this.rx;
      startRy = this.ry;
      canvas.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        this.ry = startRy + dx * 0.0065;
        this.rx = Math.max(-1.35, Math.min(1.35, startRx - dy * 0.0065));
        this.draw();
        return;
      }
      const hit = hitTest(e.clientX, e.clientY);
      const nextHover = hit?.id ?? null;
      if (nextHover !== this.hoveredNodeId) {
        this.hoveredNodeId = nextHover;
        canvas.style.cursor = nextHover ? 'pointer' : 'grab';
        this.draw();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = this.hoveredNodeId ? 'pointer' : 'grab';
      if (!moved) {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) this.callbacks?.onNodeClick(hit.id);
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) this.callbacks?.onNodeDoubleClick(hit.id);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.09 : 0.92;
      this.zoom = Math.max(0.35, Math.min(3.5, this.zoom * factor));
      this.draw();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    this.cleanupEvents = () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }

  private draw(): void {
    const canvas = this.canvas;
    const container = this.container;
    const scene = this.scene;
    const payload = this.payload;
    if (!canvas || !container || !scene || !payload) return;

    const width = Math.max(1, container.clientWidth || 640);
    const height = Math.max(1, container.clientHeight || 420);
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Filter edges and compute lit node set.
    // If the graph contains none of the filter's active `relations` (e.g. a Mind/AI KG
    // with `part_of` / `mentions` / `relates_to` when `DEFAULT_RELATIONS` starts on `'calls'`),
    // fall back to treating all relations present in the scene as eligible until the user
    // explicitly picks one of the graph's own relations.
    const commByNode = new Map<string, string>();
    for (const n of scene.nodes) commByNode.set(n.id, n.communityName);

    const hasAnyRelationMatch =
      this.filters.relations.size > 0 &&
      scene.edges.some((e) => this.filters.relations.has(e.relation));
    const effectiveFilters: KnowledgeFilterState = hasAnyRelationMatch
      ? this.filters
      : {
          ...this.filters,
          relations: new Set(scene.edges.map((e) => e.relation)),
        };

    const visibleEdgeIds = new Set<string>();
    const neighbors = new Map<string, Set<string>>();
    for (const e of scene.edges) {
      const linkLike = {
        source: e.sourceId,
        target: e.targetId,
        relation: e.relation,
        weight: e.weight,
        confidence: e.confidence,
      };
      const sourceComm = commByNode.get(e.sourceId) ?? '';
      const targetComm = commByNode.get(e.targetId) ?? '';
      if (!isLinkVisible(linkLike, sourceComm, targetComm, effectiveFilters)) continue;
      visibleEdgeIds.add(e.id);
      if (!neighbors.has(e.sourceId)) neighbors.set(e.sourceId, new Set());
      if (!neighbors.has(e.targetId)) neighbors.set(e.targetId, new Set());
      neighbors.get(e.sourceId)!.add(e.targetId);
      neighbors.get(e.targetId)!.add(e.sourceId);
    }

    const matches = this.filters.query ? searchMatches(payload.nodes, this.filters.query) : new Set<string>();
    const highlight = computeHighlightSets({
      searchMatchIds: matches,
      selectedNodeId: this.selectedNodeId,
      hoveredNodeId: this.hoveredNodeId,
      neighborsOf: (id) => neighbors.get(id) ?? [],
    });

    const litNodeIds = highlight.active
      ? new Set<string>([...highlight.focusIds, ...highlight.neighborIds])
      : null;

    const effectiveScene: Scene3D =
      this.introProgress < 1
        ? {
            ...scene,
            nodes: scene.nodes.map((n) => ({
              ...n,
              pos: [
                n.pos[0] * this.introProgress,
                n.pos[1] * this.introProgress,
                n.pos[2] * this.introProgress,
              ],
            })),
          }
        : scene;

    this.lastHits = paintScene3DFrame({
      ctx,
      width,
      height,
      scene: effectiveScene,
      styleId: this.styleId,
      rx: this.rx,
      ry: this.ry,
      rz: this.rz,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      selectedNodeId: this.selectedNodeId,
      hoveredNodeId: this.hoveredNodeId,
      litNodeIds,
      hiddenCommunities: this.filters.hiddenCommunities,
      visibleEdgeIds,
    });

    ctx.restore();
  }
}

export default function ThreeDKnowledgeCanvas({
  payload,
  filters,
  focusNodeId,
  selectedNodeId,
  collapsedCommunities,
  onNodeClick,
  onNodeDoubleClick,
  paused,
  maxNodes,
}: KnowledgeVariantProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeDKnowledgeRenderer | null>(null);
  const host = useKnowledgeHost();
  if (rendererRef.current === null) {
    rendererRef.current = new ThreeDKnowledgeRenderer(host.prefersReducedMotion);
  }

  const rawVariant = useKnowledgeFiltersStore((s) => s.rendererVariant);
  const styleId: KnowledgeStyleId =
    rawVariant === 'synapse-3d' ||
    rawVariant === 'telemetry-3d' ||
    rawVariant === 'constellation' ||
    rawVariant === 'orbit' ||
    rawVariant === 'clusters'
      ? rawVariant
      : 'telemetry-3d';

  const [clustersExpanded, setClustersExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setClustersExpanded(new Set());
  }, [payload]);

  const communityByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of payload.nodes) map.set(node.id, node.communityName);
    return map;
  }, [payload]);

  const communityNames = useMemo(() => {
    const names = new Set<string>();
    for (const node of payload.nodes) names.add(node.communityName);
    return [...names];
  }, [payload]);

  const effectiveCollapsedCommunities = useMemo(() => {
    if (styleId !== 'clusters') return collapsedCommunities;
    return new Set(communityNames.filter((name) => !clustersExpanded.has(name)));
  }, [styleId, collapsedCommunities, communityNames, clustersExpanded]);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      if (styleId === 'clusters') {
        const collapsedName = communityNameFromNodeId(nodeId);
        if (collapsedName !== null) {
          setClustersExpanded((prev) => new Set(prev).add(collapsedName));
        } else {
          const communityName = communityByNodeId.get(nodeId);
          if (communityName !== undefined) {
            setClustersExpanded((prev) => {
              if (!prev.has(communityName)) return prev;
              const next = new Set(prev);
              next.delete(communityName);
              return next;
            });
          }
        }
      }
      onNodeDoubleClick(nodeId);
    },
    [styleId, communityByNodeId, onNodeDoubleClick],
  );

  useKnowledgeRenderer({
    containerRef,
    renderer: rendererRef.current,
    payload,
    filters,
    focusNodeId,
    selectedNodeId,
    collapsedCommunities: effectiveCollapsedCommunities,
    onNodeClick,
    onNodeDoubleClick: handleNodeDoubleClick,
    paused,
    maxNodes,
  });

  useEffect(() => {
    rendererRef.current?.setStyleId(styleId);
  }, [styleId, payload]);

  const resetCamera = useCallback(() => {
    if (!rendererRef.current) return;
    rendererRef.current.focusNode(payload.nodes[0]?.id ?? null);
  }, [payload.nodes]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 bg-background">
      <div
        ref={containerRef}
        data-testid="knowledge-canvas"
        className="h-full min-h-0 min-w-0 w-full flex-1"
      />
      <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-mono text-muted-foreground backdrop-blur-sm">
        <span>3D · Drag to orbit · Scroll to zoom</span>
        <button
          type="button"
          onClick={resetCamera}
          className="pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent"
        >
          Reset view
        </button>
      </div>
    </div>
  );
}
