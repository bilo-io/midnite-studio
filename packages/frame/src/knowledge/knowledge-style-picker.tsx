import { useEffect, useMemo, useRef } from 'react';

import {
  buildScene3D,
  buildThreeClusterPreviewPayload,
  computeCurvedEdge2D,
  KNOWLEDGE_STYLE_IDS,
  KNOWLEDGE_STYLE_META,
  projectScenePoint,
  SYNAPSE_CLUSTER_PALETTE,
  TELEMETRY_CLUSTER_PALETTE,
  type KnowledgeStyleId,
  type Scene3D,
} from './knowledge-3d-scene';
import { paintScene3DFrame } from './use-3d-graph';

/**
 * Knowledge Graph Presentation Style Picker.
 *
 * One card per presentation style (`atlas`, `constellation`, `orbit`, `clusters`,
 * `telemetry-3d`, `synapse-3d`), each rendering a 3D perspective thumbnail of the
 * **exact same 3 interconnected clusters of nodes** (`buildThreeClusterPreviewPayload`)
 * so that the styles differ solely by how they present the topology.
 *
 * Renders both a high-resolution `<canvas>` when a 2D context is available and a
 * matching 3D-projected `<svg>` vector layer so tests (jsdom) and crisp vector
 * inspection can verify the 3 interconnected clusters, curved synapse weights,
 * and telemetry callouts directly in the DOM.
 */

const THUMB_WIDTH = 280;
const THUMB_HEIGHT = 128;
const THUMB_RX = -0.32;
const THUMB_RY = 0.44;
const THUMB_RZ = -0.05;
const THUMB_ZOOM = 1.08;

const PREVIEW_PAYLOAD = buildThreeClusterPreviewPayload();

export function KnowledgeStylePicker({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: KnowledgeStyleId) => void;
}) {
  const normalizedActive: KnowledgeStyleId = (
    KNOWLEDGE_STYLE_IDS as readonly string[]
  ).includes(activeId)
    ? (activeId as KnowledgeStyleId)
    : 'atlas';

  return (
    <div
      data-testid="knowledge-style-picker"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {KNOWLEDGE_STYLE_IDS.map((id) => (
        <StyleCard
          key={id}
          id={id}
          active={normalizedActive === id}
          onSelect={() => onSelect(id)}
        />
      ))}
    </div>
  );
}

function StyleCard({
  id,
  active,
  onSelect,
}: {
  id: KnowledgeStyleId;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = KNOWLEDGE_STYLE_META[id];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scene = useMemo<Scene3D>(
    () =>
      buildScene3D(PREVIEW_PAYLOAD, {
        orbitLayout: id === 'orbit',
      }),
    [id],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    canvas.width = Math.round(THUMB_WIDTH * dpr);
    canvas.height = Math.round(THUMB_HEIGHT * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);
    paintScene3DFrame({
      ctx,
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      scene,
      styleId: id,
      rx: THUMB_RX,
      ry: THUMB_RY,
      rz: THUMB_RZ,
      zoom: THUMB_ZOOM,
      thumbnail: true,
    });
    ctx.restore();
  }, [id, scene]);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`knowledge-style-card-${id}`}
      className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:bg-accent/30'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{meta.label}</span>
        {meta.badge3D ? (
          <span className="rounded bg-primary/15 px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider text-primary">
            3D
          </span>
        ) : null}
        {active ? <span className="ml-auto text-[10px] uppercase text-primary">Active</span> : null}
      </div>

      <div
        data-testid={`knowledge-style-thumb-${id}`}
        className="relative h-32 w-full overflow-hidden rounded-md border border-border/50 bg-[#050a14]"
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <ThumbnailSvg3D styleId={id} scene={scene} />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{meta.blurb}</p>
    </button>
  );
}

/**
 * Vector 3D projection overlay for the 3-cluster thumbnail so that:
 * 1. Crisp SVG nodes, curved synapse paths, floating numeric edge weights, and
 *    cluster telemetry badges render at any DPI even before canvas hydration.
 * 2. Unit tests under vitest/jsdom can inspect the exact 3 clusters (`data-cluster`),
 *    inter-cluster bridges, and style-specific callouts.
 */
function ThumbnailSvg3D({ styleId, scene }: { styleId: KnowledgeStyleId; scene: Scene3D }) {
  const centerX = THUMB_WIDTH * 0.52;
  const centerY = THUMB_HEIGHT * 0.5;
  const scaleFactor = Math.min(THUMB_WIDTH / 340, THUMB_HEIGHT / 220);

  const projectedNodes = useMemo(() => {
    const map = new Map<
      string,
      { sx: number; sy: number; z: number; r: number; community: number; label: string; metric: string }
    >();
    const list: Array<{
      id: string;
      sx: number;
      sy: number;
      z: number;
      r: number;
      community: number;
      label: string;
      metric: string;
    }> = [];
    for (const node of scene.nodes) {
      const p = projectScenePoint(
        [node.pos[0] * scaleFactor, node.pos[1] * scaleFactor, node.pos[2] * scaleFactor],
        THUMB_RX,
        THUMB_RY,
        THUMB_RZ,
        centerX,
        centerY,
        THUMB_ZOOM,
      );
      if (!p.visible) continue;
      const r = Math.max(2.2, node.radius * 0.55 * p.scale * (styleId === 'clusters' ? 1.25 : 1));
      const item = {
        id: node.id,
        sx: p.sx,
        sy: p.sy,
        z: p.z,
        r,
        community: node.community,
        label: node.label,
        metric: node.telemetryMetric,
      };
      map.set(node.id, item);
      list.push(item);
    }
    list.sort((a, b) => b.z - a.z);
    return { map, list };
  }, [scene, scaleFactor, centerX, centerY, styleId]);

  const useCurved = styleId === 'synapse-3d' || styleId === 'constellation' || styleId === 'orbit';

  return (
    <svg
      viewBox={`0 0 ${THUMB_WIDTH} ${THUMB_HEIGHT}`}
      aria-label={`${KNOWLEDGE_STYLE_META[styleId].label} 3D 3-cluster preview`}
      className="relative z-10 h-full w-full"
    >
      {/* Telemetry coordinate grid */}
      {styleId === 'telemetry-3d' ? (
        <g stroke="rgba(56, 189, 248, 0.08)" strokeWidth="0.6">
          {[40, 80, 120, 160, 200, 240].map((x) => (
            <line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={THUMB_HEIGHT} />
          ))}
          {[28, 56, 84, 112].map((y) => (
            <line key={`gy-${y}`} x1={0} y1={y} x2={THUMB_WIDTH} y2={y} />
          ))}
        </g>
      ) : null}

      {/* Edges */}
      <g>
        {scene.edges.map((edge, idx) => {
          const s = projectedNodes.map.get(edge.sourceId);
          const t = projectedNodes.map.get(edge.targetId);
          if (!s || !t) return null;
          const isBridge = s.community !== t.community;
          const stroke =
            styleId === 'telemetry-3d'
              ? TELEMETRY_CLUSTER_PALETTE[s.community % TELEMETRY_CLUSTER_PALETTE.length]!.fill
              : styleId === 'synapse-3d'
                ? isBridge
                  ? SYNAPSE_CLUSTER_PALETTE[1]!.fill
                  : SYNAPSE_CLUSTER_PALETTE[s.community % SYNAPSE_CLUSTER_PALETTE.length]!.fill
                : ['#38bdf8', '#facc15', '#ec4899'][s.community % 3]!;
          const opacity = styleId === 'synapse-3d' ? (isBridge ? 0.72 : 0.42) : 0.48;

          if (useCurved) {
            const { cx, cy, mx, my } = computeCurvedEdge2D(
              s.sx,
              s.sy,
              t.sx,
              t.sy,
              edge.curveArch,
            );
            return (
              <g key={edge.id}>
                <path
                  d={`M ${s.sx.toFixed(1)} ${s.sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${t.sx.toFixed(1)} ${t.sy.toFixed(1)}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isBridge ? 1.2 : 0.75}
                  strokeOpacity={opacity}
                  data-intercluster={isBridge ? 'true' : 'false'}
                />
                {styleId === 'synapse-3d' && idx % 5 === 0 ? (
                  <text
                    x={mx.toFixed(1)}
                    y={(my - 2).toFixed(1)}
                    fill={isBridge ? '#f0abfc' : '#5eead4'}
                    fontSize="6.2"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    textAnchor="middle"
                  >
                    {edge.synapseScore}
                  </text>
                ) : null}
              </g>
            );
          }

          return (
            <line
              key={edge.id}
              x1={s.sx.toFixed(1)}
              y1={s.sy.toFixed(1)}
              x2={t.sx.toFixed(1)}
              y2={t.sy.toFixed(1)}
              stroke={stroke}
              strokeWidth={isBridge ? 1.1 : 0.75}
              strokeOpacity={opacity}
              data-intercluster={isBridge ? 'true' : 'false'}
            />
          );
        })}
      </g>

      {/* Nodes */}
      <g>
        {projectedNodes.list.map((n, idx) => {
          const fill =
            styleId === 'telemetry-3d'
              ? TELEMETRY_CLUSTER_PALETTE[n.community % TELEMETRY_CLUSTER_PALETTE.length]!.fill
              : styleId === 'synapse-3d'
                ? SYNAPSE_CLUSTER_PALETTE[n.community % SYNAPSE_CLUSTER_PALETTE.length]!.fill
                : ['#38bdf8', '#facc15', '#ec4899'][n.community % 3]!;
          return (
            <g key={n.id} data-cluster={n.community}>
              <circle
                cx={n.sx.toFixed(1)}
                cy={n.sy.toFixed(1)}
                r={n.r.toFixed(1)}
                fill={fill}
                fillOpacity={0.95}
              />
              {styleId === 'telemetry-3d' && idx % 4 === 0 ? (
                <text
                  x={(n.sx + n.r + 2.5).toFixed(1)}
                  y={(n.sy + 2).toFixed(1)}
                  fill="rgba(226, 232, 240, 0.85)"
                  fontSize="6"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {n.metric}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* Telemetry HUD cluster labels (K - 2.1, N - 3.8, R - 5.5) */}
      {styleId === 'telemetry-3d' ? (
        <g>
          {scene.clusters.map((c) => {
            const p = projectScenePoint(
              [c.pos[0] * scaleFactor, c.pos[1] * scaleFactor, c.pos[2] * scaleFactor],
              THUMB_RX,
              THUMB_RY,
              THUMB_RZ,
              centerX,
              centerY,
              THUMB_ZOOM,
            );
            const pal = TELEMETRY_CLUSTER_PALETTE[c.community % TELEMETRY_CLUSTER_PALETTE.length]!;
            return (
              <text
                key={c.communityName}
                x={p.sx.toFixed(1)}
                y={p.sy.toFixed(1)}
                fill={pal.fill}
                fontSize="7.5"
                fontWeight="700"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
                textAnchor="middle"
              >
                {c.codeLabel}
              </text>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}
