import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { onTwos } from "./boil";
import { BrushBand } from "./marks";
import { blobPath } from "./noise";
import { COVER, INK, STAGE } from "./palette";

/**
 * How one scene takes over from the last. A reveal wraps the *incoming* scene,
 * which is mounted on top of the outgoing one for the reveal's length, and
 * clips it to a shape that grows until it covers the frame. Every reveal runs
 * on twos like the rest of the film.
 *
 * The kinds, in the order the reference leans on them:
 *
 * - `bloom` — an ink blob opens out of a point and floods the frame.
 * - `lens`  — push through an object: a circle grows from it while the incoming
 *             scene scales up inside it, so the next shot was *in* the last one.
 * - `wipe`  — a dry-brush band drags across at an angle, the next scene behind it.
 * - `almond`— an eye-shaped slit opens from a hairline to the full frame.
 * - `cut`   — none. The reference cuts hard exactly once; so should a film made
 *             from this.
 */
export type RevealSpec =
  | { kind: "cut" }
  | { kind: "bloom"; x: number; y: number; seed: string }
  | { kind: "lens"; x: number; y: number; r0: number }
  | { kind: "wipe"; angle: number; seed: string }
  | { kind: "almond"; x: number; y: number; l0?: number; h0?: number };

export const Reveal: React.FC<{ spec: RevealSpec; frames: number; children: React.ReactNode }> = ({
  spec,
  frames,
  children,
}) => {
  const frame = onTwos(useCurrentFrame());
  if (spec.kind === "cut" || frame >= frames) return <AbsoluteFill>{children}</AbsoluteFill>;
  const p = interpolate(frame, [0, frames], [0, 1], { extrapolateRight: "clamp" });

  if (spec.kind === "bloom") {
    const r = Easing.in(Easing.cubic)(p) * COVER * 1.5;
    const d = blobPath({ cx: spec.x, cy: spec.y, r, seed: spec.seed, wobble: 0.28, t: frame / 2 });
    return <AbsoluteFill style={{ clipPath: `path('${d}')` }}>{children}</AbsoluteFill>;
  }

  if (spec.kind === "lens") {
    const e = Easing.in(Easing.exp)(p);
    const r = spec.r0 + (COVER * 1.6 - spec.r0) * e;
    const scale = interpolate(e, [0, 1], [0.4, 1]);
    return (
      <AbsoluteFill style={{ clipPath: `circle(${r.toFixed(1)}px at ${spec.x}px ${spec.y}px)` }}>
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${spec.x}px ${spec.y}px` }}>
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (spec.kind === "almond") {
    const l0 = spec.l0 ?? 0;
    const h0 = spec.h0 ?? 4;
    const L = interpolate(p, [0, 0.5], [l0, 1500], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
    const Hh = interpolate(p, [0.2, 1], [h0, 1300], { extrapolateLeft: "clamp", easing: Easing.in(Easing.quad) });
    const { x, y } = spec;
    const d = `M${x - L} ${y} Q${x} ${y - 2 * Hh} ${x + L} ${y} Q${x} ${y + 2 * Hh} ${x - L} ${y}Z`;
    return <AbsoluteFill style={{ clipPath: `path('${d}')` }}>{children}</AbsoluteFill>;
  }

  // wipe: work in a frame rotated by `angle`, where the band runs left to right.
  const reach = COVER + 200;
  const head = interpolate(Easing.inOut(Easing.cubic)(p), [0, 1], [-reach, reach + 300]);
  const { width: W, height: H } = STAGE;
  const cx = W / 2;
  const cy = H / 2;
  const rot = (x: number, y: number) => {
    const c = Math.cos(spec.angle);
    const s = Math.sin(spec.angle);
    return `${(cx + x * c - y * s).toFixed(1)}px ${(cy + x * s + y * c).toFixed(1)}px`;
  };
  const poly = `polygon(${rot(-reach * 2, -reach * 2)}, ${rot(head - 140, -reach * 2)}, ${rot(head - 140, reach * 2)}, ${rot(-reach * 2, reach * 2)})`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: poly }}>{children}</AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(${cx} ${cy}) rotate(${((spec.angle * 180) / Math.PI).toFixed(2)})`}>
          <BrushBand seed={spec.seed} y={0} height={reach * 2.2} start={head - 420} head={head} color={INK.ink} gap={INK.void} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
