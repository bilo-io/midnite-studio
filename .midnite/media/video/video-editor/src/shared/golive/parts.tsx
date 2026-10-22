import { Fragment } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  useCurrentFrame,
} from "remotion";

import { FG, LIGHT, RAINBOW, THEME, type Theme, themeRainbowStops, themeRainbowText } from "../brand";
import { monoFontFamily, uiFontFamily } from "../fonts";
import { loopBySlug } from "../loopIcons";
import { mixHex } from "../neon-hud/skin";
import { MidniteWordmark } from "../MidniteWordmark";
import { ShimmerLine } from "../ShimmerLine";
import { TypedTitle } from "../TypedTitle";
import { Typewriter } from "../Typewriter";
import { LiquidWipe } from "../LiquidWipe";
import { useStage } from "./stage";

/**
 * The golive kit's building blocks — one per kind of beat the go-live promo
 * has. Moved here from `templates/midnite/golive-promo/parts.tsx` so a project
 * can use them without copying them; the template is now one of their callers.
 *
 * Each is a simplified copy of the promo's version, kept to what shows the
 * idea. Every one takes `at`, the composition frame it starts on, because the
 * colours are read from the stage's wipe schedule (`useStage().themeMixAt`,
 * see `stage.ts`), which is indexed by composition frame, while
 * `useCurrentFrame()` inside a `<Sequence>` is the sequence's own clock.
 */

export const STAGE = { width: 1920, height: 1080 } as const;
/** The tour window: the size every claim's card is, so the layout never jumps between cuts. */
export const WINDOW = { width: 1391, height: 840 } as const;
const WINDOW_LEFT = (STAGE.width - WINDOW.width) / 2;
const CAPTION = { top: 64, size: 50, line: 60 } as const;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Ink that follows the stage under it: `FG.base` on dark, `LIGHT.FG.base` on light. */
export const useInk = (): ((frame: number, x: number) => string) => {
  const { themeMixAt } = useStage();
  return (frame, x) => interpolateColors(themeMixAt(frame, x), [0, 1], [FG.base, LIGHT.FG.base]);
};

/* ── The stage itself ─────────────────────────────────────────────────────── */

/**
 * Black, then every wipe of the stage stacked in order, each covering the last
 * — so the page at any frame is simply "whatever the most recent wipe has made
 * it". `over` mounts something directly above one wipe (by id), so the next
 * wipe covers it with no hard edge: atmosphere that belongs to one stretch of
 * one stage.
 */
export const StageWipes: React.FC<{ over?: Record<string, React.ReactNode> }> = ({ over = {} }) => {
  const frame = useCurrentFrame();
  const { wipes, wipeProgress } = useStage();
  return (
    <AbsoluteFill>
      {wipes.map((wipe) => (
        <Fragment key={wipe.id}>
          <LiquidWipe
            id={wipe.id}
            progress={wipeProgress(frame, wipe)}
            background={wipe.background}
            direction={wipe.direction}
            accent={wipe.accent}
            seed={wipe.seed}
          />
          {over[wipe.id] ?? null}
        </Fragment>
      ))}
    </AbsoluteFill>
  );
};

/* ── The placeholder card ─────────────────────────────────────────────────── */

/**
 * A shot that has not been recorded yet: the promo's pending card.
 *
 * Same size and place as the recording will be, so the cut is watchable before
 * the footage exists and nothing moves when it lands. The well stays dark on
 * both stages because every real shot is an app window. The label carries
 * overhang room: gradient text is painted only inside its box, and without it
 * a descender is cut off square (the promo's v7 fix).
 */
export const PlaceholderCard: React.FC<{
  label: string;
  width: number;
  height: number;
  theme: Theme;
  radius?: number;
  /**
   * Put the label in the top-left corner, small, instead of in the middle —
   * for a card that has type centred over it (the slugs), where a centred
   * label would be read as part of that type.
   */
  corner?: boolean;
}> = ({ label, width, height, theme, radius = 18, corner = false }) => {
  const frame = useCurrentFrame();
  const sweep = (frame % 105) / 105;

  return (
    <div style={{ position: "relative", width, height }}>
      {/* The halo: the theme's ramp, turning slowly behind the card. */}
      <div
        style={{
          position: "absolute",
          inset: -26,
          borderRadius: radius + 26,
          backgroundImage: `conic-gradient(from ${(frame * 0.7) % 360}deg, ${themeRainbowStops(theme)})`,
          filter: "blur(38px)",
          opacity: theme === "dark" ? 0.4 : 0.26,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: "#0b0b12",
          border: `1px solid ${theme === "dark" ? THEME.dark.BORDER.base : "#2a2a36"}`,
          boxShadow: "0 34px 90px rgba(0, 0, 0, 0.62)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundImage: `linear-gradient(90deg, ${RAINBOW.join(", ")})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${sweep * 100}%`,
            height: height * 0.42,
            marginTop: height * -0.21,
            opacity: interpolate(sweep, [0, 0.12, 0.88, 1], [0, 0.3, 0.3, 0]),
            filter: "blur(60px)",
            backgroundImage: `linear-gradient(180deg, transparent, ${RAINBOW[3]}, transparent)`,
          }}
        />
        <div
          style={
            corner
              ? { position: "absolute", left: 28, top: 26, textAlign: "left", transform: "scale(0.5)", transformOrigin: "0 0", opacity: 0.8 }
              : { position: "relative", textAlign: "center", padding: 40 }
          }
        >
          <div
            style={{
              fontFamily: monoFontFamily,
              fontSize: Math.max(14, Math.round(height * 0.026)),
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#6f6f85",
              marginBottom: 18,
            }}
          >
            Placeholder
          </div>
          <div
            style={{
              fontFamily: uiFontFamily,
              fontWeight: 600,
              fontSize: Math.round(Math.min(height * 0.075, width * 0.045)),
              lineHeight: 1.1,
              backgroundImage: `linear-gradient(96deg, ${RAINBOW[0]}, ${RAINBOW[3]}, ${RAINBOW[5]})`,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              padding: "0.12em 0.12em 0.28em",
              margin: "-0.12em -0.12em -0.28em",
            }}
          >
            {label}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── The strike ───────────────────────────────────────────────────────────── */

export type Approach = "left" | "right" | "top" | "bottom";

/**
 * A card *struck* onto the stage: 70% → 100% in seven frames, eased out hard,
 * with a nudge from one edge. Seven frames is a quarter second — over before
 * the ear has finished the transient it lands on. Cycle `from` between cuts so
 * consecutive cards arrive from different sides.
 */
export const Strike: React.FC<{ from: Approach; children: React.ReactNode }> = ({ from, children }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 7], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const travel = (1 - enter) * 60;
  const x = from === "left" ? -travel : from === "right" ? travel : 0;
  const y = from === "top" ? -travel : from === "bottom" ? travel : 0;
  return (
    <div style={{ transform: `translate(${x}px, ${y}px) scale(${0.7 + enter * 0.3})`, opacity: Math.min(1, enter * 3) }}>
      {children}
    </div>
  );
};

/* ── A claim ──────────────────────────────────────────────────────────────── */

/**
 * The tour layout: a typed title over the window, left-aligned to the window's
 * edge, with the mark at the head of the line. Left-aligned rather than centred
 * because the mark is a persistent object and cannot move between cuts just
 * because the next title is shorter.
 */
export const Claim: React.FC<{
  title: string;
  shot: string;
  at: number;
  theme: Theme;
  from: Approach;
}> = ({ title, shot, at, theme, from }) => {
  const frame = useCurrentFrame();
  const inkAt = useInk();
  const ink = inkAt(at + frame, WINDOW_LEFT + 80);

  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: CAPTION.top, gap: 40 }}>
      <div style={{ width: WINDOW.width, display: "flex", alignItems: "center", gap: 22 }}>
        <MidniteWordmark size={CAPTION.size} markOnly theme={theme} aura={0.5} />
        <TypedTitle
          text={title}
          fontSize={CAPTION.size}
          lineHeight={CAPTION.line}
          color={ink}
          theme={theme}
          delay={3}
          charsPerFrame={2.2}
        />
      </div>
      <Strike from={from}>
        <PlaceholderCard label={shot} width={WINDOW.width} height={WINDOW.height} theme={theme} />
      </Strike>
    </AbsoluteFill>
  );
};

/* ── The statement ────────────────────────────────────────────────────────── */

/**
 * One half of a sentence alone on its stage, landing on the frame its own wipe
 * starts — so the stage turning over and the words arriving read as one event.
 * The highlight is a sawtooth: it crosses in 34 frames and waits out the rest
 * of a 46-frame period off the edge, starting ten frames in so it is not part
 * of the entrance.
 */
export const Statement: React.FC<{ text: string; at: number; theme: Theme; length: number }> = ({
  text,
  at,
  theme,
  length,
}) => {
  const frame = useCurrentFrame();
  const inkAt = useInk();
  const arrive = interpolate(frame, [0, 12], [0, 1], clamp);
  const leave = interpolate(frame, [length - 8, length], [1, 0], clamp);
  const cycles = (frame - 10) / 46;
  const shimmer =
    cycles < 0 ? -0.3 : interpolate(cycles - Math.floor(cycles), [0, 34 / 46], [-0.2, 1.2], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: arrive * leave, transform: `translateY(${(1 - arrive) * 18}px)` }}>
        <ShimmerLine shimmer={shimmer} color={inkAt(at + frame, 960)} fontSize={104} fontWeight={600} stroke={2.2} theme={theme}>
          {text}
        </ShimmerLine>
      </div>
    </AbsoluteFill>
  );
};

/* ── The breath and the implosion ─────────────────────────────────────────── */

/**
 * The strip-back before the drop: the mark back to centre and bigger than it
 * has been, with motes spiralling in from a wide ring and *accelerating* in
 * (`Easing.in`) so they all arrive by `implode` — then nothing, until the drop
 * wipes the stage. Every mote is a closed-form function of its index and the
 * frame: no state, no randomness, so any frame renders the same on its own.
 */
export const Breath: React.FC<{
  at: number;
  implode: number;
  drop: number;
  /** False when a persistent mark of the film's own flies to the centre instead (as in the promo). */
  mark?: boolean;
}> = ({ at, implode, drop, mark = true }) => {
  const frame = useCurrentFrame();
  const { themeMixAt } = useStage();
  const f = at + frame;
  const theme = themeMixAt(f, 960) > 0.5 ? "light" : "dark";
  const pull = interpolate(f, [at, implode], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const swell = interpolate(f, [at, implode, drop], [0.9, 1.25, 1.35], clamp);
  const ramp = THEME[theme].RAINBOW;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {Array.from({ length: 36 }, (_, i) => {
        const angle = (i / 36) * Math.PI * 2 + pull * 2.2 + (i % 3) * 0.2;
        const r = (560 + (i % 5) * 60) * (1 - pull);
        const inside = r < 90 ? r / 90 : 1;
        const size = (10 + (i % 4) * 6) * (0.4 + 0.6 * inside);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 960 + Math.cos(angle) * r - size / 2,
              top: 540 + Math.sin(angle) * r * 0.62 - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: ramp[i % ramp.length],
              filter: "blur(2px)",
              opacity: 0.75 * inside * interpolate(f, [at, at + 10], [0, 1], clamp),
            }}
          />
        );
      })}
      {mark ? (
        <div style={{ transform: `scale(${swell})` }}>
          <MidniteWordmark size={230} markOnly theme={theme} aura={0.6 + pull * 0.4} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ── Typed slugs over a card ──────────────────────────────────────────────── */

const SLUG_TYPE: React.CSSProperties = {
  fontFamily: uiFontFamily,
  fontWeight: 600,
  fontSize: 72,
  lineHeight: 1.15,
  whiteSpace: "nowrap",
  padding: "0.12em 0.12em 0.28em",
  margin: "-0.12em -0.12em -0.28em",
};

/** The brand ramp's blue end, weighted up — blue, indigo, violet, as a closed loop. */
const slugStops = (theme: Theme): string => {
  const r = THEME[theme].RAINBOW;
  return [r[0], r[1], r[0], r[2], r[1], r[0]].join(", ");
};

/** One tile of the ramp; it repeats along the line, so drifting by any amount never shows a seam. */
const FLOW_TILE = 640;

/** A ramp clipped to the glyphs, `offset` px along — pass a frame-driven offset and it drifts. */
const flowing = (stops: string, offset: number) =>
  ({
    backgroundImage: `linear-gradient(90deg, ${stops})`,
    backgroundSize: `${FLOW_TILE}px 100%`,
    backgroundPosition: `${offset % FLOW_TILE}px 0`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  }) as const;

/**
 * The harness pattern: lines typed in the stage's ramp, centred over a centred
 * card, behind a radial scrim so they read over a busy recording. Each line has
 * a fixed-height slot and mounts only on its own beat, so the column never
 * shifts as lines arrive and an unmounted line has no caret blinking early.
 *
 * Each line is outlined: a rim in the brand's blue end (`slugStops`), drifting
 * along the line, round a letter filled with the page. `star` names one line
 * that is filled with the whole ramp instead, drifting the other way — the one
 * the others were leading up to.
 */
export const Slugs: React.FC<{
  title: string;
  /**
   * The recording behind the lines. Without one the lines stand on the page
   * itself, in the page's own ramp, with no card and no scrim.
   */
  shot?: string;
  slugs: readonly string[];
  /** Frames, relative to this section, each slug lands on. */
  times: readonly number[];
  at: number;
  /** False leaves the mark's place empty for a persistent mark of the film's own to stand in. */
  mark?: boolean;
  /** The index of the line filled with the full ramp rather than outlined. */
  star?: number;
}> = ({ title, shot, slugs, times, at, mark = true, star }) => {
  const frame = useCurrentFrame();
  const inkAt = useInk();
  const { themeAt } = useStage();
  const page = themeAt(at + frame);
  /* Over a card the slugs sit on its dark scrim on either stage; with no card they follow the page. */
  const theme = shot ? "dark" : page;

  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: CAPTION.top, gap: 40 }}>
      <div style={{ width: WINDOW.width, display: "flex", alignItems: "center", gap: 22 }}>
        {mark ? (
          <MidniteWordmark size={CAPTION.size} markOnly theme={page} aura={0.5} />
        ) : (
          <div style={{ width: CAPTION.size, height: CAPTION.size, flex: "none" }} />
        )}
        <TypedTitle text={title} fontSize={CAPTION.size} lineHeight={CAPTION.line} color={inkAt(at + frame, WINDOW_LEFT + 80)} theme={page} delay={3} charsPerFrame={2.2} />
      </div>
      <div style={{ position: "relative", width: WINDOW.width, height: WINDOW.height }}>
        {shot ? (
          <Strike from="bottom">
            <PlaceholderCard label={shot} width={WINDOW.width} height={WINDOW.height} theme={page} corner />
          </Strike>
        ) : null}
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            backgroundImage: shot ? "radial-gradient(closest-side, rgba(0,0,0,0.72), transparent)" : undefined,
          }}
        >
          {slugs.map((s, i) => (
            <div key={s + i} style={{ height: 83, display: "flex", alignItems: "center" }}>
              {frame >= times[i] ? (
                <div style={{ position: "relative", filter: i === star ? `drop-shadow(0 0 14px ${THEME[theme].RAINBOW[0]}88)` : undefined }}>
                  {/* The rim: the blue ramp clipped to the glyphs and a transparent stroke round them. */}
                  <div
                    aria-hidden
                    style={{ ...SLUG_TYPE, position: "absolute", inset: 0, ...flowing(slugStops(theme), -frame * 5), WebkitTextStrokeWidth: 7, WebkitTextStrokeColor: "transparent" }}
                  >
                    <Typewriter text={s} delay={times[i] + 2} charsPerFrame={1.1} caret="bar" hideCursorWhenDone={i < slugs.length - 1} />
                  </div>
                  <div
                    style={{
                      ...SLUG_TYPE,
                      position: "relative",
                      ...(i === star ? flowing(themeRainbowStops(theme), frame * 4) : { color: THEME[theme].BG.base }),
                    }}
                  >
                    <Typewriter text={s} delay={times[i] + 2} charsPerFrame={1.1} caret="bar" hideCursorWhenDone={i < slugs.length - 1} />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};

/* ── A coloured card ──────────────────────────────────────────────────────── */

/**
 * The loops pattern: a glyph above, the name typed in its own colour, a line
 * of copy in the stage's ink under it, a highlight crossing glyph and name
 * together — and a very faint wash of the colour over the whole stage. Colour
 * cards belong on the dark stage: Tailwind 500s on white paper lose the
 * contrast that is the whole point of them. On the light stage (`theme`) each
 * colour is darkened by a third so the name still reads, and the wash
 * multiplies rather than screens — a screen over white paper is no wash at all.
 */
export const LoopCard: React.FC<{ slug: string; blurb: string; length: number; theme?: Theme }> = ({
  slug,
  blurb,
  length,
  theme = "dark",
}) => {
  const frame = useCurrentFrame();
  const found = loopBySlug(slug);
  const loop = theme === "light" ? { ...found, colour: mixHex(found.colour, "#000000", 0.33) } : found;
  const shimmer = interpolate(frame, [4, 20], [-0.25, 1.25], clamp);
  const pop = interpolate(frame, [0, 7], [0.7, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const wash = interpolate(frame, [0, 6, length - 6, length], [0, 1, 1, 0], clamp) * 0.12;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill
        style={{
          opacity: theme === "light" ? wash * 0.6 : wash,
          mixBlendMode: theme === "light" ? "multiply" : "screen",
          backgroundImage: `radial-gradient(ellipse 70% 65% at 50% 52%, ${loop.colour} 0%, ${loop.colour}99 45%, transparent 100%)`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, transform: `scale(${pop})` }}>
        <div style={{ filter: `drop-shadow(0 0 ${Math.round(10 + Math.max(0, 1 - Math.abs(shimmer - 0.5) * 2) * 18)}px ${loop.colour})` }}>
          <loop.Icon size={96} colour={loop.colour} />
        </div>
        <ShimmerLine shimmer={shimmer} color={loop.colour} fontSize={80} fontWeight={600} stroke={1.8} theme={theme}>
          {`/${loop.slug}`}
        </ShimmerLine>
        <div style={{ fontFamily: uiFontFamily, fontWeight: 500, fontSize: 34, color: THEME[theme].FG.muted }}>{blurb}</div>
      </div>
    </AbsoluteFill>
  );
};

/* ── The outro ────────────────────────────────────────────────────────────── */

/**
 * "connect with" in lower case and the titles' font, then a row of names that
 * shimmer in turn, then the lockup — the name unfurling out of the mark and
 * the qualifier typed, which is also how the film opens, so the ending rhymes
 * with the start (the promo is a loop: its last frame *is* its first).
 */
export const Outro: React.FC<{
  connect: string;
  names: readonly string[];
  cta: string;
  qualifier: string;
  lockupAt: number;
  theme?: Theme;
}> = ({ connect, names, cta, qualifier, lockupAt, theme = "dark" }) => {
  const frame = useCurrentFrame();
  const rowOut = interpolate(frame, [lockupAt - 8, lockupAt], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {frame < lockupAt ? (
        <div style={{ opacity: rowOut, display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
          <div style={{ fontFamily: uiFontFamily, fontWeight: 600, fontSize: 56, color: THEME[theme].FG.muted, textTransform: "lowercase" }}>
            <Typewriter text={connect} delay={3} charsPerFrame={1.4} caret="bar" hideCursorWhenDone />
          </div>
          <div style={{ display: "flex", gap: 56 }}>
            {names.map((n, i) => {
              const on = interpolate(frame, [14 + i * 6, 22 + i * 6], [0, 1], clamp);
              const sweep = interpolate(frame, [20 + i * 6, 44 + i * 6], [-0.2, 1.2], clamp);
              return (
                <div key={i} style={{ opacity: on, transform: `translateY(${(1 - on) * 14}px)` }}>
                  <ShimmerLine shimmer={sweep} color={THEME[theme].FG.base} fontSize={40} fontWeight={600} theme={theme} band="brand">
                    {n}
                  </ShimmerLine>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Lockup local={frame - lockupAt} qualifier={qualifier} cta={cta} theme={theme} />
      )}
    </AbsoluteFill>
  );
};

/** The lockup: name out of the mark over 16 frames, qualifier typed, caret held. */
export const Lockup: React.FC<{ local: number; qualifier: string; cta?: string; theme?: Theme }> = ({
  local,
  qualifier,
  cta,
  theme = "dark",
}) => {
  const reveal = interpolate(local, [0, 16], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const chars = Math.max(0, Math.min(qualifier.length, Math.floor((local - 16) * 0.8)));
  const ctaIn = interpolate(local, [30, 42], [0, 1], clamp);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
      <MidniteWordmark size={168} qualifier={qualifier} reveal={reveal} qualifierChars={chars} caret theme={theme} aura={0.8} />
      {cta ? (
        <div style={{ opacity: ctaIn, fontFamily: uiFontFamily, fontWeight: 600, fontSize: 44, ...themeRainbowText(theme), padding: "0.12em 0.12em 0.28em", margin: "-0.12em -0.12em -0.28em" }}>
          {cta}
        </div>
      ) : null}
    </div>
  );
};
