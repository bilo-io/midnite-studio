import { interpolate, useCurrentFrame } from "remotion";

import { HudLabel } from "./HudPill";
import { countUp, ramp } from "./motion";
import { STAGE, TONES, type Tone, boxGlow, glow, headFontFamily, hudMonoFamily } from "./palette";

/**
 * The diagram under each headline. The reference never shows a screenshot or
 * a stock clip — every beat is one small, glowing diagram built from a handful
 * of primitives, assembled in front of the viewer and then dimmed while the
 * payoff word lands. That dimming is the parent `Scene`'s job; a visual only
 * has to build itself from frame `at`.
 *
 * Add a kind here, not in an episode, so the whole series keeps one
 * vocabulary.
 */
export type Visual =
  | { kind: "none" }
  /** Two or three outlined cards side by side; `struck` crosses one out in red. */
  | { kind: "compare"; cards: { title: string; tone: Tone; mark?: "ring" | "check" | "cross"; struck?: boolean }[] }
  /** A glowing core with satellites; `pick` is the index the core routes to. */
  | { kind: "hub"; core: string; nodes: { label: string; value?: number }[]; pick?: number }
  /** One huge number that counts up, with a unit. */
  | { kind: "stat"; value: number; unit: string; caption?: string; decimals?: number }
  /** A ring gauge, 0–100. */
  | { kind: "gauge"; percent: number; caption: string }
  /** Vertical bars growing in turn; `best` glows. */
  | { kind: "bars"; bars: { label: string; value: number }[]; best?: number }
  /** Two series drawn left to right — one flat (ours) against one that climbs. */
  | { kind: "lines"; flat: string; rising: string }
  /** A mono terminal with lines typed in. The tutorial workhorse. */
  | { kind: "terminal"; title: string; lines: string[] }
  /** A row of numbered step cards. */
  | { kind: "steps"; steps: { title: string; sub: string; tone?: Tone }[] }
  /** A ticked list. */
  | { kind: "checklist"; items: string[] }
  /** A big check in a ring with rays — the closing beat. */
  | { kind: "badge"; caption: string };

export const VisualView: React.FC<{ visual: Visual; at: number }> = ({ visual, at }) => {
  switch (visual.kind) {
    case "none":
      return null;
    case "compare":
      return <Compare {...visual} at={at} />;
    case "hub":
      return <Hub {...visual} at={at} />;
    case "stat":
      return <Stat {...visual} at={at} />;
    case "gauge":
      return <Gauge {...visual} at={at} />;
    case "bars":
      return <Bars {...visual} at={at} />;
    case "lines":
      return <Lines {...visual} at={at} />;
    case "terminal":
      return <Terminal {...visual} at={at} />;
    case "steps":
      return <Steps {...visual} at={at} />;
    case "checklist":
      return <Checklist {...visual} at={at} />;
    case "badge":
      return <Badge {...visual} at={at} />;
  }
};

/* ── Primitives ───────────────────────────────────────────────────────────── */

/** An outlined card that pops in: scale from 0.86, border glow up. */
const Card: React.FC<{
  at: number;
  tone: Tone;
  width: number;
  height: number;
  children?: React.ReactNode;
}> = ({ at, tone, width, height, children }) => {
  const frame = useCurrentFrame();
  const t = ramp(frame, at, 12);
  const color = TONES[tone];
  return (
    <div
      style={{
        width,
        height,
        border: `2px solid ${color}`,
        borderRadius: 8,
        backgroundColor: `${color}0d`,
        boxShadow: boxGlow(color, 0.8),
        opacity: t,
        transform: `scale(${0.86 + 0.14 * t})`,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      {children}
    </div>
  );
};

const Mark: React.FC<{ kind: "ring" | "check" | "cross"; color: string; at: number }> = ({ kind, color, at }) => {
  const frame = useCurrentFrame();
  const draw = ramp(frame, at, 14);
  const s = { stroke: color, strokeWidth: 4, fill: "none", strokeLinecap: "round" as const };
  return (
    <svg width={74} height={74} viewBox="0 0 74 74" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
      <circle cx={37} cy={37} r={30} {...s} strokeDasharray={190} strokeDashoffset={190 * (1 - draw)} />
      {kind === "check" ? (
        <path d="M24 38 L33 47 L51 28" {...s} strokeDasharray={42} strokeDashoffset={42 * (1 - ramp(frame, at + 8, 10))} />
      ) : null}
      {kind === "cross" ? (
        <path d="M26 26 L48 48 M48 26 L26 48" {...s} strokeDasharray={64} strokeDashoffset={64 * (1 - ramp(frame, at + 8, 10))} />
      ) : null}
    </svg>
  );
};

/* ── Kinds ────────────────────────────────────────────────────────────────── */

const Compare: React.FC<Extract<Visual, { kind: "compare" }> & { at: number }> = ({ cards, at }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 90 }}>
      {cards.map((c, i) => {
        const cardAt = at + i * 6;
        const strike = c.struck ? ramp(frame, at + 26, 10) : 0;
        const color = c.struck && strike > 0 ? TONES.red : TONES[c.tone];
        return (
          <Card key={i} at={cardAt} tone={c.struck && strike > 0.5 ? "red" : c.tone} width={320} height={210}>
            <HudLabel text={c.title} color={color} size={14} />
            <Mark kind={c.mark ?? "ring"} color={color} at={cardAt + 6} />
            {c.struck ? (
              <div
                style={{
                  position: "absolute",
                  left: -14,
                  top: "50%",
                  width: `${(100 + 9) * strike}%`,
                  height: 4,
                  backgroundColor: TONES.red,
                  boxShadow: glow(TONES.red),
                  transform: "rotate(22deg)",
                  transformOrigin: "left center",
                }}
              />
            ) : null}
          </Card>
        );
      })}
    </div>
  );
};

const Hub: React.FC<Extract<Visual, { kind: "hub" }> & { at: number }> = ({ core, nodes, pick, at }) => {
  const frame = useCurrentFrame();
  const W = 900;
  const H = 360;
  const cx = W / 2;
  const cy = 90;
  const coreIn = ramp(frame, at, 12);
  const spin = (frame - at) * 1.6;
  const pickAt = at + 10 + nodes.length * 5 + 8;
  return (
    <div style={{ position: "relative", width: W, height: H }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {nodes.map((_, i) => {
          const x = (W / (nodes.length + 1)) * (i + 1);
          const y = 280;
          const isPick = i === pick;
          const draw = isPick ? ramp(frame, pickAt, 10) : 0;
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={STAGE.line} strokeWidth={1.5} strokeDasharray="5 6" opacity={ramp(frame, at + 8 + i * 5, 8) * 0.8} />
              {isPick ? (
                <line
                  x1={cx}
                  y1={cy}
                  x2={cx + (x - cx) * draw}
                  y2={cy + (y - cy) * draw}
                  stroke={TONES.cyan}
                  strokeWidth={4}
                  style={{ filter: `drop-shadow(0 0 6px ${TONES.cyan})` }}
                />
              ) : null}
            </g>
          );
        })}
        <g transform={`translate(${cx} ${cy}) scale(${coreIn})`} style={{ filter: `drop-shadow(0 0 10px ${TONES.blue})` }}>
          <circle r={34} fill="none" stroke={TONES.blue} strokeWidth={3} strokeDasharray="4 5" transform={`rotate(${spin})`} />
          <circle r={18} fill={`${TONES.cyan}33`} stroke={TONES.cyan} strokeWidth={3} />
          <circle r={6} fill={TONES.cyan} />
        </g>
      </svg>
      <div style={{ position: "absolute", left: cx + 52, top: cy - 8, opacity: coreIn }}>
        <HudLabel text={core} size={13} />
      </div>
      {nodes.map((n, i) => {
        const x = (W / (nodes.length + 1)) * (i + 1);
        const t = ramp(frame, at + 10 + i * 5, 10);
        const isPick = i === pick && frame >= pickAt + 8;
        const color = isPick ? TONES.cyan : TONES.blue;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - 46,
              top: 280 - 46,
              width: 92,
              height: 92,
              borderRadius: "50%",
              border: `${isPick ? 4 : 2}px solid ${color}`,
              boxShadow: boxGlow(color, isPick ? 1.2 : 0.6),
              backgroundColor: "rgba(3,10,18,0.8)",
              opacity: t,
              transform: `scale(${0.7 + 0.3 * t})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <HudLabel text={n.label} size={10} color={STAGE.dim} />
            {n.value !== undefined ? (
              <div style={{ fontFamily: hudMonoFamily, fontSize: 24, color: STAGE.ink }}>
                {Math.round(countUp(frame, at + 10 + i * 5, 30, n.value))}
              </div>
            ) : null}
            {isPick ? (
              <div style={{ position: "absolute", top: 100 }}>
                <HudLabel text="✓ routed" size={11} color={TONES.cyan} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const Stat: React.FC<Extract<Visual, { kind: "stat" }> & { at: number }> = ({ value, unit, caption, decimals = 0, at }) => {
  const frame = useCurrentFrame();
  const t = ramp(frame, at, 10);
  const n = countUp(frame, at, 26, value);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: t }}>
      <div
        style={{
          fontFamily: headFontFamily,
          fontWeight: 900,
          fontSize: 190,
          lineHeight: 1,
          color: TONES.cyan,
          textShadow: glow(TONES.cyan, 1.2),
        }}
      >
        {n.toFixed(decimals)}
        <span style={{ fontSize: 120, marginLeft: 24 }}>{unit}</span>
      </div>
      <div style={{ width: 520 * ramp(frame, at + 6, 18), height: 3, backgroundColor: TONES.cyan, boxShadow: glow(TONES.cyan, 0.6) }} />
      {caption ? <HudLabel text={caption} size={14} color={STAGE.dim} /> : null}
    </div>
  );
};

const Gauge: React.FC<Extract<Visual, { kind: "gauge" }> & { at: number }> = ({ percent, caption, at }) => {
  const frame = useCurrentFrame();
  const R = 120;
  const C = 2 * Math.PI * R;
  const p = countUp(frame, at, 34, percent);
  return (
    <div style={{ position: "relative", width: 300, height: 300, opacity: ramp(frame, at, 8) }}>
      <svg width={300} height={300} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={150} cy={150} r={R} fill="none" stroke={STAGE.line} strokeWidth={10} opacity={0.5} />
        <circle
          cx={150}
          cy={150}
          r={R}
          fill="none"
          stroke={TONES.cyan}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p / 100)}
          style={{ filter: `drop-shadow(0 0 8px ${TONES.cyan})` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <div style={{ fontFamily: headFontFamily, fontWeight: 900, fontSize: 82, color: STAGE.ink, textShadow: glow(TONES.cyan, 0.8) }}>
          {Math.round(p)}%
        </div>
        <HudLabel text={caption} size={13} color={STAGE.dim} />
      </div>
    </div>
  );
};

const Bars: React.FC<Extract<Visual, { kind: "bars" }> & { at: number }> = ({ bars, best, at }) => {
  const frame = useCurrentFrame();
  const max = Math.max(...bars.map((b) => b.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 46, height: 320, borderBottom: `2px solid ${STAGE.line}`, padding: "0 30px" }}>
      {bars.map((b, i) => {
        const g = ramp(frame, at + i * 6, 18);
        const isBest = i === best && frame > at + bars.length * 6 + 10;
        const color = isBest ? TONES.cyan : TONES.blue;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: hudMonoFamily, fontSize: 20, color: STAGE.ink, opacity: g }}>{Math.round(b.value * g)}</div>
            <div
              style={{
                width: 84,
                height: (250 * b.value * g) / max,
                border: `2px solid ${color}`,
                backgroundColor: `${color}33`,
                boxShadow: boxGlow(color, isBest ? 1.3 : 0.6),
                borderRadius: 3,
              }}
            />
            <HudLabel text={b.label} size={12} color={isBest ? TONES.cyan : STAGE.dim} />
          </div>
        );
      })}
    </div>
  );
};

const Lines: React.FC<Extract<Visual, { kind: "lines" }> & { at: number }> = ({ flat, rising, at }) => {
  const frame = useCurrentFrame();
  const W = 760;
  const H = 300;
  const draw = ramp(frame, at, 40);
  const rise = [0, 0.04, 0.12, 0.55, 0.42, 0.6, 0.68];
  const pts = (ys: number[]) => ys.map((y, i) => `${(i / (ys.length - 1)) * W},${H - 30 - y * (H - 60)}`).join(" ");
  return (
    <div style={{ position: "relative", width: W, height: H }}>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <defs>
          <clipPath id="lines-reveal">
            <rect x={0} y={-20} width={W * draw} height={H + 40} />
          </clipPath>
        </defs>
        <line x1={0} y1={H - 10} x2={W} y2={H - 10} stroke={STAGE.line} strokeWidth={2} />
        <line x1={0} y1={0} x2={0} y2={H - 10} stroke={STAGE.line} strokeWidth={2} />
        <g clipPath="url(#lines-reveal)">
          <polyline points={pts(rise)} fill="none" stroke={TONES.amber} strokeWidth={4} style={{ filter: `drop-shadow(0 0 6px ${TONES.amber})` }} />
          <polyline points={pts(rise.map(() => 0.05))} fill="none" stroke={TONES.cyan} strokeWidth={4} style={{ filter: `drop-shadow(0 0 6px ${TONES.cyan})` }} />
        </g>
      </svg>
      <div style={{ position: "absolute", right: 0, top: 10, display: "flex", flexDirection: "column", gap: 10, opacity: ramp(frame, at + 30, 10) }}>
        <HudLabel text={`— ${rising}`} color={TONES.amber} size={13} />
        <HudLabel text={`— ${flat}`} color={TONES.cyan} size={13} />
      </div>
    </div>
  );
};

const Terminal: React.FC<Extract<Visual, { kind: "terminal" }> & { at: number }> = ({ title, lines, at }) => {
  const frame = useCurrentFrame();
  const CHARS_PER_FRAME = 1.4;
  let clock = at + 10;
  return (
    <Card at={at} tone="cyan" width={980} height={70 + lines.length * 46}>
      <div style={{ position: "absolute", left: 22, top: 14 }}>
        <HudLabel text={title} size={12} color={STAGE.dim} />
      </div>
      <div style={{ alignSelf: "stretch", padding: "34px 30px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {lines.map((line, i) => {
          const start = clock;
          clock += line.length / CHARS_PER_FRAME + 6;
          const shown = Math.max(0, Math.floor((frame - start) * CHARS_PER_FRAME));
          const typing = frame >= start && shown < line.length;
          const isCmd = line.startsWith("$");
          return (
            <div key={i} style={{ fontFamily: hudMonoFamily, fontSize: 28, color: isCmd ? STAGE.ink : TONES.cyan, whiteSpace: "pre" }}>
              {line.slice(0, shown)}
              {typing || (i === lines.length - 1 && shown >= line.length) ? (
                <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0.2, color: TONES.cyan }}>▌</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const Steps: React.FC<Extract<Visual, { kind: "steps" }> & { at: number }> = ({ steps, at }) => (
  <div style={{ display: "flex", gap: 22 }}>
    {steps.map((s, i) => {
      const tone = s.tone ?? "blue";
      return (
        <Card key={i} at={at + i * 7} tone={tone} width={250} height={200}>
          <div style={{ fontFamily: hudMonoFamily, fontSize: 34, color: TONES[tone], textShadow: glow(TONES[tone], 0.6) }}>
            {String(i + 1).padStart(2, "0")}
          </div>
          <div style={{ fontFamily: headFontFamily, fontWeight: 700, fontSize: 24, color: STAGE.ink, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {s.title}
          </div>
          <HudLabel text={s.sub} size={11} color={TONES[tone]} opacity={0.75} />
        </Card>
      );
    })}
  </div>
);

const Checklist: React.FC<Extract<Visual, { kind: "checklist" }> & { at: number }> = ({ items, at }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {items.map((item, i) => {
        const t = ramp(frame, at + i * 7, 10);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, opacity: t, transform: `translateX(${(1 - t) * -30}px)` }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 6,
                border: `2px solid ${TONES.green}`,
                boxShadow: boxGlow(TONES.green, 0.6),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: TONES.green,
                fontSize: 26,
                fontWeight: 900,
              }}
            >
              {frame > at + i * 7 + 8 ? "✓" : ""}
            </div>
            <div style={{ fontFamily: hudMonoFamily, fontSize: 30, color: STAGE.ink, letterSpacing: "0.04em" }}>{item}</div>
          </div>
        );
      })}
    </div>
  );
};

const Badge: React.FC<Extract<Visual, { kind: "badge" }> & { at: number }> = ({ caption, at }) => {
  const frame = useCurrentFrame();
  const t = ramp(frame, at, 14);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
      <div style={{ position: "relative", width: 220, height: 220, transform: `scale(${0.8 + 0.2 * t})`, opacity: t }}>
        <svg width={220} height={220} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const len = interpolate(frame - at, [6, 18], [0, i % 2 ? 14 : 24], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <line
                key={i}
                x1={110 + Math.cos(a) * 98}
                y1={110 + Math.sin(a) * 98}
                x2={110 + Math.cos(a) * (98 + len)}
                y2={110 + Math.sin(a) * (98 + len)}
                stroke={TONES.cyan}
                strokeWidth={2}
                opacity={0.6}
              />
            );
          })}
        </svg>
        <div style={{ position: "absolute", left: 30, top: 30 }}>
          <svg width={160} height={160} viewBox="0 0 74 74" style={{ filter: `drop-shadow(0 0 10px ${TONES.cyan})` }}>
            <circle cx={37} cy={37} r={32} stroke={TONES.cyan} strokeWidth={3} fill={`${TONES.cyan}14`} />
            <path
              d="M22 38 L33 49 L53 26"
              stroke={TONES.cyan}
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={50}
              strokeDashoffset={50 * (1 - ramp(frame, at + 8, 12))}
            />
          </svg>
        </div>
      </div>
      <div style={{ fontFamily: headFontFamily, fontWeight: 700, fontSize: 30, color: STAGE.ink, letterSpacing: "0.1em", opacity: ramp(frame, at + 16, 10) }}>
        {caption}
      </div>
    </div>
  );
};
