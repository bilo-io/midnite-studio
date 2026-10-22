import { interpolate, useCurrentFrame } from "remotion";

import { HudLabel } from "./HudPill";
import { countUp, ramp } from "./motion";
import { type Tone, boxGlow, glow } from "./palette";
import { mixHex, useHudSkin } from "./skin";

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
  /**
   * One to three cards side by side. `mark: "cross"` (or `struck`) is the red
   * box crossed through and thrown out; `check` is the green box with a tick;
   * `ring` a neutral card in its tone.
   */
  | { kind: "compare"; cards: { title: string; tone: Tone; mark?: "ring" | "check" | "cross"; struck?: boolean }[] }
  /**
   * A glowing core with satellites; with `pick` the core scans them and
   * selects that one. Nodes with an `icon` are skills: the core activates
   * each in turn and its glyph draws in, in the brand ramp.
   */
  | { kind: "hub"; core: string; nodes: { label: string; value?: number; icon?: SkillIcon }[]; pick?: number }
  /** One huge number that counts up, with a unit. */
  | { kind: "stat"; value: number; unit: string; caption?: string; decimals?: number }
  /**
   * A count that follows an exponential curve drawn under it, digit for digit
   * (`1,000,000`), and gets `suffix` ("++") once it lands.
   */
  | { kind: "growth"; value: number; suffix?: string; caption?: string }
  /**
   * A pie that drains from `from` percent to `to`, red while it is full and
   * green once it has emptied — context freed by a compaction.
   */
  | { kind: "pie"; from: number; to: number; caption: string }
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

/** The glyphs for midnite's skills, Lucide's (ISC), drawn on a 24-unit grid. */
export type SkillIcon = "ideate" | "refine" | "create" | "review" | "swarm";

const SKILL_PATHS: Record<SkillIcon, string[]> = {
  /* lightbulb */
  ideate: [
    "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
    "M9 18h6",
    "M10 22h4",
  ],
  /* sparkles */
  refine: [
    "m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z",
    "M5 3v4",
    "M3 5h4",
    "M19 17v4",
    "M17 19h4",
  ],
  /* hammer */
  create: [
    "m15 12-8.5 8.5c-.83.83-2.17.83-3 0a2.12 2.12 0 0 1 0-3L12 9",
    "M17.64 15 22 10.64",
    "m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91",
  ],
  /* search-check */
  review: ["m8 11 2 2 4-4", "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z", "m21 21-4.3-4.3"],
  /* network */
  swarm: [
    "M17 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z",
    "M3 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z",
    "M10 2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
    "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3",
    "M12 12V8",
  ],
};

/** A skill's glyph, stroked in the brand ramp (blue → violet → pink), drawn on over `draw` 0–1. */
const SkillGlyph: React.FC<{ icon: SkillIcon; size: number; draw: number; id: string }> = ({ icon, size, draw, id }) => {
  const skin = useHudSkin();
  const stops = [skin.tones.blue, skin.tones.cyan, mixHex(skin.tones.cyan, skin.tones.red, 0.55)];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible", filter: `drop-shadow(0 0 5px ${stops[1]})` }}>
      <defs>
        {/* In the glyph's own units: a bounding-box gradient paints nothing on a straight stroke, whose box has no height. */}
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
          {stops.map((c, i) => (
            <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      {SKILL_PATHS[icon].map((d, i) => (
        <path key={i} d={d} stroke={`url(#${id})`} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      ))}
    </svg>
  );
};

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
    case "growth":
      return <Growth {...visual} at={at} />;
    case "pie":
      return <Pie {...visual} at={at} />;
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
  const skin = useHudSkin();
  const t = ramp(frame, at, 12);
  const color = skin.tones[tone];
  return (
    <div
      style={{
        width,
        height,
        border: `2px solid ${color}`,
        borderRadius: 8,
        backgroundColor: `${color}0d`,
        boxShadow: boxGlow(color, 0.8 * skin.glow),
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

/**
 * The kit's two verdicts. A card that is crossed (`mark: "cross"`, or the
 * older `struck`) is a red box with an X drawn corner to corner through its
 * centre, which then shakes and falls back — the thing being thrown out. A
 * `check` card is a green box with a tick drawn into it. Either can stand
 * alone, centred, or the two side by side, red on the left. A `ring` card is
 * the neutral one, in its own tone.
 */
const Compare: React.FC<Extract<Visual, { kind: "compare" }> & { at: number }> = ({ cards, at }) => (
  <div style={{ display: "flex", gap: 90 }}>
    {cards.map((c, i) => {
      const cardAt = at + i * 6;
      const verdict = c.struck || c.mark === "cross" ? "no" : c.mark === "check" ? "yes" : null;
      return verdict ? (
        <Verdict key={i} title={c.title} verdict={verdict} at={cardAt} />
      ) : (
        <NeutralCard key={i} title={c.title} tone={c.tone} at={cardAt} />
      );
    })}
  </div>
);

const NeutralCard: React.FC<{ title: string; tone: Tone; at: number }> = ({ title, tone, at }) => {
  const skin = useHudSkin();
  const color = skin.tones[tone];
  return (
    <Card at={at} tone={tone} width={320} height={210}>
      <HudLabel text={title} color={color} size={14} />
      <Mark kind="ring" color={color} at={at + 6} />
    </Card>
  );
};

const Verdict: React.FC<{ title: string; verdict: "no" | "yes"; at: number }> = ({ title, verdict, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const W = 320;
  const H = 210;
  const tone = verdict === "no" ? "red" : "green";
  const color = skin.tones[tone];
  const s = { stroke: color, fill: "none", strokeLinecap: "round" as const };
  /* The X: one stroke a corner, each from the top down, under the title. */
  const inset = 22;
  const top = 48;
  const diag = Math.hypot(W - 2 * inset, H - top - inset);
  const x1 = ramp(frame, at + 12, 7);
  const x2 = ramp(frame, at + 18, 7);
  /* Thrown out: a short shake as the second stroke lands, then it falls back. */
  const hit = frame - (at + 24);
  const shake = verdict === "no" && hit > 0 && hit < 12 ? Math.sin(hit * 2.1) * 10 * (1 - hit / 12) : 0;
  const gone = verdict === "no" ? ramp(frame, at + 34, 14) : 0;
  const tick = ramp(frame, at + 12, 12);
  return (
    <div style={{ transform: `translateX(${shake}px) scale(${1 - 0.1 * gone})`, opacity: 1 - 0.5 * gone }}>
      <Card at={at} tone={tone} width={W} height={H}>
        <div style={{ position: "absolute", top: 18 }}>
          <HudLabel text={title} color={color} size={14} />
        </div>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 0 7px ${color})` }}>
          {verdict === "no" ? (
            <>
              <line x1={inset} y1={top} x2={W - inset} y2={H - inset} {...s} strokeWidth={6} strokeDasharray={diag} strokeDashoffset={diag * (1 - x1)} />
              <line x1={W - inset} y1={top} x2={inset} y2={H - inset} {...s} strokeWidth={6} strokeDasharray={diag} strokeDashoffset={diag * (1 - x2)} />
            </>
          ) : (
            <path
              d={`M${W / 2 - 44} ${H / 2 + 14} L${W / 2 - 12} ${H / 2 + 44} L${W / 2 + 50} ${H / 2 - 22}`}
              {...s}
              strokeWidth={8}
              strokeLinejoin="round"
              strokeDasharray={140}
              strokeDashoffset={140 * (1 - tick)}
            />
          )}
        </svg>
      </Card>
    </div>
  );
};

/** Order the core visits a hub's nodes in before it settles: out along the row, back, ending on `pick`. */
const scanOrder = (n: number, pick: number): number[] => {
  const out = Array.from({ length: n }, (_, i) => i);
  if (pick < n - 1) for (let i = n - 2; i >= pick; i--) out.push(i);
  else out.push(n - 2, n - 1);
  return out;
};

/** Statuses for the nodes that were not picked, in turn: each a different colour, all faded back. */
const PASSED: readonly Tone[] = ["amber", "red", "blue"];

/**
 * A core routing to its nodes. With a `pick` the core is choosing: a live
 * connector hops from node to node — out along the row and back — before it
 * settles on `pick`, which lights green and is marked selected; the rest fade
 * back, each in a status colour of its own.
 */
const Hub: React.FC<Extract<Visual, { kind: "hub" }> & { at: number }> = ({ core, nodes, pick, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const W = 900;
  /* Room under the nodes for their labels, so a pill below the hub clears them. */
  const H = 390;
  const cx = W / 2;
  const cy = 90;
  const coreIn = ramp(frame, at, 12);
  const spin = (frame - at) * 1.6;
  const HOP = 5;
  const scanAt = at + 10 + nodes.length * 5 + 4;
  /* Skills: no choosing — the core switches each on in turn, and each stays on. */
  const skills = nodes.every((n) => n.icon);
  const ACT = 7;
  const activeAt = (i: number) => scanAt + i * ACT;
  const order = pick === undefined || skills ? [] : scanOrder(nodes.length, pick);
  const pickAt = scanAt + order.length * HOP;
  const hop = Math.floor((frame - scanAt) / HOP);
  /* Which node the connector is on: one of the scan's stops, then the pick for good. */
  const live = skills || pick === undefined || frame < scanAt ? null : frame >= pickAt ? pick : order[hop];
  const picked = !skills && pick !== undefined && frame >= pickAt;
  const settle = ramp(frame, pickAt, 10);
  const xOf = (i: number) => (W / (nodes.length + 1)) * (i + 1);
  const NODE_Y = 280;
  const statusOf = (i: number): Tone => PASSED[(i < (pick ?? 0) ? i : i - 1) % PASSED.length];
  return (
    <div style={{ position: "relative", width: W, height: H }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {nodes.map((_, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={xOf(i)}
            y2={NODE_Y}
            stroke={skin.line}
            strokeWidth={1.5}
            strokeDasharray="5 6"
            opacity={ramp(frame, at + 8 + i * 5, 8) * 0.8 * (picked && i !== pick ? 1 - 0.5 * settle : 1)}
          />
        ))}
        {skills
          ? nodes.map((_, i) => {
              const on = ramp(frame, activeAt(i), 5);
              return on > 0 ? (
                <line
                  key={`on-${i}`}
                  x1={cx}
                  y1={cy}
                  x2={cx + (xOf(i) - cx) * on}
                  y2={cy + (NODE_Y - cy) * on}
                  stroke={skin.tones.cyan}
                  strokeWidth={3}
                  style={{ filter: `drop-shadow(0 0 6px ${skin.tones.cyan})` }}
                />
              ) : null;
            })
          : null}
        {live !== null ? (
          <line
            x1={cx}
            y1={cy}
            x2={cx + (xOf(live) - cx) * (picked ? 1 : ramp(frame, scanAt + hop * HOP, 3))}
            y2={cy + (NODE_Y - cy) * (picked ? 1 : ramp(frame, scanAt + hop * HOP, 3))}
            stroke={picked ? skin.tones.green : skin.tones.cyan}
            strokeWidth={picked ? 5 : 3}
            style={{ filter: `drop-shadow(0 0 6px ${picked ? skin.tones.green : skin.tones.cyan})` }}
          />
        ) : null}
        <g transform={`translate(${cx} ${cy}) scale(${coreIn})`} style={{ filter: `drop-shadow(0 0 10px ${skin.tones.blue})` }}>
          <circle r={34} fill="none" stroke={skin.tones.blue} strokeWidth={3} strokeDasharray="4 5" transform={`rotate(${spin * (live !== null && !picked ? 3 : 1)})`} />
          <circle r={18} fill={`${skin.tones.cyan}33`} stroke={skin.tones.cyan} strokeWidth={3} />
          <circle r={6} fill={skin.tones.cyan} />
        </g>
      </svg>
      <div style={{ position: "absolute", left: cx + 52, top: cy - 8, opacity: coreIn }}>
        <HudLabel text={core} size={13} />
      </div>
      {nodes.map((n, i) => {
        const x = xOf(i);
        const t = ramp(frame, at + 10 + i * 5, 10);
        const isPick = picked && i === pick;
        const passed = picked && i !== pick;
        const active = skills && frame >= activeAt(i) + 3;
        const scanning = (!picked && live === i) || active;
        const color = isPick
          ? skin.tones.green
          : passed
            ? mixHex(skin.tones.blue, skin.tones[statusOf(i)], settle)
            : scanning
              ? skin.tones.cyan
              : skin.tones.blue;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - 46,
              top: NODE_Y - 46,
              width: 92,
              height: 92,
              borderRadius: "50%",
              border: `${isPick || scanning ? 4 : 2}px solid ${color}`,
              boxShadow: boxGlow(color, (isPick ? 1.4 : scanning ? 1 : 0.6) * skin.glow),
              backgroundColor: isPick ? `${skin.tones.green}22` : `${skin.panel}cc`,
              opacity: t * (passed ? 1 - 0.45 * settle : 1),
              transform: `scale(${(0.7 + 0.3 * t) * (isPick ? 1 + 0.12 * settle : scanning ? 1.06 : 1)})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            {n.icon ? (
              <SkillGlyph icon={n.icon} size={52} draw={ramp(frame, activeAt(i) + 3, 12)} id={`skill-${n.icon}-${i}`} />
            ) : (
              <HudLabel text={n.label} size={10} color={isPick ? skin.tones.green : skin.dim} />
            )}
            {n.icon ? (
              <div style={{ position: "absolute", top: 100, whiteSpace: "nowrap" }}>
                <HudLabel text={`/${n.label}`} size={11} color={active ? skin.tones.cyan : skin.dim} />
              </div>
            ) : null}
            {n.value !== undefined ? (
              <div style={{ fontFamily: skin.monoFont, fontSize: 24, color: skin.ink }}>
                {Math.round(countUp(frame, at + 10 + i * 5, 30, n.value))}
              </div>
            ) : null}
            {isPick ? (
              <div style={{ position: "absolute", top: 100, whiteSpace: "nowrap", opacity: settle }}>
                <HudLabel text="✓ selected" size={11} color={skin.tones.green} />
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
  const skin = useHudSkin();
  const t = ramp(frame, at, 10);
  const n = countUp(frame, at, 26, value);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: t }}>
      <div
        style={{
          fontFamily: skin.headFont,
          fontWeight: skin.headWeight,
          fontSize: 190,
          lineHeight: 1,
          color: skin.tones.cyan,
          textShadow: glow(skin.tones.cyan, 1.2 * skin.glow),
        }}
      >
        {n.toFixed(decimals)}
        <span style={{ fontSize: 120, marginLeft: 24 }}>{unit}</span>
      </div>
      <div style={{ width: 520 * ramp(frame, at + 6, 18), height: 3, backgroundColor: skin.tones.cyan, boxShadow: glow(skin.tones.cyan, 0.6 * skin.glow) }} />
      {caption ? <HudLabel text={caption} size={14} color={skin.dim} /> : null}
    </div>
  );
};

const Growth: React.FC<Extract<Visual, { kind: "growth" }> & { at: number }> = ({ value, suffix, caption, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const W = 760;
  const H = 170;
  const K = 5;
  const DRAW = 46;
  /* Linear in time, so the curve itself is what accelerates — and the count with it. */
  const t = interpolate(frame, [at + 4, at + 4 + DRAW], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const curve = (u: number) => (Math.exp(K * u) - 1) / (Math.exp(K) - 1);
  const n = Math.round(value * curve(t));
  const landed = frame >= at + 4 + DRAW;
  const plus = ramp(frame, at + 4 + DRAW, 8);
  const pts = Array.from({ length: 61 }, (_, i) => {
    const u = (i / 60) * t;
    return `${u * W},${H - 12 - curve(u) * (H - 30)}`;
  }).join(" ");
  const head = { x: t * W, y: H - 12 - curve(t) * (H - 30) };
  const c = skin.tones.cyan;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: ramp(frame, at, 8) }}>
      <div
        style={{
          fontFamily: skin.headFont,
          fontWeight: skin.headWeight,
          fontSize: 116,
          lineHeight: 1,
          color: c,
          textShadow: glow(c, 1.2 * skin.glow),
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {n.toLocaleString("en-US")}
        {suffix ? (
          <span style={{ display: "inline-block", width: `${suffix.length * 0.62}em`, marginLeft: 8, opacity: plus, transform: `scale(${0.4 + 0.6 * plus})` }}>
            {landed ? suffix : ""}
          </span>
        ) : null}
      </div>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <line x1={0} y1={H - 2} x2={W} y2={H - 2} stroke={skin.line} strokeWidth={2} />
        <line x1={0} y1={0} x2={0} y2={H - 2} stroke={skin.line} strokeWidth={2} />
        <polyline points={pts} fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 7px ${c})` }} />
        {t > 0 ? <circle cx={head.x} cy={head.y} r={9 + 5 * plus} fill={c} style={{ filter: `drop-shadow(0 0 10px ${c})` }} /> : null}
      </svg>
      {caption ? <HudLabel text={caption} size={14} color={skin.dim} /> : null}
    </div>
  );
};

const Pie: React.FC<Extract<Visual, { kind: "pie" }> & { at: number }> = ({ from, to, caption, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const R = 120;
  /* Full for a second, then drained — the compaction — and green once it is clear. */
  const drain = ramp(frame, at + 30, 26);
  const p = from + (to - from) * drain;
  /* Hex, not `interpolateColors`' rgba(), so the fill can take an alpha suffix. */
  const color =
    drain < 0.6 ? mixHex(skin.tones.red, skin.tones.amber, drain / 0.6) : mixHex(skin.tones.amber, skin.tones.green, (drain - 0.6) / 0.4);
  const a = (Math.min(p, 99.99) / 100) * Math.PI * 2;
  const wedge =
    p <= 0.01
      ? ""
      : `M0 0 L0 ${-R} A${R} ${R} 0 ${a > Math.PI ? 1 : 0} 1 ${Math.sin(a) * R} ${-Math.cos(a) * R} Z`;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, opacity: ramp(frame, at, 8) }}>
      <div style={{ position: "relative", width: 300, height: 300, transform: `scale(${0.85 + 0.15 * ramp(frame, at, 12)})` }}>
        <svg width={300} height={300} viewBox="-150 -150 300 300" style={{ overflow: "visible", filter: `drop-shadow(0 0 10px ${color})` }}>
          <circle r={R} fill={`${skin.panel}cc`} stroke={color} strokeWidth={5} />
          {wedge ? <path d={wedge} fill={`${color}66`} stroke={color} strokeWidth={4} strokeLinejoin="round" /> : null}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: skin.headFont,
            fontWeight: skin.headWeight,
            fontSize: 80,
            color: skin.ink,
            textShadow: glow(color, 0.9 * skin.glow),
          }}
        >
          {Math.round(p)}%
        </div>
      </div>
      <HudLabel text={caption} size={14} color={color} />
    </div>
  );
};

const Gauge: React.FC<Extract<Visual, { kind: "gauge" }> & { at: number }> = ({ percent, caption, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const R = 120;
  const C = 2 * Math.PI * R;
  const p = countUp(frame, at, 34, percent);
  return (
    <div style={{ position: "relative", width: 300, height: 300, opacity: ramp(frame, at, 8) }}>
      <svg width={300} height={300} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={150} cy={150} r={R} fill="none" stroke={skin.line} strokeWidth={10} opacity={0.5} />
        <circle
          cx={150}
          cy={150}
          r={R}
          fill="none"
          stroke={skin.tones.cyan}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p / 100)}
          style={{ filter: `drop-shadow(0 0 8px ${skin.tones.cyan})` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <div style={{ fontFamily: skin.headFont, fontWeight: skin.headWeight, fontSize: 82, color: skin.ink, textShadow: glow(skin.tones.cyan, 0.8 * skin.glow) }}>
          {Math.round(p)}%
        </div>
        <HudLabel text={caption} size={13} color={skin.dim} />
      </div>
    </div>
  );
};

const Bars: React.FC<Extract<Visual, { kind: "bars" }> & { at: number }> = ({ bars, best, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const max = Math.max(...bars.map((b) => b.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 46, height: 320, borderBottom: `2px solid ${skin.line}`, padding: "0 30px" }}>
      {bars.map((b, i) => {
        const g = ramp(frame, at + i * 6, 18);
        const isBest = i === best && frame > at + bars.length * 6 + 10;
        const color = isBest ? skin.tones.cyan : skin.tones.blue;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: skin.monoFont, fontSize: 20, color: skin.ink, opacity: g }}>{Math.round(b.value * g)}</div>
            <div
              style={{
                width: 84,
                height: (250 * b.value * g) / max,
                border: `2px solid ${color}`,
                backgroundColor: `${color}33`,
                boxShadow: boxGlow(color, (isBest ? 1.3 : 0.6) * skin.glow),
                borderRadius: 3,
              }}
            />
            <HudLabel text={b.label} size={12} color={isBest ? skin.tones.cyan : skin.dim} />
          </div>
        );
      })}
    </div>
  );
};

const Lines: React.FC<Extract<Visual, { kind: "lines" }> & { at: number }> = ({ flat, rising, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
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
        <line x1={0} y1={H - 10} x2={W} y2={H - 10} stroke={skin.line} strokeWidth={2} />
        <line x1={0} y1={0} x2={0} y2={H - 10} stroke={skin.line} strokeWidth={2} />
        <g clipPath="url(#lines-reveal)">
          <polyline points={pts(rise)} fill="none" stroke={skin.tones.amber} strokeWidth={4} style={{ filter: `drop-shadow(0 0 6px ${skin.tones.amber})` }} />
          <polyline points={pts(rise.map(() => 0.05))} fill="none" stroke={skin.tones.cyan} strokeWidth={4} style={{ filter: `drop-shadow(0 0 6px ${skin.tones.cyan})` }} />
        </g>
      </svg>
      <div style={{ position: "absolute", right: 0, top: 10, display: "flex", flexDirection: "column", gap: 10, opacity: ramp(frame, at + 30, 10) }}>
        <HudLabel text={`— ${rising}`} color={skin.tones.amber} size={13} />
        <HudLabel text={`— ${flat}`} color={skin.tones.cyan} size={13} />
      </div>
    </div>
  );
};

const Terminal: React.FC<Extract<Visual, { kind: "terminal" }> & { at: number }> = ({ title, lines, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const CHARS_PER_FRAME = 1.4;
  let clock = at + 10;
  return (
    <Card at={at} tone="cyan" width={980} height={70 + lines.length * 46}>
      <div style={{ position: "absolute", left: 22, top: 14 }}>
        <HudLabel text={title} size={12} color={skin.dim} />
      </div>
      <div style={{ alignSelf: "stretch", padding: "34px 30px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {lines.map((line, i) => {
          const start = clock;
          clock += line.length / CHARS_PER_FRAME + 6;
          const shown = Math.max(0, Math.floor((frame - start) * CHARS_PER_FRAME));
          const typing = frame >= start && shown < line.length;
          const isCmd = line.startsWith("$");
          return (
            <div key={i} style={{ fontFamily: skin.monoFont, fontSize: 28, color: isCmd ? skin.ink : skin.tones.cyan, whiteSpace: "pre" }}>
              {line.slice(0, shown)}
              {typing || (i === lines.length - 1 && shown >= line.length) ? (
                <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0.2, color: skin.tones.cyan }}>▌</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const Steps: React.FC<Extract<Visual, { kind: "steps" }> & { at: number }> = ({ steps, at }) => {
  const skin = useHudSkin();
  return (
  <div style={{ display: "flex", gap: 22 }}>
    {steps.map((s, i) => {
      const tone = s.tone ?? "blue";
      return (
        <Card key={i} at={at + i * 7} tone={tone} width={250} height={200}>
          <div style={{ fontFamily: skin.monoFont, fontSize: 34, color: skin.tones[tone], textShadow: glow(skin.tones[tone], 0.6 * skin.glow) }}>
            {String(i + 1).padStart(2, "0")}
          </div>
          <div style={{ fontFamily: skin.headFont, fontWeight: 700, fontSize: 24, color: skin.ink, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {s.title}
          </div>
          <HudLabel text={s.sub} size={11} color={skin.tones[tone]} opacity={0.75} />
        </Card>
      );
    })}
  </div>
  );
};

const Checklist: React.FC<Extract<Visual, { kind: "checklist" }> & { at: number }> = ({ items, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
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
                border: `2px solid ${skin.tones.green}`,
                boxShadow: boxGlow(skin.tones.green, 0.6 * skin.glow),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: skin.tones.green,
                fontSize: 26,
                fontWeight: skin.headWeight,
              }}
            >
              {frame > at + i * 7 + 8 ? "✓" : ""}
            </div>
            <div style={{ fontFamily: skin.monoFont, fontSize: 30, color: skin.ink, letterSpacing: "0.04em" }}>{item}</div>
          </div>
        );
      })}
    </div>
  );
};

const Badge: React.FC<Extract<Visual, { kind: "badge" }> & { at: number }> = ({ caption, at }) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
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
                stroke={skin.tones.cyan}
                strokeWidth={2}
                opacity={0.6}
              />
            );
          })}
        </svg>
        <div style={{ position: "absolute", left: 30, top: 30 }}>
          <svg width={160} height={160} viewBox="0 0 74 74" style={{ filter: `drop-shadow(0 0 10px ${skin.tones.cyan})` }}>
            <circle cx={37} cy={37} r={32} stroke={skin.tones.cyan} strokeWidth={3} fill={`${skin.tones.cyan}14`} />
            <path
              d="M22 38 L33 49 L53 26"
              stroke={skin.tones.cyan}
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={50}
              strokeDashoffset={50 * (1 - ramp(frame, at + 8, 12))}
            />
          </svg>
        </div>
      </div>
      <div style={{ fontFamily: skin.headFont, fontWeight: 700, fontSize: 30, color: skin.ink, letterSpacing: "0.1em", opacity: ramp(frame, at + 16, 10) }}>
        {caption}
      </div>
    </div>
  );
};
