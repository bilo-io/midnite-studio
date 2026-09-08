import { useEffect, useRef } from 'react';

import { useReducedMotion } from '../../hooks/use-reduced-motion';

/** Nodes across and down. 8 × 5 = 40 nodes, ~90 edges — see the CPU note below. */
const COLS = 8;
const ROWS = 5;

/** Frames per second the loop aims for, not the display's refresh rate. */
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

/** How far a node may be pulled from its home position, in px. */
const MAX_PULL = 26;
/** Beyond this distance from the pointer a node is not pulled at all. */
const PULL_RADIUS = 320;
/** Fraction of the remaining distance each node closes per frame — the easing. */
const EASE = 0.09;

/** The graph's lane palette, matching `--ws-lane-*`. Indexed per column. */
const LANES = [
  [205, 82] as const,
  [144, 62] as const,
  [265, 70] as const,
  [50, 82] as const,
];

type Node = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  /** Phase offset so the ambient drift is not in lockstep across the grid. */
  phase: number;
  lane: number;
};

/**
 * The hero's background: a lane graph that leans towards the cursor.
 *
 * Nodes on a loose grid, edges to the neighbour on the right and the one
 * diagonally down — which is what a commit graph's lanes and merges look like,
 * drawn in the same four hues the real graph uses (`--ws-lane-*`, themselves
 * lifted from `packages/app/src/features/graph/lane-colors.ts`). Pointing at it
 * pulls the nearby nodes towards the cursor and the edges follow.
 *
 * **Canvas 2D and no WebGL.** 40 nodes and ~90 one-pixel lines is not a GPU
 * problem, and a WebGL context on a marketing page costs a compile, a context
 * that can be lost, and a fallback path nobody tests.
 *
 * **The CPU budget is the design constraint,** not an afterthought — this runs
 * for as long as the tab is open:
 *
 * - the loop is capped at 30fps by timestamp, so a 120Hz display does not do
 *   four times the work for a drift nobody can see;
 * - it stops dead on `document.hidden` (a backgrounded tab still gets rAF
 *   callbacks in some engines, and always did before the throttle landed) and
 *   restarts on `visibilitychange`;
 * - it stops when the hero scrolls out of view, via an IntersectionObserver on
 *   the canvas itself. Reading the rest of the page costs nothing;
 * - the pointer handler only records coordinates. All the arithmetic happens in
 *   the frame, so a fast mouse cannot force extra work.
 *
 * Under reduced motion this renders nothing at all and the parent's CSS
 * gradient is the whole backdrop — a still frame, not a slower animation.
 */
export const HeroBackdrop = () => {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let nodes: Node[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    /** Pointer position in CSS px, or null when the pointer has left. */
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;
    let lastFrame = 0;
    let running = false;
    let onScreen = true;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Nodes sit inside a margin so the outermost ones can be pulled inward
      // without leaving the canvas.
      const marginX = width / (COLS + 1);
      const marginY = height / (ROWS + 1);
      nodes = [];
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const homeX = marginX * (col + 1);
          const homeY = marginY * (row + 1);
          nodes.push({
            homeX,
            homeY,
            x: homeX,
            y: homeY,
            phase: (col * 7 + row * 13) * 0.37,
            lane: (col + row) % LANES.length,
          });
        }
      }
    };

    const laneStroke = (lane: number, alpha: number): string => {
      const [h, s] = LANES[lane] ?? LANES[0]!;
      return `hsl(${h} ${s}% 62% / ${alpha})`;
    };

    const draw = (time: number) => {
      const drift = time / 2600;
      ctx.clearRect(0, 0, width, height);

      for (const node of nodes) {
        // Ambient drift: a slow lissajous a few pixels wide, so the grid is
        // alive before anyone touches it.
        const driftX = Math.sin(drift + node.phase) * 4;
        const driftY = Math.cos(drift * 0.8 + node.phase) * 3;

        let targetX = node.homeX + driftX;
        let targetY = node.homeY + driftY;

        if (pointer) {
          const dx = pointer.x - node.homeX;
          const dy = pointer.y - node.homeY;
          const dist = Math.hypot(dx, dy);
          if (dist < PULL_RADIUS && dist > 0.001) {
            // Falls off linearly from the pointer, so the tilt is a local
            // deformation rather than the whole grid sliding.
            const strength = (1 - dist / PULL_RADIUS) * MAX_PULL;
            targetX += (dx / dist) * strength;
            targetY += (dy / dist) * strength;
          }
        }

        node.x += (targetX - node.x) * EASE;
        node.y += (targetY - node.y) * EASE;
      }

      // Edges first, so the nodes cap their own line ends.
      ctx.lineWidth = 1;
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const node = nodes[row * COLS + col];
          if (!node) continue;
          const right = col + 1 < COLS ? nodes[row * COLS + col + 1] : undefined;
          const down = row + 1 < ROWS ? nodes[(row + 1) * COLS + col] : undefined;
          for (const other of [right, down]) {
            if (!other) continue;
            ctx.strokeStyle = laneStroke(node.lane, 0.16);
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }
      }

      for (const node of nodes) {
        const pulled = Math.hypot(node.x - node.homeX, node.y - node.homeY);
        const radius = 2 + Math.min(pulled / MAX_PULL, 1) * 2.2;
        ctx.fillStyle = laneStroke(node.lane, 0.5);
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (time - lastFrame < FRAME_MS) return;
      lastFrame = time;
      draw(time);
    };

    const start = () => {
      if (running || document.hidden || !onScreen) return;
      running = true;
      lastFrame = 0;
      raf = requestAnimationFrame(frame);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onPointerLeave = () => {
      pointer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      layout();
      // One frame while paused, so a resize behind the reader's back does not
      // leave a stretched bitmap.
      if (!running) draw(performance.now());
    };

    layout();
    draw(performance.now());

    // `window`, not the canvas: the canvas is `pointer-events: none` so it never
    // eats a click on the copy above it, which also means it never sees a
    // pointer event of its own.
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((entry) => entry.isIntersecting);
              if (onScreen) start();
              else stop();
            },
            { threshold: 0 },
          );
    observer?.observe(canvas);

    start();

    return () => {
      stop();
      observer?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="hero-backdrop"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
};
