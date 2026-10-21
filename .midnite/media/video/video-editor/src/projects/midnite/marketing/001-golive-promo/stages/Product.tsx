import {
  AbsoluteFill,
  Sequence,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { AgentLogo, ROSTER_KEYS } from "../../../../../shared/AgentLogo";
import { FG, LIGHT } from "../../../../../shared/brand";
import { AppShot, type Approach } from "../AppShot";
import { CaptionLine } from "../CaptionLine";
import { CLAIM } from "../beats";
import { CAPTION_CPF, CAPTION_DELAY, ClaimSlide } from "../ClaimSlide";
import { STAGE2, type Shot } from "../clips";
import { CAPTION, CAPTION_GAP, CAPTION_MARK, WINDOW, WINDOW_LEFT } from "../layout";
import { themeAt, themeMixAt } from "../wipes";

/**
 * Stage 2 — eight things the product does, in seventeen seconds.
 *
 * A montage, not a tour, and the arithmetic says so: ten bars between the first
 * hit and the build-up, one of which the lockup takes and one of which the
 * agent claim takes twice over, which leaves seven claims a bar each. 1.70s per
 * claim is short enough that every one of them has to be a single readable
 * image — which is why each caption is four words or fewer and each shot is one
 * screen rather than a pan across three.
 *
 * The three git claims run together — repos, swarm, kanban — because they are
 * one argument made three ways, and a viewer who has just been shown a sidebar
 * of repositories reads the commit graph after it as *those* repositories.
 *
 * The first claim is the exception and takes two bars, because the brief asks it
 * to do three things (deal the roster one mark at a time, cascade them into a
 * row, and then show the picker doing it for real) and two of those are the same
 * claim made twice. What it gets instead is a bar of marks and a bar of product,
 * with the row cascading *along the bottom of the window* rather than before it
 * — the app listing eight agents while their marks assemble underneath is one
 * image making the point once, and it fits.
 */

/**
 * Which edge each card arrives from, cycled.
 *
 * The tour's window is centred, so no direction fits it better than another and
 * what matters is that consecutive cards do not arrive the same way — four cuts
 * in a row all rising from the bottom read as one object being replaced rather
 * than as four claims. (The harness panels are against the right margin and do
 * have a best answer; see `Harness.tsx`.)
 */
const APPROACH: readonly Approach[] = ["bottom", "left", "top", "right"];

/** The seven claims that get a bar each, in order. */
const CLAIMS: readonly { at: number; until: number; text: string; shot: Shot }[] = [
  { at: CLAIM.repos, until: CLAIM.swarm, text: "Manage multiple git repos", shot: STAGE2.repos },
  { at: CLAIM.swarm, until: CLAIM.forge, text: "Watch your swarm", shot: STAGE2.swarm },
  { at: CLAIM.forge, until: CLAIM.browser, text: "Manage your forge", shot: STAGE2.forge },
  { at: CLAIM.browser, until: CLAIM.monitor, text: "Dockable browser", shot: STAGE2.browser },
  { at: CLAIM.monitor, until: CLAIM.graph, text: "System monitor", shot: STAGE2.monitor },
  { at: CLAIM.graph, until: CLAIM.kanban, text: "Knowledge graph", shot: STAGE2.graph },
  /* Last, on the client's fifth round — see `CLAIM.kanban` in `beats.ts`. */
  { at: CLAIM.kanban, until: CLAIM.end, text: "Agentic kanban", shot: STAGE2.kanban },
];

/**
 * Every caption typed in stage 2 and 3, with the frame its first character
 * lands — for the keyboard layer, which is mounted at the composition's top
 * level and so cannot read them off the scenes.
 */
export const TOUR_CAPTIONS: readonly { at: number; text: string }[] = [
  { at: CLAIM.agents, text: "Launch any agent" },
  ...CLAIMS.map(({ at, text }) => ({ at, text })),
];

export const Product: React.FC = () => (
  <AbsoluteFill>
    <Sequence
      from={CLAIM.agents - CLAIM.lockup}
      durationInFrames={CLAIM.repos - CLAIM.agents}
      name="Launch any agent"
    >
      <AgentClaim />
    </Sequence>

    {CLAIMS.map((claim, i) => (
      <Sequence
        key={claim.text}
        from={claim.at - CLAIM.lockup}
        durationInFrames={claim.until - claim.at}
        name={claim.text}
      >
        <ClaimSlide
          text={claim.text}
          shot={claim.shot}
          at={claim.at}
          theme={themeAt(claim.at)}
          from={APPROACH[i % APPROACH.length]}
        />
      </Sequence>
    ))}
  </AbsoluteFill>
);

/* ── "Launch any agent" ───────────────────────────────────────────────────── */

/** Frames the single-mark deal runs for — one bar. */
const DEAL = CLAIM.agentsVideo - CLAIM.agents;

/**
 * The cadence of the deal: eleven marks in one bar, each held for less time than
 * the one before.
 *
 * A geometric decay rather than a linear ramp, because what the brief describes
 * — "increasing the speed as you go to each successive one" — is a *rate*
 * increasing, and a rate that increases by a constant factor is what an
 * accelerating machine sounds like. The ratio is 0.88, chosen so the last mark
 * still gets two and a quarter frames: at 0.85 the final three are under two
 * frames each, which at 30fps is not fast, it is invisible.
 *
 * Computed once at module scope — it depends on nothing but the bar length.
 */
const DEAL_STARTS: readonly number[] = (() => {
  const ratio = 0.88;
  const n = ROSTER_KEYS.length;
  /* Σ ratio^i for i in [0, n) — what the first interval has to be scaled to. */
  const total = (1 - ratio ** n) / (1 - ratio);
  const first = DEAL / total;
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    starts.push(at);
    at += first * ratio ** i;
  }
  return starts;
})();

/**
 * The roster, dealt one mark at a time and then assembled.
 *
 * The first bar is one position on the stage and eleven marks passing through
 * it, accelerating. The second is the product: the picker open with the roster
 * in it, and the same eleven marks cascading into a row along the bottom of the
 * card — the claim being demonstrated and illustrated in one image rather than
 * in two shots that each half-make it.
 */
const AgentClaim: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dealing = frame < DEAL;

  /* Which mark the deal is showing: the last one to have come up. */
  const index = DEAL_STARTS.reduce((found, at, i) => (frame >= at ? i : found), 0);

  const captionIn = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" });

  /* The same source the rest of the film's type reads — see `ClaimSlide`. */
  const ink = interpolateColors(
    themeMixAt(CLAIM.agents + frame, WINDOW_LEFT + CAPTION_MARK + CAPTION_GAP),
    [0, 1],
    [FG.base, LIGHT.FG.base],
  );

  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: CAPTION.top, gap: 40 }}>
      <CaptionLine
        text="Launch any agent"
        delay={CAPTION_DELAY}
        charsPerFrame={CAPTION_CPF}
        color={ink}
        theme={themeAt(CLAIM.agents)}
        style={{ width: WINDOW.width, opacity: captionIn }}
      />

      {/*
        The card's box is reserved from the first frame whether or not there is a
        card in it, so the deal and the window occupy exactly the same rectangle
        and nothing re-lays-out on the cut between them.
      */}
      <div style={{ position: "relative", width: WINDOW.width, height: WINDOW.height }}>
        {dealing ? (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <DealtMark key={index} index={index} at={DEAL_STARTS[index]} />
          </AbsoluteFill>
        ) : (
          <>
            <AppShot
              shot={STAGE2.agents}
              width={WINDOW.width}
              height={WINDOW.height}
              theme="light"
              glow={0.3}
              startsAt={CLAIM.agentsVideo}
              from="right"
            />
            <AgentStrip startFrame={DEAL + 2} fps={fps} />
          </>
        )}
      </div>
    </AbsoluteFill>
  );
};

/**
 * One mark in the deal.
 *
 * Keyed on its index by the caller so each one is a fresh element: the entrance
 * is driven from `frame - at`, and a reused element would carry the previous
 * mark's progress into the next one's first frame.
 *
 * Deliberately not a spring. The marks at the end of the deal get two frames
 * each, and a spring's settle is longer than that — the last four would all
 * arrive mid-flight, which reads as the effect breaking down exactly where it is
 * supposed to be at its fastest. A three-frame linear pop is legible at every
 * speed the deal reaches.
 */
const DealtMark: React.FC<{ index: number; at: number }> = ({ index, at }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame - at, [0, 3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity: t,
        transform: `scale(${interpolate(t, [0, 1], [0.82, 1])})`,
      }}
    >
      {/*
        `ink`, not `color`: this beat is on the light stage, and Grok's accent
        in the roster is white. The strip at the foot of the card below uses
        `color`, because that sits on a dark scrim.
      */}
      <AgentLogo agent={ROSTER_KEYS[index]} size={260} tone="ink" />
    </div>
  );
};

/** Frames a shimmer takes to cross one agent mark. */
const SHINE = 11;

/**
 * The eleven marks assembling into a row along the bottom of the card.
 *
 * On a scrim rather than on the recording itself: the picker it sits under is
 * pale, and eleven brand-coloured marks straight onto it lose their edges. Two
 * frames apart on a stiff spring, which lands the last one 30 frames in — well
 * inside the bar, per the pilot's rule that a stagger has to finish before the
 * next beat.
 *
 * ── Each mark lights in its own colour ─────────────────────────────────────
 *
 * A band of light crosses each one as it arrives, clipped to the glyph by a
 * mask of its own SVG and tinted with that agent's accent (`AgentLogo`'s
 * `shimmer`). Eleven marks flashing the same violet would be eleven marks
 * flashing violet; eleven marks each flashing their own brand is a roster, which
 * is the claim this beat is making.
 *
 * The shimmers inherit the entrance's own two-frame stagger, so the light runs
 * down the row rather than hitting it all at once — and each is over eleven
 * frames later, which puts the last of them 41 frames in, still inside the bar.
 */
const AgentStrip: React.FC<{ startFrame: number; fps: number }> = ({ startFrame, fps }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 128,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 18,
        backgroundImage: "linear-gradient(180deg, rgba(8,8,13,0) 0%, rgba(8,8,13,0.86) 46%)",
      }}
    >
      {ROSTER_KEYS.map((agent, i) => {
        const enter = spring({
          frame: frame - startFrame - i * 2,
          fps,
          config: { damping: 200, stiffness: 190 },
        });
        const shine = (frame - startFrame - i * 2) / SHINE;
        return (
          <div
            key={agent}
            style={{
              opacity: enter,
              transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
            }}
          >
            <AgentLogo
              agent={agent}
              size={64}
              tone="color"
              /*
                `undefined` outside its turn rather than a parked value: a masked
                gradient held off-frame for a whole bar is a masked gradient
                being rasterised for a whole bar, eleven times over.
              */
              shimmer={
                shine < 0 || shine > 1 ? undefined : interpolate(shine, [0, 1], [-0.15, 1.15])
              }
            />
          </div>
        );
      })}
    </div>
  );
};
