import { Easing, interpolate, useCurrentFrame } from "remotion";

import { Boil, onTwos, useDrawing } from "../../../shared/ink-morph/boil";
import {
  BrushBand,
  Critter,
  DrawOn,
  Hatching,
  InkBlob,
  MarbledPool,
  Paper,
  Scratches,
  Splatter,
  Void,
  WoodGrain,
} from "../../../shared/ink-morph/marks";
import { arcPath, between, blobPoints, closedPath, openPath, rand, type Pt } from "../../../shared/ink-morph/noise";
import { ACCENTS, INK, STAGE, type Accent } from "../../../shared/ink-morph/palette";
import { Credit, TitleText } from "../../../shared/ink-morph/type";
import { CONTENT } from "./content";

/**
 * The ten scenes, in the reference's order. Each one is a full-frame SVG drawn
 * from the kit, with a placeholder subject: the *staging* — ground, accent,
 * how the subject arrives, how the scene leaves — is the template; what is
 * drawn is yours to replace.
 *
 * Every scene reads time through `onTwos`, so it moves twelve drawings a
 * second like the rest of the film.
 */

const { width: W, height: H } = STAGE;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ramp = (t: number, a: number, b: number, easing?: (n: number) => number) =>
  interpolate(t, [a, b], [0, 1], { ...CLAMP, easing });

const useT = () => onTwos(useCurrentFrame());

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
    {children}
  </svg>
);

const rectPath = (x: number, y: number, w: number, h: number) => `M${x} ${y} H${x + w} V${y + h} H${x} Z`;

type SceneProps = { frames: number; accent: Accent };

/* ── 1 · Screen: a chalk smear resolves into a bulging screen ─────────────── */

/** A screen-shaped rounded rectangle whose sides bow outward. */
const barrel = (cx: number, cy: number, w: number, h: number, bow = 26, rad = 70) => {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return [
    `M${x0 + rad} ${y0}`,
    `Q${cx} ${y0 - bow} ${x1 - rad} ${y0}`,
    `Q${x1} ${y0} ${x1} ${y0 + rad}`,
    `Q${x1 + bow} ${cy} ${x1} ${y1 - rad}`,
    `Q${x1} ${y1} ${x1 - rad} ${y1}`,
    `Q${cx} ${y1 + bow} ${x0 + rad} ${y1}`,
    `Q${x0} ${y1} ${x0} ${y1 - rad}`,
    `Q${x0 - bow} ${cy} ${x0} ${y0 + rad}`,
    `Q${x0} ${y0} ${x0 + rad} ${y0}Z`,
  ].join(" ");
};

export const ScreenScene: React.FC<SceneProps> = ({ accent }) => {
  const t = useT();
  const cx = 960;
  const cy = 520;
  const smear = ramp(t, 20, 36, Easing.out(Easing.cubic));
  const resolve = ramp(t, 34, 48, Easing.out(Easing.back(1.6)));
  const scribble = openPath(
    Array.from({ length: 14 }, (_, i): Pt => [600 + i * 52, 620 + between(-22, 22, "scribble", i)]),
  );
  return (
    <Stage>
      <rect width={W} height={H} fill={t < 6 ? "#ffffff" : t < 14 ? "#9a9a9a" : INK.void} />
      {smear > 0 && resolve < 1 ? (
        <g opacity={1 - resolve}>
          <rect x={cx - (100 + 450 * smear)} y={cy - 20 - 20 * smear} width={200 + 900 * smear} height={40 + 40 * smear} fill={INK.chalk} opacity={0.85} />
          <Scratches seed="smear" dir="horizontal" count={30} opacity={0.9} span={[cy - 70, cy + 70]} />
        </g>
      ) : null}
      {resolve > 0 ? (
        <g transform={`translate(0 ${cy}) scale(1 ${0.08 + 0.92 * resolve}) translate(0 ${-cy})`}>
          <defs>
            <clipPath id="screen-clip">
              <path d={barrel(cx, cy, 1040, 640)} />
            </clipPath>
          </defs>
          <path d={barrel(cx, cy, 1040, 640)} fill={INK.paper} />
          <g clipPath="url(#screen-clip)">
            <Boil id="screen-boil" amount={3}>
              {[760, 1040].map((x, i) => (
                <g key={x}>
                  <DrawOn d={rectPath(x, 300, 120, 170)} progress={ramp(t, 48 + i * 4, 66 + i * 4)} width={8} />
                  <DrawOn d={`M${x + 60} 300 V470 M${x} 385 H${x + 120}`} progress={ramp(t, 56 + i * 4, 70 + i * 4)} width={5} />
                </g>
              ))}
              <DrawOn d="M540 712 Q960 690 1380 706" progress={ramp(t, 52, 70)} width={10} />
              <DrawOn d={scribble} progress={ramp(t, 60, 92)} width={3} />
              {t >= 60 ? <circle cx={700} cy={600} r={12} fill={ACCENTS[accent]} /> : null}
              {t >= 84 ? (
                <>
                  <InkBlob cx={960} cy={580} r={74} squash={1.35} wobble={0.22} seed="screen-figure" />
                  <InkBlob cx={960} cy={466} r={36} wobble={0.12} seed="screen-head" />
                </>
              ) : null}
            </Boil>
          </g>
        </g>
      ) : null}
    </Stage>
  );
};

/* ── 2 · Overhead: an object seen from above; its contents boil and bloom ── */

export const OverheadScene: React.FC<SceneProps> = ({ accent }) => {
  const t = useT();
  const bloom = ramp(t, 100, 150, Easing.in(Easing.quad));
  const cx = interpolate(bloom, [0, 1], [960, 1080]);
  const cy = 540;
  const r = interpolate(t, [6, 20], [0, 150], CLAMP) + bloom * 300;
  const vortex = ramp(t, 60, 100);
  const fade = 1 - ramp(t, 110, 140);
  return (
    <Stage>
      <Paper id="ov-paper" />
      <g opacity={fade}>
        <Boil id="ov-boil" amount={3}>
          {[0, 1, 2].map((i) => (
            <DrawOn
              key={i}
              d={closedPath(blobPoints({ cx: 960, cy, r: 190 + i * 16, seed: `cup${i}`, wobble: 0.04, points: 40 }))}
              progress={ramp(t, i * 4, 24 + i * 4)}
              width={5 - i * 1.4}
            />
          ))}
          <DrawOn d="M1148 590 Q1240 620 1226 690 Q1214 730 1130 700" progress={ramp(t, 18, 34)} width={5} />
          {vortex > 0
            ? Array.from({ length: 7 }, (_, i) => (
                <path
                  key={i}
                  d={arcPath(960, cy, 220 + i * 38 + vortex * 90, t * 0.05 * (1 + i * 0.25) + i, (0.5 + rand("vx", i)) * Math.PI * vortex, `vx${i}`)}
                  fill="none"
                  stroke={INK.ink}
                  strokeWidth={6 - i * 0.6}
                  strokeLinecap="round"
                />
              ))
            : null}
        </Boil>
      </g>
      <Boil id="ov-pool" amount={6} grain={0.012}>
        <MarbledPool cx={cx} cy={cy} r={r} seed="pool" accent={ACCENTS[accent]} wobble={0.1 + bloom * 0.22} />
        <Splatter x={cx} y={cy} seed="ov-splat" progress={ramp(t, 104, 128)} angle={Math.PI} spread={0.9} reach={560} count={40} colors={[INK.ink, ACCENTS[accent]]} />
      </Boil>
    </Stage>
  );
};

/* ── 3 · Title: a dry-brush band paints the title on, then rises ────────── */

export const TitleScene: React.FC<SceneProps> = ({ frames }) => {
  const t = useT();
  const y = 560;
  const head = interpolate(t, [6, 30], [-100, 1990], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const rise = ramp(t, frames - 24, frames - 2, Easing.in(Easing.cubic));
  const scale = 1 + rise * 13;
  return (
    <Stage>
      <Paper id="title-paper" tint={INK.wash} />
      <g transform={`translate(0 ${y - 20 * rise}) scale(1 ${scale}) translate(0 ${-y})`}>
        <BrushBand seed="title-band" y={y} height={96} head={head} start={-80} />
      </g>
      <g opacity={1 - Math.min(1, rise * 4)}>
        <TitleText id="title" y={y} head={head} title={CONTENT.title} author={CONTENT.author} />
        {t >= 40 ? <Critter x={interpolate(t, [40, 170], [260, 1180], CLAMP)} y={y - 60} size={1.2} /> : null}
      </g>
    </Stage>
  );
};

/* ── 4 · Room: hard cut to two tones, hard light, one hot accent ────────── */

export const RoomScene: React.FC<SceneProps> = ({ frames, accent }) => {
  const t = useT();
  const vp: Pt = [960, 420];
  const ceil = 330;
  const across = (y: number) => {
    const k = (y - 0) / (vp[1] - 0);
    return [k * vp[0], W - k * (W - vp[0])] as const;
  };
  return (
    <Stage>
      <Void />
      <g transform={`rotate(${interpolate(t, [0, frames], [-3, 2], CLAMP)} 960 540) translate(960 540) scale(1.08) translate(-960 -540)`}>
        <path d={`M0 0 H${W} L${across(ceil)[1]} ${ceil} H${across(ceil)[0]} Z`} fill={INK.paper} />
        <Boil id="room-boil" amount={2}>
          {Array.from({ length: 9 }, (_, i) => {
            const x = (i + 0.5) * (W / 9);
            const k = ceil / vp[1];
            return <line key={`v${i}`} x1={x} y1={0} x2={x + (vp[0] - x) * k} y2={ceil} stroke={INK.ink} strokeWidth={7} />;
          })}
          {[70, 150, 215, 268, 308].map((y) => {
            const [a, b] = across(y);
            return <line key={`h${y}`} x1={a} y1={y} x2={b} y2={y} stroke={INK.ink} strokeWidth={6} />;
          })}
        </Boil>
        <path d={`M300 ${ceil} H520 L1300 ${H} H820 Z`} fill={INK.paper} opacity={0.88} />
        <path d={`M1500 ${ceil} H1620 L1900 760 H1700 Z`} fill={INK.paper} opacity={0.8} />
        {Array.from({ length: 3 }, (_, r) =>
          Array.from({ length: 3 }, (_, c) => {
            const x = 1160 + c * 120 + r * 40;
            const y = 860 + r * 64;
            return <path key={`${r}${c}`} d={`M${x} ${y} h104 l18 52 h-104 Z`} fill={INK.paper} />;
          }),
        )}
        <line x1={1020} y1={ceil - 40} x2={1020} y2={ceil + 40} stroke={INK.chalk} strokeWidth={2} />
        <rect x={998} y={ceil + 40} width={44} height={34} fill={ACCENTS[accent]} />
      </g>
      <Scratches seed="room-rain" count={50} opacity={0.3} />
    </Stage>
  );
};

/* ── 5 · Lens: a portrait made of splats flies apart; push through the lens ─ */

export const LensScene: React.FC<SceneProps> = ({ accent }) => {
  const t = useT();
  const cx = 960;
  const cy = 520;
  const r = t < 70 ? 120 : 120 * Math.exp(((t - 70) / 98) * Math.log(12));
  const rim = 16 * Math.sqrt(r / 120);
  const horizon = cy + 0.55 * r;
  return (
    <Stage>
      <Paper id="lens-paper" />
      <Boil id="lens-splats" amount={5} grain={0.02}>
        {Array.from({ length: 30 }, (_, i) => {
          const a = between(0, Math.PI * 2, "splat-a", i);
          const dist = between(150, 360, "splat-d", i);
          const size = between(10, 44, "splat-r", i);
          const born = between(0, 14, "splat-born", i);
          const leave = 46 + between(0, 40, "splat-leave", i);
          const dt = Math.max(0, t - leave);
          const x = cx + Math.cos(a) * (dist + dt ** 1.6 * 2.2);
          const y = cy + Math.sin(a) * dist * 0.85 - dt ** 1.4 * 1.4;
          const shrink = Math.max(0.18, 1 - dt / 50);
          const grow = ramp(t, born, born + 8);
          if (x < -60 || x > W + 60 || y < -60) return null;
          return (
            <InkBlob
              key={i}
              cx={x}
              cy={y}
              r={size * shrink * grow}
              seed={`splat${i}`}
              wobble={0.3}
              fill={rand("splat-c", i) < 0.45 ? ACCENTS[accent] : INK.ink}
            />
          );
        })}
      </Boil>
      <defs>
        <clipPath id="lens-clip">
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
        <linearGradient id="lens-sky" gradientUnits="userSpaceOnUse" x1={0} y1={cy - r} x2={0} y2={horizon}>
          <stop offset="0" stopColor={ACCENTS[accent]} />
          <stop offset="1" stopColor="#cdeee6" />
        </linearGradient>
      </defs>
      <g clipPath="url(#lens-clip)">
        <rect x={0} y={0} width={W} height={H} fill="url(#lens-sky)" />
        <rect x={0} y={horizon} width={W} height={Math.max(0, H - horizon + 10)} fill={INK.paper} />
        <InkBlob cx={cx - 0.25 * r} cy={horizon - 0.06 * r} r={0.09 * r} squash={1.5} seed="lens-figure" />
      </g>
      <Boil id="lens-rim" amount={3}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK.ink} strokeWidth={rim} />
        <path d={arcPath(cx, cy, r * 0.82, Math.PI * 1.1, Math.PI * 0.35, "lens-glint", 0.02)} fill="none" stroke={INK.chalk} strokeWidth={rim * 0.35} strokeLinecap="round" />
      </Boil>
    </Stage>
  );
};

/* ── 6 · Slit: the frame closes to a narrow panel; a brush swipe ends it ── */

export const SlitScene: React.FC<SceneProps> = ({ frames, accent }) => {
  const t = useT();
  const close = ramp(t, 0, 12, Easing.out(Easing.cubic));
  const cx = interpolate(t, [0, frames], [960, 1000], CLAMP);
  const hw = interpolate(close, [0, 1], [1100, 190]);
  const tilt = interpolate(t, [0, frames], [0, -7], CLAMP);
  const strokes: string[] = Array.from({ length: 5 }, (_, i) =>
    openPath(
      Array.from({ length: 6 }, (_, k): Pt => [
        cx - 120 + i * 60 + between(-50, 50, "slit-s", i, k),
        140 + k * 170 + between(-30, 30, "slit-sy", i, k),
      ]),
    ),
  );
  return (
    <Stage>
      <defs>
        <clipPath id="slit-sides">
          <rect x={-600} y={-300} width={cx - hw + 600} height={H + 600} />
          <rect x={cx + hw} y={-300} width={W} height={H + 600} />
        </clipPath>
      </defs>
      <g transform={`rotate(${tilt} 960 540)`}>
        <rect x={-300} y={-300} width={W + 600} height={H + 600} fill={ACCENTS.teal} />
        <Boil id="slit-boil" amount={4}>
          {strokes.map((d, i) => (
            <DrawOn key={i} d={d} progress={ramp(t, 8 + i * 6, 30 + i * 6)} width={14 + i * 3} />
          ))}
          {Array.from({ length: 14 }, (_, i) => {
            const x = cx - 150 + i * 22;
            const y = 700 + between(-40, 40, "slit-h", i);
            return t > 30 + i ? <line key={i} x1={x} y1={y} x2={x + 26} y2={y + 34} stroke={INK.ink} strokeWidth={3} /> : null;
          })}
          {t >= 24 ? <circle cx={cx + 40} cy={420} r={12 * (1 + 0.15 * Math.sin(t))} fill={ACCENTS[accent]} /> : null}
        </Boil>
        <rect x={-600} y={-300} width={cx - hw + 600} height={H + 600} fill={INK.void} />
        <rect x={cx + hw} y={-300} width={W} height={H + 600} fill={INK.void} />
        <g clipPath="url(#slit-sides)">
          <Scratches seed="slit-scratch" dir="horizontal" count={26} color="#8a847a" opacity={0.3} />
        </g>
      </g>
    </Stage>
  );
};

/* ── 7 · Almond: an eye-shaped window opens out of the void ─────────────── */

export const AlmondScene: React.FC<SceneProps> = ({ accent }) => {
  const t = useT();
  const drawing = useDrawing();
  const cx = 960;
  const cy = 540;
  const L = interpolate(t, [6, 26], [0, 700], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const Hh = interpolate(t, [22, 60], [5, 150], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const almond = `M${cx - L} ${cy} Q${cx} ${cy - 2 * Hh} ${cx + L} ${cy} Q${cx} ${cy + 2 * Hh} ${cx - L} ${cy}Z`;
  return (
    <Stage>
      <Void />
      <defs>
        <clipPath id="almond-clip">
          <path d={almond} />
        </clipPath>
      </defs>
      <g clipPath="url(#almond-clip)">
        <rect width={W} height={H} fill={INK.paper} />
        <Boil id="almond-boil" amount={4}>
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              d={closedPath(blobPoints({ cx: cx - 120 + i * 30, cy, r: 70 + i * 60, squash: 0.3, wobble: 0.2, seed: `marble${i}`, t: drawing }))}
              fill="none"
              stroke={INK.ink}
              strokeWidth={2 + (i % 3)}
            />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <InkBlob key={i} cx={cx - 400 + i * 190} cy={cy + between(-40, 40, "almond-b", i)} r={between(26, 60, "almond-r", i)} squash={0.6} seed={`almond${i}`} fill={ACCENTS[accent]} />
          ))}
        </Boil>
      </g>
      <path d={almond} fill="none" stroke={INK.chalk} strokeWidth={3} opacity={0.6} />
      {Hh > 20
        ? [0, 1, 2].map((k) => {
            const phase = t / 2 + k * 4;
            return (
              <Splatter
                key={k}
                x={cx + L - 20}
                y={cy}
                seed={`spray-${Math.floor(phase / 12)}-${k}`}
                progress={(phase % 12) / 12}
                angle={0}
                spread={0.35}
                reach={300}
                count={14}
                size={7}
                colors={[INK.chalk, ACCENTS[accent]]}
              />
            );
          })
        : null}
    </Stage>
  );
};

/* ── 8 · Morph: a vortex condenses into a form that never stops changing ── */

export const MorphScene: React.FC<SceneProps> = ({ accent }) => {
  const t = useT();
  const drawing = useDrawing();
  const order: Accent[] = [accent, ...(["teal", "ember", "magenta"] as Accent[]).filter((a) => a !== accent)];
  const swaps = [0, 100, 170, 230];
  const stage = swaps.filter((s) => t >= s).length - 1;
  const tone = ACCENTS[order[stage % order.length]];
  const pop = interpolate(t, [swaps[stage], swaps[stage] + 6], [stage === 0 ? 1 : 0.2, 1], { ...CLAMP, easing: Easing.out(Easing.back(2)) });
  const cx = 960 + 40 * Math.sin(t * 0.02);
  const cy = 540;
  const r = interpolate(t, [30, 60], [0, 210], { ...CLAMP, easing: Easing.out(Easing.back(1.4)) });
  const flip = ramp(t, 150, 190, Easing.inOut(Easing.cubic)) * 180;
  const rot = t * 0.25 + flip;
  const squash = 1 + 0.12 * Math.sin(t * 0.075);
  const vortex = 1 - ramp(t, 40, 56);
  const smoke = openPath(
    Array.from({ length: 8 }, (_, k): Pt => [cx + r * 0.9 + k * 34, cy - r * 0.2 - k * 40 + Math.sin(k + drawing * 0.3) * 14]),
  );
  return (
    <Stage>
      <Paper id="morph-paper" />
      <Boil id="morph-boil" amount={4}>
        {vortex > 0
          ? Array.from({ length: 9 }, (_, i) => (
              <path
                key={i}
                d={arcPath(cx, cy, interpolate(t, [0, 50], [620, 170], CLAMP) * (1 + i * 0.12), t * 0.08 + i, 1.2 + rand("mv", i), `mv${i}`)}
                fill="none"
                stroke={INK.ink}
                strokeWidth={3 + (i % 4) * 2}
                strokeLinecap="round"
                opacity={vortex}
              />
            ))
          : null}
        <g transform={`rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy}) translate(${cx.toFixed(1)} ${cy}) scale(1 ${squash.toFixed(3)}) translate(${(-cx).toFixed(1)} ${-cy})`}>
          <InkBlob cx={cx} cy={cy} r={r} wobble={0.12} seed="morph-body" />
          {r > 120
            ? [-1, 1].map((side) => (
                <ellipse
                  key={side}
                  cx={cx + side * 0.38 * r}
                  cy={cy - 0.12 * r}
                  rx={0.22 * r * pop}
                  ry={0.16 * r * pop}
                  fill={tone}
                  stroke={INK.ink}
                  strokeWidth={6}
                />
              ))
            : null}
          {r > 120
            ? Array.from({ length: 7 }, (_, i) => {
                const x = cx - r * 0.7 + between(0, r * 0.5, "dry", i, drawing % 3);
                const y = cy + r * 0.3 + between(0, r * 0.5, "dry-y", i, drawing % 3);
                return <line key={i} x1={x} y1={y} x2={x + between(20, 70, "dry-l", i)} y2={y - 8} stroke={ACCENTS.ember} strokeWidth={3} opacity={0.8} />;
              })
            : null}
        </g>
        <DrawOn d={smoke} progress={ramp(t, 80, 140)} width={2.5} />
      </Boil>
    </Stage>
  );
};

/* ── 9 · Hold: one big splat on dark grain, between two page edges ─────── */

export const HoldScene: React.FC<SceneProps> = ({ accent }) => {
  const t = useT();
  const from: Pt = [620, 760];
  const to: Pt = [1240, 300];
  const k = ramp(t, 20, 180);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const wiggle = 6 * Math.sin(t * 0.5);
  return (
    <Stage>
      <WoodGrain seed="hold-grain" />
      <Boil id="hold-boil" amount={5} grain={0.014}>
        <InkBlob cx={960} cy={520} r={330} wobble={0.38} seed="hold-splat" fill={ACCENTS[accent]} />
        <InkBlob cx={930} cy={500} r={200} wobble={0.3} seed="hold-splat-in" fill="#ffffff" opacity={0.18} />
        <Splatter x={960} y={520} seed="hold-drops" progress={1} angle={0} spread={Math.PI} reach={560} count={46} size={20} colors={[ACCENTS[accent]]} />
      </Boil>
      <path d={`M0 0 H170 Q232 540 170 ${H} H0 Z`} fill={INK.paper} />
      <path d={`M${W} 0 H${W - 170} Q${W - 232} 540 ${W - 170} ${H} H${W} Z`} fill={INK.paper} />
      {t >= 20 ? (
        <Critter
          x={from[0] + (to[0] - from[0]) * k - Math.sin(angle) * wiggle}
          y={from[1] + (to[1] - from[1]) * k + Math.cos(angle) * wiggle}
          angle={angle}
          size={1.3}
        />
      ) : null}
    </Stage>
  );
};

/* ── 10 · Credits: chalk-hatched objects and drawn-on names, end on white ─ */

const BOOKS = `${rectPath(1120, 520, 380, 90)} ${rectPath(1150, 430, 330, 90)} ${rectPath(1100, 340, 360, 90)}`;
const CUP = `M440 420 H780 L740 760 Q610 800 480 760 Z M780 470 Q880 500 850 600 Q830 660 760 650`;

export const CreditsScene: React.FC<SceneProps> = ({ frames }) => {
  const t = useT();
  const slot = Math.floor(frames / CONTENT.credits.length);
  return (
    <Stage>
      <Void />
      {CONTENT.credits.map((credit, k) => {
        const tc = t - k * slot;
        if (tc < 0 || tc >= slot) return null;
        const erase = Math.round(ramp(tc, slot - 14, slot - 2) * 4) / 4;
        const left = k % 2 === 0;
        return (
          <g key={k} opacity={1 - erase}>
            <Boil id={`credit-boil-${k}`} amount={2}>
              <Hatching
                id={`credit-hatch-${k}`}
                d={left ? BOOKS : CUP}
                bounds={left ? { x: 1100, y: 340, w: 400, h: 270 } : { x: 440, y: 420, w: 440, h: 380 }}
                progress={ramp(tc, 0, 60)}
                seed={`hatch${k}`}
              />
            </Boil>
            <Credit
              id={`credit-${k}`}
              x={left ? 260 : 1660}
              y={540}
              role={credit.role}
              name={credit.name}
              t={tc}
              align={left ? "start" : "end"}
            />
          </g>
        );
      })}
      <rect width={W} height={H} fill="#ffffff" opacity={ramp(t, frames - 10, frames - 2)} />
    </Stage>
  );
};

export const SCENE_COMPONENTS = {
  screen: ScreenScene,
  overhead: OverheadScene,
  title: TitleScene,
  room: RoomScene,
  lens: LensScene,
  slit: SlitScene,
  almond: AlmondScene,
  morph: MorphScene,
  hold: HoldScene,
  credits: CreditsScene,
} as const;
