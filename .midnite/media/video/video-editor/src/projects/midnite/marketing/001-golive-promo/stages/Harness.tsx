import {
  AbsoluteFill,
  Sequence,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { FG, LIGHT, type Theme, themeRainbowText } from "../../../../../shared/brand";
import { uiFontFamily } from "../../../../../shared/fonts";
import { LOOP_ICONS, type LoopIcon } from "../../../../../shared/loopIcons";
import { ShimmerLine } from "../../../../../shared/ShimmerLine";
import { SmokeStreak } from "../../../../../shared/SmokeStreak";
import { Typewriter } from "../../../../../shared/Typewriter";
import { AppShot } from "../AppShot";
import { ClaimSlide } from "../ClaimSlide";
import { CaptionLine } from "../CaptionLine";
import { HARNESS, OUTRO, STAGE } from "../beats";
import { STAGE4, type Shot } from "../clips";
import { CAPTION, CAPTION_GAP, CAPTION_MARK, COLUMN, PANEL, PANEL_TOP } from "../layout";
import { themeAt, themeMixAt } from "../wipes";

/**
 * Stage 4 — the harness. What midnite actually is, over the drop.
 *
 * Thirteen bars, four movements, and a different layout from the tour before it:
 * a column of type on the left and the product beside it on the right. That is
 * the point of the change. Stages 2 and 3 are claims *about* pictures, so the
 * picture is centred and the caption sits over it; this act is a list of what
 * the harness gives you, where the copy is the argument and the recording is
 * evidence next to it.
 *
 * The drop supports the rhythm: there is a measured onset on nearly every bar
 * line from 18 to 30, which is what lets a heading land on a bar and its three
 * items on the bar, the two-thirds and the third after it without any of them
 * falling between beats.
 *
 * ── Everything here is typed ────────────────────────────────────────────────
 *
 * Four headings and twelve items, which is sixteen lines of keyboard under a
 * drop. The first cut typed only the headings and slid the items up, on the
 * argument that the whole act rattling was the opposite of the brief's word
 * "subtle" — and the brief has since asked for the items too, which is the
 * right call for a reason the first version missed: a list that *appears* reads
 * as a slide, and a list being typed reads as the harness being configured
 * while you watch.
 *
 * What keeps it from rattling is the level rather than the count. The items run
 * at `ITEM_CPF`, which is fast enough that each is over in half a second, and
 * `TypingSound` caps the clicks at one a frame — so twelve items add about four
 * seconds of keyboard spread across twenty-two, not twenty-two seconds of it.
 */

/** The typed headings, for the keyboard layer mounted at the top level. */
export const HARNESS_HEADINGS: readonly { at: number; text: string }[] = [
  { at: HARNESS.skills.heading, text: "Agent Skills" },
  { at: HARNESS.loops.heading, text: "Agent Loops" },
  { at: HARNESS.graphs.heading, text: "Agent Graphs" },
  { at: HARNESS.companion.heading, text: "AI Companion" },
];

/** How fast a heading is typed. Slower than the tour's captions — it has a bar. */
export const HEADING_CPF = 1.5;

/**
 * How fast an item is typed, and how long after its beat the first character
 * lands.
 *
 * Faster than a heading: an item has two thirds of a bar rather than a whole
 * one, and the longest of them is 29 characters, which at this speed is over in
 * sixteen frames. The delay is the item's own entrance — three frames of it
 * sliding up — because characters appearing while the line is also moving reads
 * as a glitch rather than as typing.
 */
export const ITEM_CPF = 1.8;
export const ITEM_DELAY = 3;

/** What each movement's list says. */
const ITEMS = {
  graphs: ["Custom agent swarms", "Accomplish real workflows", "Automate anything"],
  companion: [
    "Customize personality",
    "MCP for true assistance",
    "Voice comms, like J.A.R.V.I.S",
  ],
} as const;

/** The three skills, typed one per beat — slash-prefixed, as the app names them. */
const SKILLS = ["/ideate", "/create", "/review"] as const;

/**
 * How fast a slug types, and the pause before its first character.
 *
 * Faster than the list items it replaces (`ITEM_CPF`): these are single words
 * alone in the middle of the frame rather than lines in a column, so the eye is
 * already where the word will be and the typing is the entrance rather than
 * something to read along with. A loop has 25 frames of screen time in total,
 * which is what sets the ceiling — at this rate the longest, `/concepts`, is done in nine.
 */
export const SLUG_CPF = 1.1;
const SLUG_DELAY = 2;

/**
 * Every typed item with the frame its first character lands, for the keyboard
 * layer mounted at the top level — which cannot see inside these scenes.
 */
export const HARNESS_ITEMS: readonly { at: number; text: string }[] = [
  ...ITEMS.graphs.map((text, i) => ({ at: HARNESS.graphs.items[i] + ITEM_DELAY, text })),
  ...ITEMS.companion.map((text, i) => ({ at: HARNESS.companion.items[i] + ITEM_DELAY, text })),
];

/**
 * The slash-prefixed names the two centred movements type, at their own speed.
 *
 * Separate from `HARNESS_ITEMS` because they are typed at `SLUG_CPF` rather than
 * `ITEM_CPF`, and `TypingSound` schedules a click per character from whichever
 * rate it is handed — one list at the wrong speed is a keyboard that finishes
 * before the word does.
 */
export const HARNESS_SLUGS: readonly { at: number; text: string }[] = [
  ...SKILLS.map((text, i) => ({ at: HARNESS.skills.items[i] + SLUG_DELAY, text })),
  { at: HARNESS.loops.loop + SLUG_DELAY, text: "/loop" },
  ...LOOP_ICONS.map((loop, i) => ({
    at: HARNESS.loops.types[i] + SLUG_DELAY,
    text: `/${loop.slug}`,
  })),
];

export const Harness: React.FC = () => (
  <AbsoluteFill>
    <Sequence
      from={HARNESS.skills.heading - STAGE.harness}
      durationInFrames={HARNESS.loops.heading - HARNESS.skills.heading}
      name="Agent Skills"
    >
      <SkillsMovement />
    </Sequence>

    <Sequence
      from={HARNESS.loops.heading - STAGE.harness}
      durationInFrames={HARNESS.graphs.heading - HARNESS.loops.heading}
      name="Agent Loops"
    >
      <LoopsMovement />
    </Sequence>

    <Sequence
      from={HARNESS.graphs.heading - STAGE.harness}
      durationInFrames={HARNESS.companion.heading - HARNESS.graphs.heading}
      name="Agent Graphs"
    >
      <Movement
        heading="Agent Graphs"
        items={ITEMS.graphs}
        itemsAt={HARNESS.graphs.items.map((f) => f - HARNESS.graphs.heading)}
        startsAt={HARNESS.graphs.heading}
        shot={STAGE4.graphs}
      />
    </Sequence>

    <Sequence
      from={HARNESS.companion.heading - STAGE.harness}
      durationInFrames={OUTRO.connect - HARNESS.companion.heading}
      name="AI Companion"
    >
      <Movement
        heading="AI Companion"
        items={ITEMS.companion}
        itemsAt={HARNESS.companion.items.map((f) => f - HARNESS.companion.heading)}
        startsAt={HARNESS.companion.heading}
        shot={STAGE4.companion}
      />
    </Sequence>
  </AbsoluteFill>
);

/* ── The list layout ──────────────────────────────────────────────────────── */

/**
 * One movement: a heading, three items arriving on their own beats, and the
 * product doing the thing beside them.
 *
 * `children` replaces the item list for the loops movement, which has six colour
 * flashes to get through before its two lines.
 */
const Movement: React.FC<{
  heading: string;
  items?: readonly string[];
  /** Frames, relative to this movement's start, that each item arrives on. */
  itemsAt?: readonly number[];
  /** The composition frame this movement starts on — see `ink` below. */
  startsAt: number;
  shot: Shot;
  children?: React.ReactNode;
}> = ({ heading, items, itemsAt, startsAt, shot, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const settle = spring({ frame, fps, config: { damping: 200, stiffness: 150 } });

  /*
    The column's ink, asked of the wipes rather than assumed.

    This act is dark throughout and for three of its four movements the answer
    is simply `FG.base`. The first is the exception: its heading starts typing
    three frames after the drop and the drop's wipe travels right-to-left, so it
    reaches this column — the far side, in the wipe's own terms — eight frames
    in. For those few frames the stage under the type is still the build-up's
    white paper, and near-white type on it is the same failure the lockup used
    to have: not faint, absent. A rendered still of the drop showed "E" and "El"
    as ghosts.

    Same source as the mark's crossfade, for the same reason — see `themeMixAt`.
  */
  const ink = interpolateColors(
    themeMixAt(startsAt + frame, COLUMN.left + CAPTION_MARK + CAPTION_GAP),
    [0, 1],
    [FG.base, LIGHT.FG.base],
  );

  /*
    Which stage this movement is standing on, as a whole theme rather than as a
    blend — the card's bloom and the title's halo need a set of tokens, and half
    a theme is not one. Two of the four movements flip; see `wipes.ts`.
  */
  const stage = themeAt(startsAt);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: COLUMN.left,
          top: CAPTION.top,
          width: COLUMN.width,
        }}
      >
        {/*
          The heading sits on the caption line, at the same height it has in the
          tour layout — which is what lets the lockup slide horizontally between
          the two layouts instead of flying. The left padding is the mark's:
          `CAPTION_MARK`, never `CAPTION.size`. They are close enough today that
          getting it wrong costs a few pixels and looks fine, and it would stop
          looking fine the moment either was touched, with the two layouts
          drifting apart in a way nobody would think to check.
        */}
        <CaptionLine
          text={heading}
          delay={3}
          charsPerFrame={HEADING_CPF}
          color={ink}
          theme={stage}
        />

        <div style={{ marginTop: 92, display: "flex", flexDirection: "column", gap: 40 }}>
          {children ??
            items?.map((item, i) => (
              <Item key={item} text={item} at={itemsAt?.[i] ?? 0} ink={ink} />
            ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: PANEL.left,
          top: PANEL_TOP,
          transform: `scale(${interpolate(settle, [0, 1], [0.975, 1])})`,
          transformOrigin: "center",
        }}
      >
        {/*
          From the right, always, where the tour's cards cycle: this panel is
          against the right margin, so arriving from the edge it is nearest is
          the one direction that reads as the card sliding *into* the layout
          rather than across it.
        */}
        <AppShot
          shot={shot}
          width={PANEL.width}
          height={PANEL.height}
          theme={stage}
          glow={stage === "dark" ? 0.46 : 0.32}
          startsAt={startsAt}
          from="right"
        />
      </div>
    </AbsoluteFill>
  );
};

/** The bullet: a round dot, in the same ink as the line it belongs to. */
const DOT = 11;

/**
 * One line of the list: a dot, and the line typed out beside it.
 *
 * ── The bullet is a dot, and it is the type's own colour ────────────────────
 *
 * It was a 34×3 rule in a ramp colour, which is a dash — and a dash at the head
 * of a line is punctuation, so twelve of them read as twelve sentences with
 * their first word missing. A dot is a bullet in every typographic tradition
 * there is, and taking the colour out of it is what makes the list read as one
 * list rather than as twelve differently-coloured claims. The ramp is used
 * plenty elsewhere in this film; it was doing no work here.
 *
 * The dot *scales* in rather than growing sideways, because a round thing
 * arriving by getting wider is an ellipse for most of its entrance.
 *
 * Items are never removed. A movement's three lines are all on screen by its
 * last bar, which is what a list is for — removing each one as the next arrived
 * would make it a sequence of single lines, which is what the loop flashes are
 * and is why they are a different component.
 */
const Item: React.FC<{ text: string; at: number; ink: string }> = ({ text, at, ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - at, fps, config: { damping: 200, stiffness: 170 } });

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
        display: "flex",
        alignItems: "center",
        gap: 24,
      }}
    >
      <div
        style={{
          width: DOT,
          height: DOT,
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor: ink,
          transform: `scale(${interpolate(enter, [0, 1], [0.2, 1])})`,
        }}
      />
      <div
        style={{
          fontFamily: uiFontFamily,
          fontWeight: 500,
          fontSize: 40,
          lineHeight: 1.18,
          color: ink,
        }}
      >
        {/*
          `delay` is measured from this movement's start, which is what `at` is
          in — `Item` is mounted for the whole movement rather than from its own
          beat, so `frame` here is the movement's frame and not the item's.
        */}
        <Typewriter
          text={text}
          delay={at + ITEM_DELAY}
          charsPerFrame={ITEM_CPF}
          /* Every caret in this film is the intro's: thin, and in the ramp. */
          caret="bar"
        />
      </div>
    </div>
  );
};

/* ── The loops ────────────────────────────────────────────────────────────── */

/* ── The centred layout: "Agent Skills" and "Agent Loops" ─────────────────── */

/**
 * Stage 4's first two movements do not use stage 4's layout.
 *
 * The rest of the act is a column of type with the product beside it, which is
 * right when the copy is the argument and the recording is evidence. These two
 * are the opposite: the copy is one word and a slash, and what it names is a
 * thing you watch happening. So they borrow the *tour's* layout — the card
 * centred, the heading over it — and stand their type on the picture. That is
 * the client's fifth round: "rather than bullets on the left, each should be
 * typed out in the center, over the video, which is now also centred."
 *
 * It is `ClaimSlide` rather than a fourth layout of its own, because that
 * component is already a centred card with a typed heading and a slot over it.
 * What is new here is only what goes in the slot.
 */

/**
 * What each loop is for, under its name.
 *
 * The names, the colours and the glyphs all come from the app through
 * `LOOP_ICONS`; only this line is the film's own, so it is the only part of a
 * loop written down here. Keyed by slug rather than positional, so a reorder in
 * the generated table cannot silently pair a loop with another's description.
 */
const LOOP_BLURB: Record<string, string> = {
  guard: "security",
  concepts: "ideation & concepts",
  develop: "product & brainstorming",
  patrol: "reviews & feedback",
  medic: "on-call duty & critical issues",
  overhaul: "performance improvements",
};

/**
 * One `/word`, typed with a caret after it.
 *
 * The colour arrives by one of two routes and the component picks: the skills
 * are painted with the brand ramp, which is a background clipped to the glyphs,
 * and each loop is painted in a flat hue out of the app's own table. A ramp
 * cannot be a `color`, so these cannot be the same prop.
 *
 * The caret is the reason `Typewriter` gained `caretColor`. Under a clipped ramp
 * it keeps the ramp like every other caret in the film; in a loop's colour it
 * takes that colour, because a rainbow caret beside a green word is the one part
 * of the line that is not the thing being named.
 */
const TypedSlug: React.FC<{
  text: string;
  at: number;
  colour?: string;
  theme: Theme;
  size: number;
}> = ({ text, at, colour, theme, size }) => {
  const frame = useCurrentFrame();

  /*
    The ramp turns while the word is up. Held still on a word that is itself
    arriving it reads as a flat colour that happens not to be flat; turning it is
    what makes it the same live ramp the lockup carries.
  */
  const paint = colour
    ? { color: colour }
    : themeRainbowText(theme, 100 + Math.sin((frame - at) / 26) * 26);

  return (
    <div
      style={{
        fontFamily: uiFontFamily,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
        ...paint,
        /* Overhang room for the gradient's clip — see `PendingCard` in `AppShot.tsx`. */
        padding: "0.12em 0.12em 0.28em",
        margin: "-0.12em -0.12em -0.28em",
      }}
    >
      <Typewriter
        text={text}
        delay={at + SLUG_DELAY}
        charsPerFrame={SLUG_CPF}
        hideCursorWhenDone={false}
        caret="bar"
        caretColor={colour}
      />
    </div>
  );
};

/**
 * The slot over the card: everything centred in it, over a scrim.
 *
 * The scrim is not decoration. These two movements put type *on* a screen
 * recording, and the recording underneath is a dense IDE — a sidebar of branch
 * names, an open menu, a commit graph. White-ish type at 72px survives that;
 * `/guard` in green and a 34px grey line under it do not, and the frame where
 * they do not is whichever one the client happens to pause on.
 *
 * A radial rather than a flat wash, and only as dark in the middle as it needs
 * to be: what is being asked for is contrast under the words, not a dimmed
 * recording. At the edges it is nothing, so the card still reads as the app
 * running rather than as a screenshot behind a panel.
 */
const Over: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      pointerEvents: "none",
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage:
          "radial-gradient(52% 44% at 50% 50%, rgba(5,5,12,0.82) 0%, rgba(5,5,12,0.55) 45%, transparent 76%)",
      }}
    />
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {children}
    </div>
  </AbsoluteFill>
);

/** Rises into place under its own beat, like the list items it replaces. */
const Reveal: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - at, fps, config: { damping: 200, stiffness: 170 } });
  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [22, 0])}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** "Agent Skills" — three slugs stacked over the skills recording. */
const SKILL_SIZE = 72;
/** The line box one skill occupies, so the column never resizes. */
const SLOT = Math.round(SKILL_SIZE * 1.15);

const SkillsMovement: React.FC = () => {
  const frame = useCurrentFrame();
  const start = HARNESS.skills.heading;
  const stage = themeAt(start);
  const at = HARNESS.skills.items.map((f) => f - start);

  return (
    <ClaimSlide text="Agent Skills" shot={STAGE4.skills} at={start} theme={stage} from="right">
      <Over>
        {/*
          Every slot holds its height from the first frame, whether or not there
          is a word in it yet.

          The three arrive a beat apart into a centred column, so a column sized
          to what has arrived is a column that grows — and a centred box that
          grows moves its existing contents *upward* on each new line. That is
          the jump this repo keeps writing down (see `MidniteWordmark`'s note on
          why the name unfurls by width rather than fading): a thing that was
          still and then is not reads as a layout bug, not as an entrance.

          `SLOT` is the type's own line box, so three of them plus the gaps are
          the finished block's height on frame one.
        */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          {SKILLS.map((text, i) => (
            <div
              key={text}
              style={{
                height: SLOT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/*
                Mounted on its beat rather than hidden until then: `Typewriter`
                leaves a caret blinking on an empty line, which is right for the
                line being typed and wrong for the two below it — three carets
                waiting in a column is a form, not a sentence being written.
              */}
              {frame >= at[i] ? (
                <Reveal at={at[i]}>
                  <TypedSlug text={text} at={at[i]} theme={stage} size={SKILL_SIZE} />
                </Reveal>
              ) : null}
            </div>
          ))}
        </div>
      </Over>
    </ClaimSlide>
  );
};

/**
 * "Agent Loops" — `/loop`, then the six of them, one every half bar.
 *
 * Each loop is three objects: its glyph above, its name typed in its own colour,
 * and a line of copy under it in the stage's own ink. Only the name is typed,
 * because a card that is up for 25 frames cannot have three things arriving in
 * sequence and still be read.
 *
 * `key` on the card is the loop's index, so React builds a fresh element per
 * loop: the entrance and the typing both run off `frame - at`, and a reused
 * element would carry the previous loop's characters into the first frame of the
 * next — the same bug the intro's lines are keyed against.
 */
const LoopsMovement: React.FC = () => {
  const frame = useCurrentFrame();
  const start = HARNESS.loops.heading;
  const stage = themeAt(start);

  const loopAt = HARNESS.loops.loop - start;
  const types = HARNESS.loops.types.map((f) => f - start);

  /* Which loop is up: the last to have started. −1 while `/loop` holds alone. */
  const index = types.reduce((found, at, i) => (frame >= at ? i : found), -1);
  const loop = index >= 0 ? LOOP_ICONS[index] : null;

  return (
    <>
      <ClaimSlide text="Agent Loops" shot={STAGE4.loops} at={start} theme={stage} from="right">
        <Over>
          {loop === null ? (
            <Reveal at={loopAt}>
              <TypedSlug text="/loop" at={loopAt} theme={stage} size={86} />
            </Reveal>
          ) : (
            <LoopCard key={index} loop={loop} at={types[index]} theme={stage} />
          )}
        </Over>
      </ClaimSlide>

      <LoopWash types={types} end={HARNESS.graphs.heading - start} />

      {/*
        A band of the loop's own colour across the whole frame as it lands — the
        client's "use the shimmer for the respective loop colour each time,
        across the whole screen". It is mounted outside `ClaimSlide` because that
        component's slot is the card's box and this is the stage's width.

        `SmokeStreak`'s id is document-global, so each one carries its own beat in
        its id rather than a shared string; two sharing one would silently render
        whichever filter came last.
      */}
      {HARNESS.loops.types.map((at, i) => (
        <Sequence key={at} from={at - start} durationInFrames={18} layout="none">
          <SmokeStreak
            id={`loop-shimmer-${at}`}
            durationInFrames={18}
            direction={i % 2 === 0 ? 1 : -1}
            intensity={0.42}
            tint={LOOP_ICONS[i].colour}
            seed={(at % 23) + 1}
          />
        </Sequence>
      ))}
    </>
  );
};

/** The glyph, the name and the blurb, with a shimmer crossing all three. */
const LoopCard: React.FC<{ loop: LoopIcon; at: number; theme: Theme }> = ({ loop, at, theme }) => {
  const frame = useCurrentFrame();
  const local = frame - at;

  /*
    A highlight crossing the card itself, on top of the one crossing the stage.
    The brief asks for both — "as well as a shimmer across the icon and loop
    name" — and they are different objects: the stage's is smoke raking past,
    this is the ramp travelling along the letterforms' own stroke. It runs once
    rather than on a loop, because the card is only up for 25 frames and a
    sawtooth would show a second pass starting and being cut off.
  */
  const shimmer = interpolate(local, [4, 20], [-0.25, 1.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const blurb = LOOP_BLURB[loop.slug] ?? "";
  const ink = theme === "light" ? LIGHT.FG.muted : FG.muted;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <Reveal at={0}>
        <ShiningIcon loop={loop} shimmer={shimmer} size={96} />
      </Reveal>

      <ShimmerLine
        shimmer={shimmer}
        color={loop.colour}
        fontSize={80}
        fontWeight={600}
        stroke={1.8}
        theme={theme}
      >
        {`/${loop.slug}`}
      </ShimmerLine>

      {/*
        Under the name, in the stage's own ink rather than the loop's — the brief
        is explicit ("in normal theme font color underneath"), and it is the right
        call: with the glyph and the name already in the hue, a third object in it
        makes the card one colour and the word stops being the thing that is
        coloured.
      */}
      <Reveal at={6}>
        <div
          style={{
            fontFamily: uiFontFamily,
            fontWeight: 500,
            fontSize: 34,
            color: ink,
            letterSpacing: "0.01em",
          }}
        >
          {blurb}
        </div>
      </Reveal>
    </div>
  );
};

/**
 * The loop's glyph with the name's highlight crossing it too (v7: "add shimmer
 * to the loops' respective icons as well... not just the text").
 *
 * The same `shimmer` value as the name under it, and the same band maths as
 * `ShimmerLine` — centre at `shimmer × 140 − 20` percent — so one light passes
 * over the glyph and then the word rather than two lights passing near each
 * other. It is a second copy of the glyph painted with a gradient that is
 * transparent except for the band: the generated icons take their colour as a
 * `fill`/`stroke` value, and `url(#…)` is a colour value, so the band is clipped
 * to the glyph's own shape with no mask. A soft glow in the loop's colour swells
 * as it passes, which is what makes it read as light rather than a white bar.
 *
 * The gradient's id carries the loop's slug, because SVG ids are
 * document-global and six cards sharing one would all show the last one's.
 */
const ShiningIcon: React.FC<{ loop: LoopIcon; shimmer: number; size: number }> = ({
  loop,
  shimmer,
  size,
}) => {
  const id = `loop-icon-shine-${loop.slug}`;
  const centre = shimmer * 140 - 20;
  /* How much of the band is over the glyph: 1 at the middle, 0 off either edge. */
  const over = interpolate(centre, [-20, 50, 120], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        filter: `drop-shadow(0 0 ${Math.round(8 + over * 18)}px ${loop.colour})`,
      }}
    >
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="0.35">
            <stop offset={`${centre - 22}%`} stopColor="#ffffff" stopOpacity={0} />
            <stop offset={`${centre - 6}%`} stopColor="#ffffff" stopOpacity={0.55} />
            <stop offset={`${centre}%`} stopColor="#ffffff" stopOpacity={0.95} />
            <stop offset={`${centre + 6}%`} stopColor="#ffffff" stopOpacity={0.55} />
            <stop offset={`${centre + 22}%`} stopColor="#ffffff" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0 }}>
        <loop.Icon size={size} colour={loop.colour} />
      </div>
      <div style={{ position: "absolute", inset: 0 }}>
        <loop.Icon size={size} colour={`url(#${id})`} />
      </div>
    </div>
  );
};

/**
 * A very faint wash of the current loop's colour over the whole stage, blending
 * into the next loop's as each one lands (v7: "a very transparent overlay
 * blending between the different agent loop colors, as it transitions").
 *
 * The blend straddles each change — `BLEND` frames either side of the beat —
 * so the stage is already turning towards the new hue as the card cuts, and is
 * fully in it by the time the name has typed. It fades in with the first loop
 * and out before the wipe to "Agent Graphs", which paints its own stage.
 *
 * A radial rather than a flat fill, heaviest at the centre where the card is:
 * a flat tint across a dark stage reads as the whole picture changing white
 * balance, where this reads as coloured light falling on the middle of it.
 */
const BLEND = 6;
const WASH = 0.11;

const LoopWash: React.FC<{ types: readonly number[]; end: number }> = ({ types, end }) => {
  const frame = useCurrentFrame();

  const range: number[] = [];
  const colours: string[] = [];
  types.forEach((at, i) => {
    if (i > 0) {
      range.push(at - BLEND);
      colours.push(LOOP_ICONS[i - 1].colour);
    }
    range.push(i > 0 ? at + BLEND : at);
    colours.push(LOOP_ICONS[i].colour);
  });
  const colour = interpolateColors(frame, range, colours);

  const opacity =
    WASH *
    interpolate(frame, [types[0] - BLEND, types[0] + BLEND, end - 12, end], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        opacity,
        mixBlendMode: "screen",
        backgroundImage: `radial-gradient(ellipse 70% 65% at 50% 52%, ${colour} 0%, ${colour}99 45%, transparent 100%)`,
      }}
    />
  );
};

