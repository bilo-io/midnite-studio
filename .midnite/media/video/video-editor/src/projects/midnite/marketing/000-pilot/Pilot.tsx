import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { AgentLogo, ROSTER_KEYS } from "../../../../shared/AgentLogo";
import { AppWindow, type Crop } from "../../../../shared/AppWindow";
import { BG, FG, RAINBOW } from "../../../../shared/brand";
import { monoFontFamily, uiFontFamily } from "../../../../shared/fonts";
import { MidniteWordmark } from "../../../../shared/MidniteWordmark";
import { SfxSound, SwooshStreak } from "../../../../shared/Sfx";
import { ShimmerLine } from "../../../../shared/ShimmerLine";
import { Typewriter } from "../../../../shared/Typewriter";
import { pilotFile } from "./assets";
import { BEAT, BUILD, DECAY, DROP, DURATION, TRACK } from "./beats";

/**
 * The pilot — 60.0 seconds, scored to an arrangement of `own-it-logo` built by
 * `scripts/make-pilot-soundtrack.mjs`.
 *
 * The mark lands, the name unfurls out of it, the agents it drives sweep in —
 * and then the mark flies up to the caption line and stays there for the whole
 * body of the film, one slide per thing midnite does, before coming back down
 * to the middle for the close. It is the same object throughout: there is one
 * `MidniteWordmark` in this composition and it is never unmounted.
 *
 * Every cut is on a bar of the arrangement (`beats.ts`), and the arrangement
 * was written to this cut rather than the other way round: the bass turns
 * regular on the cut to the agent terminal, the build-up runs exactly the
 * length of the optimiser slide, and the drop lands on the frame the AI
 * companion does.
 *
 * It is also the repo's worked example, so nothing lives here that a second
 * video would want: the window chrome is `shared/AppWindow`, the shimmering
 * tagline is `shared/ShimmerLine`, and what stays is the beat grid, the copy,
 * and which frames of which clip each slide plays.
 */

/** Music level. The one place the track's gain is written. */
const MUSIC = 0.85;

const STAGE = { width: 1920, height: 1080 } as const;

/**
 * The card every slide shows its recording in, at one size for all eight.
 *
 * The height is what is left of 1080 after a 64px head, the caption's own 55px
 * line, the 40px gap under it and an 81px foot; the width is that height times
 * the recordings' 2912÷1758. One size for every slide is the point — a window
 * that resizes between two hard cuts reads as a layout bug rather than as an
 * edit, so a clip that needs cropping is covered into this box instead.
 */
const WINDOW = { width: 1391, height: 840 } as const;
/** The window is centred, so this is the column everything else lines up to. */
const WINDOW_LEFT = (STAGE.width - WINDOW.width) / 2; // 264.5

/** The caption line: 44px type on a 55px line, starting 64px down. */
const CAPTION = { top: 64, size: 44, line: 55 } as const;
/** The mark sits in the caption line where the bullet used to. */
const CAPTION_MARK = 46;
/** Gap between the mark and the first character of the caption. */
const CAPTION_GAP = 20;

/**
 * The eight things midnite does, each with the recording of it doing that.
 *
 * `trimBefore` is in composition frames (30fps) and `rate` is `playbackRate`;
 * both are measured, not guessed. `tools/cut-detect.py` over each clip reports
 * where the picture actually changes — a screen recording is mostly a still
 * image, and the wrong four seconds of one is a screenshot with a soundtrack —
 * and the rate is then whatever fits that window into the bars the slide has.
 *
 * The clips are short. Summed at their natural speed the eight of them carry
 * about 43 seconds of usable picture, and this cut is 60, so three of the rates
 * below are not 1 and two of those are not what the brief asked for either:
 *
 *   github      1.65×, not 2×. The clip is 6.06s and the first 1.7s of it is a
 *               loading skeleton, so there are 4.3s of picture to fill a slide
 *               that is already down to a bar and a half. 1.65× is the fastest
 *               rate that fills it with any margin at all.
 *   loops       0.70×. It is the only clip long enough to carry the drop, and
 *               eight and a half bars of it is 14.4s against 10.8s of footage.
 *               Slow motion under a drop is the point rather than a compromise.
 *   git graph   0.90×, browser 0.88×, knowledge graph 0.90×, optimiser 0.88×.
 *               Each would otherwise run off the end of its clip by a few
 *               tenths — the optimiser once its dead first second is skipped.
 *               None of them is visible as slow motion.
 *
 * The one window that had to move after the first render of the 21-second cut
 * is still worth the warning it earned: the agent slide began on a picker-open
 * frame and the browser slide mid tab-switch on a blank pane. Check the frame a
 * slide *opens* on, not only that the span contains the good part.
 */
const SLIDES = [
  {
    caption: "the real git CLI, not a wrapper",
    clip: "video/app/midnite-video-terminal-git-graph-repos.mov",
    seconds: 5.19,
    trimBefore: 5,
    rate: 0.9,
    from: BEAT.slide1,
    until: BEAT.slide2,
  },
  {
    /*
      The recording this replaced showed the agent picker over an empty
      terminal. This one opens on a running Cursor Agent, opens the picker at
      4.3s, and has Claude Code launched in the pane by 5.4s — the claim
      demonstrated rather than the menu that would demonstrate it.
    */
    caption: "every coding agent, side by side",
    clip: "video/app/midnite-ai-agents-terminal.mov",
    seconds: 8.142,
    trimBefore: 54,
    rate: 1,
    from: BEAT.slide2,
    until: BEAT.slide3,
  },
  {
    caption: "your codebase as a live graph",
    clip: "video/app/midnite-video-knowledge-graph.mov",
    seconds: 5.748,
    trimBefore: 6,
    rate: 0.9,
    /*
      The graph view carries a "this graph is 17 commits behind HEAD" banner
      across its top 100 source pixels. It is true of the machine the recording
      was made on and says nothing about the product, so it is cropped off
      rather than left to be read as a warning in a marketing cut.

      The 166px off the right is not cosmetic: it makes the kept box
      2746×1658, which is the card's own 1391÷840 to within a thousandth, so
      the cover fit clips nothing beyond what is asked for. Cropping only the
      top left a taller-than-the-card box, and covering it ate 83px off each
      side — which is where the relations sidebar's labels live.
    */
    crop: { top: 100, right: 166 },
    from: BEAT.slide3,
    until: BEAT.slide4,
  },
  {
    caption: "a real browser, docked in",
    clip: "video/app/midnite-studio-browser.mov",
    seconds: 7.572,
    trimBefore: 12,
    rate: 0.88,
    from: BEAT.slide4,
    until: BEAT.slide5,
  },
  {
    /*
      Issues, then the project board, then the workflow runs — all three, and
      none of the 1.7s of loading skeleton in front of them. The issue list
      populates first and the body pane is still drawing its placeholder rows
      at 1.45s; the first frame with a real page in both panes is 1.7s.
    */
    caption: "issues, boards and CI, in the window",
    clip: "video/app/midnite-github-integration.mov",
    seconds: 6.055,
    trimBefore: 51,
    rate: 1.65,
    from: BEAT.slide5,
    until: BEAT.slide6,
  },
  {
    /*
      Opens on the scan running with the CPU/RAM/GPU sparklines live, not on
      the idle "Smart Scan" panel the recording starts with — which is a button
      on an empty page and was the first frame of this slide until it was
      looked at.
    */
    caption: "the machine it runs on, tuned",
    clip: "video/app/midnite-optimiser.mov",
    seconds: 5.562,
    trimBefore: 26,
    rate: 0.88,
    from: BEAT.slide6,
    until: BEAT.slide7,
  },
  {
    /*
      The drop lands on the frame the companion is *summoned* — the menu is
      open with "Companion · a chat thread that greets you and hands work to an
      agent" under the cursor, and the panel slides in a beat later. From frame
      0 the clip is a dashboard with nothing happening on it.
    */
    caption: "an AI that knows what you shipped",
    clip: "video/app/midnite-ai-companion.mov",
    seconds: 4.49,
    trimBefore: 14,
    rate: 1.5,
    from: BEAT.slide7,
    until: BEAT.slide8,
  },
  {
    caption: "standing jobs that run themselves",
    clip: "video/app/midnite-loops.mov",
    seconds: 10.807,
    trimBefore: 14,
    rate: 0.7,
    from: BEAT.slide8,
    until: BEAT.outro,
  },
] as const;

/**
 * Every slide has to fit inside its clip, and this is the one thing in the edit
 * that fails silently: ask for more source than there is and `OffthreadVideo`
 * holds the last frame, which on a screen recording is indistinguishable from
 * the app having hung. Nothing in the render warns about it and nothing in a
 * still shows it. So the arithmetic is checked here, at module scope, where
 * getting it wrong stops the bundle instead of shipping a frozen shot.
 *
 * `seconds` is `ffprobe`'s container duration for each clip. The recordings are
 * variable-rate, so their frame counts divided by their nominal fps are not it.
 */
for (const slide of SLIDES) {
  const used = (slide.trimBefore + (slide.until - slide.from) * slide.rate) / 30;
  if (used > slide.seconds)
    throw new Error(
      `${slide.clip}: the slide needs ${used.toFixed(2)}s of a ${slide.seconds}s clip ` +
        `(trimBefore ${slide.trimBefore}, ${slide.until - slide.from} frames at ${slide.rate}×)`,
    );
}

export const Pilot: React.FC = () => {
  const frame = useCurrentFrame();

  /* Lands on black a couple of frames before the file ends, on silence. */
  const fadeOut = interpolate(frame, [DECAY, DURATION - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BG.base, fontFamily: uiFontFamily }}>
      {/*
        One mount, one file. The 21-second cut mounted the sting twice and
        crossfaded the copies to buy a second pass through the groove; sixty
        seconds needs ten passes, a build-up and a drop, so the arrangement is
        built offline instead. See `scripts/make-pilot-soundtrack.mjs`.
      */}
      <Audio src={pilotFile(TRACK)} volume={MUSIC} />

      {/*
        The one-shots are mounted here, at the top level, rather than inside the
        scenes they belong to. Each swells before it peaks — the riser for seven
        seconds — and a `<Sequence>` that starts on the cut would clip away
        exactly that swell. See `SfxSound`.

        The slide cuts get the light whoosh at a lower level than the
        structural ones: nine full-weight swooshes in a minute stops reading as
        punctuation and starts reading as weather. The drop gets no whoosh at
        all, because it has a riser landing on it and an impact under it.
      */}
      <SfxSound atFrame={BEAT.lockup} kind="big" volume={0.45} />
      <SfxSound atFrame={BEAT.agents} kind="light" volume={0.35} />
      {SLIDES.filter((slide) => slide.from !== DROP).map((slide) => (
        <SfxSound key={slide.clip} atFrame={slide.from} kind="light" volume={0.28} />
      ))}
      {/* The riser runs exactly the build-up: its ledge lands on the drop. */}
      <SfxSound atFrame={DROP} kind="riser" volume={0.5} head={DROP - BUILD} />
      <SfxSound atFrame={DROP} kind="impact" volume={0.55} />
      <SfxSound atFrame={BEAT.outro} kind="big" volume={0.45} />

      <AbsoluteFill style={{ opacity: fadeOut }}>
        <Backdrop />

        <Sequence durationInFrames={BEAT.slide1} name="1 · Lockup">
          <OpeningScene />
        </Sequence>

        {SLIDES.map((slide, i) => (
          <Sequence
            key={slide.clip}
            from={slide.from}
            durationInFrames={slide.until - slide.from}
            name={`${i + 2} · ${slide.caption}`}
          >
            <FeatureSlide {...slide} durationInFrames={slide.until - slide.from} />
          </Sequence>
        ))}

        <Sequence from={BEAT.outro} name="10 · Close">
          <CloseScene />
        </Sequence>

        {/*
          Above the scenes and outside every one of them: the mark belongs to
          the film, not to a section of it, and a `<Sequence>` would unmount it
          at the first cut.
        */}
        <TravellingMark />

        {/*
          The streaks sit above everything so each one rakes across the cut it
          is masking. Mounted *on* the beat, unlike the sounds: a streak needs
          no anticipation, and one that starts early reads as a stray highlight.
          Directions alternate so eight slide cuts in a row do not read as one
          object sliding across the whole film.
        */}
        <Sequence from={BEAT.lockup} durationInFrames={20} layout="none">
          <SwooshStreak intensity={0.55} />
        </Sequence>
        <Sequence from={BEAT.agents} durationInFrames={16} layout="none">
          <SwooshStreak direction={-1} intensity={0.4} />
        </Sequence>
        {SLIDES.map((slide, i) => (
          <Sequence
            key={slide.clip}
            from={slide.from}
            durationInFrames={slide.from === DROP ? 22 : 16}
            layout="none"
          >
            <SwooshStreak
              direction={i % 2 === 0 ? 1 : -1}
              intensity={slide.from === DROP ? 0.62 : 0.45}
            />
          </Sequence>
        ))}
        <Sequence from={BEAT.outro} durationInFrames={20} layout="none">
          <SwooshStreak direction={-1} intensity={0.55} />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * A slow violet bloom behind everything, drifting just enough that the stage
 * is never a flat rectangle of near-black. Pure decoration, no timing.
 */
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 4;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(60% 50% at ${50 + drift}% 45%, ${RAINBOW[2]}22, transparent 70%)`,
      }}
    />
  );
};

/* ── The mark, and the three places it lives ──────────────────────────────── */

/** How long the streak on `BEAT.lockup` takes to cross. The build follows it. */
const SHIMMER = 20;
/** Frames the name takes to come out of the mark, under that streak. */
const UNFURL = 18;
/** Typing speed for the qualifier, chosen to land it 24 frames before BEAT.agents. */
const QUALIFIER_CPF = 0.32;
const QUALIFIER = "Studio";
/** Frames the mark takes to fly between two of its stations. */
const FLY = 18;

/**
 * Where the mark sits, as an offset from the centre of the stage.
 *
 * `dx: 0` is not "at x=960" — it is "wherever centring the lockup puts it". The
 * lockup is laid out by the browser in a centred flex box, so while the name is
 * out the pair is centred as a pair and the mark sits left of the middle by
 * half the name. That is the behaviour the opening already had and it is worth
 * keeping: what travels is the *lockup*, and the mark is where the lockup's
 * left edge is. `caption` is the one station with a fixed x, and it can be one
 * because the name is folded away there, so the lockup is exactly the mark.
 *
 * The y offsets are the centres of the blocks each station belongs to:
 *
 *   open     140 lockup + 76 gap + 64 roster = 280, centred → lockup at 400–540
 *   caption  the 55px caption line starting at 64, mark centred in it
 *   close    150 lockup + 46 gap + 46 tagline = 242, centred → lockup at 419–569
 */
const MARK = {
  open: { size: 140, dx: 0, dy: 470 - STAGE.height / 2 },
  caption: {
    size: CAPTION_MARK,
    dx: WINDOW_LEFT + CAPTION_MARK / 2 - STAGE.width / 2,
    dy: CAPTION.top + CAPTION.line / 2 - STAGE.height / 2,
  },
  close: { size: 150, dx: 0, dy: 494 - STAGE.height / 2 },
} as const;

/** Where the roster and the tagline sit, given the blocks above. */
const ROSTER_DY = 648 - STAGE.height / 2;
const TAGLINE_DY = 638 - STAGE.height / 2;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The mark, from the first frame to the last.
 *
 * Three stations and two flights between them. What makes the flights read as
 * one object rather than as three is that the name folds back into the mark on
 * the way up and unfurls out of it again on the way down — the same `reveal`
 * the opening already used to build the lockup, run backwards. At the caption
 * line the lockup is *only* the mark, which is why it can have a fixed x there
 * while the other two stations are centred.
 *
 * The opening's own animations — the pre-roll, the spring that lands on the
 * hit, the qualifier typing — are applied unconditionally rather than behind a
 * phase check. All three have saturated long before the first flight starts, so
 * a branch would only be a second way of saying the same thing.
 */
const TravellingMark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ease = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;
  const up = interpolate(frame, [BEAT.slide1, BEAT.slide1 + FLY], [0, 1], ease);
  const down = interpolate(frame, [BEAT.outro, BEAT.outro + FLY], [0, 1], ease);

  const size = lerp(lerp(MARK.open.size, MARK.caption.size, up), MARK.close.size, down);
  const dx = lerp(lerp(MARK.open.dx, MARK.caption.dx, up), MARK.close.dx, down);
  const dy = lerp(lerp(MARK.open.dy, MARK.caption.dy, up), MARK.close.dy, down);

  /*
    `damping: 200` is Remotion's critically-damped default: no overshoot, which
    is what a logo wants — a mark that bounces reads as a toy. The spring is
    driven from BEAT.lockup so the settle coincides with the hit.
  */
  const land = spring({ frame: frame - BEAT.lockup, fps, config: { damping: 200 } });
  /* A slow pre-roll: the mark is already drifting up before the hit lands it. */
  const preroll = interpolate(frame, [0, BEAT.lockup], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  /*
    Frames 0–38 are the crescent and nothing else — and *actually* nothing else,
    not a name at opacity 0: `reveal` animates the name's width, so the mark
    really is alone on the centre line until the hit. `Math.max` rather than a
    phase check: `unfurl * (1 - up)` is the name coming out and then folding
    away as the mark flies up, and `down` is it coming back out at the close.
  */
  const unfurl = interpolate(frame, [BEAT.lockup, BEAT.lockup + UNFURL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const reveal = Math.max(unfurl * (1 - up), down);

  const typeFrom = BEAT.lockup + SHIMMER;
  const typed = Math.max(0, (frame - typeFrom) * QUALIFIER_CPF);
  const done = typed >= QUALIFIER.length;
  /*
    Solid while the word is arriving, blinking once it has, and gone by the time
    the roster does — the same rule `Typewriter` uses, because a caret that
    blinks through its own typing flickers against the characters appearing
    beside it, and one that never stops reads as part of the lockup. It never
    comes back for the close: the name is not being typed there, it is being
    unfolded, and a caret would claim otherwise.
  */
  const caret = frame >= typeFrom && frame < BEAT.agents && (!done || Math.floor(frame / 15) % 2 === 0);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: `translate(${dx}px, ${dy}px)`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          /*
            0.72 before the hit, 1 after it. The first 39 frames are the
            crescent *as the shot*, so it has to be read rather than sensed —
            and the hit still has a step of its own to land.
          */
          opacity: preroll * 0.72 + land * 0.28,
          transform: `translateY(${interpolate(land, [0, 1], [26, 0])}px) scale(${interpolate(land, [0, 1], [0.94, 1])})`,
        }}
      >
        <MidniteWordmark
          size={size}
          qualifier={QUALIFIER}
          reveal={reveal}
          qualifierChars={frame < BEAT.slide1 ? Math.floor(typed) : QUALIFIER.length}
          caret={caret}
        />
      </div>
    </AbsoluteFill>
  );
};

/**
 * Scene 1: everything in the opening that is not the mark.
 *
 * Which is the roster, and it is placed by an explicit offset rather than by
 * being in a flex column with the lockup — the lockup is not in this scene any
 * more, it is `TravellingMark`, and the two agree by both being measured from
 * the same block in `MARK`'s comment rather than by sharing a container.
 */
const OpeningScene: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
    <div style={{ transform: `translateY(${ROSTER_DY}px)` }}>
      <AgentRow size={64} gap={44} startFrame={BEAT.agents} />
    </div>
  </AbsoluteFill>
);

/**
 * The roster, in brand colour, staggered.
 *
 * The stagger has to finish inside the gap to the next beat: 11 marks at 2
 * frames apart, on a spring stiff enough to settle in about 12, lands the last
 * one around frame 134 — comfortably before the cut at 192. A slower stagger
 * was still filling the row as the scene ended.
 */
const AgentRow: React.FC<{
  size: number;
  gap: number;
  /** Frame (in this scene's clock) at which the first mark begins to arrive. */
  startFrame?: number;
}> = ({ size, gap, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {ROSTER_KEYS.map((agent, i) => {
        const enter = spring({
          frame: frame - startFrame - i * 2,
          fps,
          config: { damping: 200, stiffness: 180 },
        });
        return (
          <div
            key={agent}
            style={{
              opacity: enter,
              transform: `translateY(${interpolate(enter, [0, 1], [22, 0])}px)`,
            }}
          >
            <AgentLogo agent={agent} size={size} tone="color" />
          </div>
        );
      })}
    </div>
  );
};

/**
 * One claim, over the app doing it.
 *
 * The caption line is left-aligned to the window's own left edge rather than
 * centred over it, because the mark lives at the head of that line now and a
 * persistent object cannot move between cuts just because the next caption is
 * three characters shorter. The first `CAPTION_MARK + CAPTION_GAP` pixels of
 * the line are the mark's; nothing is drawn into them here.
 *
 * The push-in matters more here than it looks: these recordings hold still for
 * seconds at a time, and a card that is very slowly growing reads as a shot
 * while the same card held rigid reads as a screenshot. It is never scaled past
 * 1.04, which at this size is 1447px wide and still inside the frame.
 */
const FeatureSlide: React.FC<{
  caption: string;
  clip: string;
  trimBefore: number;
  rate: number;
  crop?: Crop;
  durationInFrames: number;
}> = ({ caption, clip, trimBefore, rate, crop, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /*
    The window is at full opacity on its first frame — the slide *cuts* in, it
    does not dissolve in. Beats hard-cut, and a ten-frame fade-up on a hit
    reads as the picture arriving late; the entrance here is only a settle, a
    2.5% scale that resolves in about half a second under the swoosh streak
    that is raking across the same cut.
  */
  const settle = spring({ frame, fps, config: { damping: 200, stiffness: 140 } });
  const push = interpolate(frame, [0, durationInFrames], [1, 1.04], {
    extrapolateRight: "clamp",
  });

  /*
    The caption is the one thing that does fade, over four frames. It is type,
    not picture: a line of text switched on at full strength on the same frame
    as a new image under it fights the image for the eye, and four frames is
    under the streak too.
  */
  const captionIn = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: CAPTION.top, gap: 40 }}>
      <div
        style={{
          width: WINDOW.width,
          paddingLeft: CAPTION_MARK + CAPTION_GAP,
          boxSizing: "border-box",
          fontFamily: monoFontFamily,
          fontSize: CAPTION.size,
          lineHeight: `${CAPTION.line}px`,
          opacity: captionIn,
          transform: `translateY(${interpolate(captionIn, [0, 1], [-10, 0])}px)`,
        }}
      >
        {/*
          `delay={4}` rather than 0: the row is still arriving on the cut, and
          characters appearing while the line is also moving reads as a glitch.
          Four frames is exactly the row's own entrance, so the first character
          lands the moment it settles — and the longest caption (36 characters
          at 1.1/frame) still finishes 38 frames inside the shortest slide.
        */}
        <Typewriter
          text={caption}
          delay={4}
          charsPerFrame={1.1}
          hideCursorWhenDone={false}
          style={{ color: FG.base }}
        />
      </div>

      <div style={{ transform: `scale(${interpolate(settle, [0, 1], [0.975, 1]) * push})` }}>
        <AppWindow
          src={staticFile(clip)}
          trimBefore={trimBefore}
          playbackRate={rate}
          crop={crop}
          width={WINDOW.width}
          height={WINDOW.height}
          glow={0.42}
        />
      </div>
    </AbsoluteFill>
  );
};

/** How long a shimmer takes to cross the tagline, and how long until the next. */
const SWEEP = { length: 48, period: 66 } as const;

/**
 * Scene 10: the one line that says what it is, under the mark coming back down.
 *
 * The tagline waits for the mark to land — it arrives `FLY` frames in, not on
 * the cut — and then the brand ramp glows off its edges with a highlight
 * crossing it every couple of seconds. Solid type with the colour underneath
 * it rather than in it: see `ShimmerLine`, which carries the reason.
 */
const CloseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const tagline = interpolate(frame, [FLY, FLY + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /*
    A sawtooth: the highlight crosses over `length` frames and then sits off
    the right-hand edge for the rest of the period. Starting it at FLY + 26
    keeps it off the frames the line is still fading up on, where a sweep would
    read as part of the entrance rather than as a property of the type.
  */
  const cycles = (frame - (FLY + 26)) / SWEEP.period;
  const shimmer =
    cycles < 0
      ? -0.3
      : interpolate(cycles - Math.floor(cycles), [0, SWEEP.length / SWEEP.period], [-0.2, 1.2], {
          extrapolateRight: "clamp",
        });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `translateY(${TAGLINE_DY}px)`, opacity: tagline }}>
        <ShimmerLine shimmer={shimmer} color={FG.muted} fontSize={38}>
          one window for all of it
        </ShimmerLine>
      </div>
    </AbsoluteFill>
  );
};
