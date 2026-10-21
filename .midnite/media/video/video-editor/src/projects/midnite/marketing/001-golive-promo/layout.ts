/**
 * Where things are on the stage, in pixels, once.
 *
 * Two layouts carry the whole film and they are different on purpose, because
 * the two halves of it are doing different jobs. Stages 2 and 3 are a *tour* —
 * one claim, one picture, the claim over the picture, which is the pilot's
 * layout and is right when the picture is the argument. Stage 4 is a *list* —
 * four movements of three lines each, where the copy is the argument and the
 * recording is evidence beside it, so the type takes a column and the window
 * moves right.
 *
 * Both are laid out from the same 1920×1080 stage and the same caption line, so
 * the object that persists across them — the lockup — only ever has to move
 * horizontally between the two, never vertically. That is why the mark's
 * journey across the middle of this film is a slide rather than a flight.
 */

export const STAGE = { width: 1920, height: 1080 } as const;

/* ── The tour layout: stages 2 and 3 ──────────────────────────────────────── */

/**
 * The card every claim shows its recording in, at one size for all of them.
 *
 * The height is what is left of 1080 after a 64px head, the caption's own 60px
 * line, the 40px gap under it and a 76px foot; the width is that height times
 * the recordings' 2912÷1758. One size for every shot is the point — a window
 * that resizes between two hard cuts reads as a layout bug rather than as an
 * edit, so a clip that needs cropping is covered into this box instead.
 */
export const WINDOW = { width: 1391, height: 840 } as const;

/** The window is centred, so this is the column everything else lines up to. */
export const WINDOW_LEFT = (STAGE.width - WINDOW.width) / 2; // 264.5

/* ── The list layout: stages 4 and 5 ──────────────────────────────────────── */

/**
 * The left column of type and the window beside it.
 *
 * 120px margins either side, a 560px column, a 60px gutter and a 1060px card —
 * which sums to 1920 exactly, so neither margin is a leftover. The card's height
 * is its width at the recordings' own aspect, centred vertically.
 *
 * The column's width is what sets the item type size rather than the other way
 * round: at 46px the list wrapped five of its twelve lines and read as ragged
 * prose, at 40px it wraps two — "Voice comms, like J.A.R.V.I.S" and "Configure
 * behaviour with a UI", both of which are long enough that wrapping them looks
 * typeset rather than accidental. Widening the column instead would have cost
 * the card the width, and the card is showing a 2912px-wide app.
 */
export const COLUMN = { left: 120, width: 560 } as const;
export const PANEL = {
  left: 740,
  width: 1060,
  height: Math.round(1060 / (2912 / 1758)), // 640
} as const;
export const PANEL_TOP = Math.round((STAGE.height - PANEL.height) / 2); // 220

/* ── The caption line, shared by both ─────────────────────────────────────── */

/**
 * 50px type on a 60px line, starting 64px down.
 *
 * It was 44 on 55, set in JetBrains Mono. From bar 0 these are page titles in
 * the UI face rather than terminal captions (see `TypedTitle`), and the UI face
 * is narrower per character and lighter in colour at the same nominal size — so
 * the size goes up rather than the titles quietly losing presence. The longest
 * of them, "Manage multiple git repos", is about 650px at this size against a
 * 1391px window.
 */
export const CAPTION = { top: 64, size: 50, line: 60 } as const;
/** The mark sits in the caption line where a bullet would, centred in it. */
export const CAPTION_MARK = 50;
/** Gap between the mark and the first character of the caption. */
export const CAPTION_GAP = 22;

/* ── Where the lockup lives ───────────────────────────────────────────────── */

/**
 * The mark's stations, as offsets from the centre of the stage.
 *
 * `dx: 0` is not "at x = 960" — it is "wherever centring the lockup puts it".
 * The lockup is laid out in a centred flex box, so while the name is out the
 * pair is centred *as a pair* and the mark sits left of the middle by half the
 * name. What travels is the lockup; the mark is where the lockup's left edge is.
 *
 * The two caption stations can have a fixed x because the name is folded away
 * at both of them, so the lockup there is exactly the mark.
 *
 * The y offsets are the centres of the blocks each station belongs to:
 *
 *   open     the mark alone on the stage, a little above centre
 *   caption  the 60px caption line starting at 58, mark centred in it
 *   column   the same line, moved left to the list layout's margin
 *   connect  the outro's own: centred, high, and half again as big — the mark
 *            standing over "Connect with" rather than beside a caption
 *   breath   centred and bigger still, for the two empty bars before the drop
 *   close    open again, exactly — see below
 *
 * ── `close` is `open`, and that is load-bearing ─────────────────────────────
 *
 * The film opens on the crescent alone, centred on black, and ends on the same
 * picture: the name folds back into the mark, "Coming Soon" comes and goes, the
 * stage goes to true black and what is left is the mark where it started. Play
 * the file twice in a row and there is no seam.
 *
 * That only works if the last station is the first one *to the pixel*, so it is
 * the same object rather than a second set of numbers that happen to agree
 * today. It was 160px at y=494 — six pixels bigger and thirty-two lower, which
 * on a loop is a visible jump on the cut and looks like a dropped frame.
 */
const captionY = CAPTION.top + CAPTION.line / 2 - STAGE.height / 2;

/**
 * The mark alone, true stage centre. Both ends of the film live here.
 *
 * It used to sit at y=462 — 78px above the stage's actual middle (540) —
 * deliberately, on the argument that a block centred on the geometric middle
 * of a 16:9 frame reads as low. The client's fourth round said otherwise: "not
 * vertically centred... move the logo to be vertically centred," and measured
 * against a rendered still (`bbox.py` on f10 and f2630, both the mark alone on
 * black — see `EDITORIAL_SCRIPT.md` §9.1) 78px is not a subtle lean, it is 7%
 * of the picture. That reading is overruled: this station is now centred, not
 * optically adjusted.
 *
 * It is 537 rather than 540 because the crescent's own artwork is not centred
 * in its box — measured at `size: 168` there are 7px of padding above the ink
 * and 1px below, so the ink sits 3px low of the box's centre. Lifting the box
 * by that much puts the *ink* on 540, which is the thing a viewer actually
 * sees.
 *
 * That correction is a proportion of the mark, not three pixels: the padding is
 * part of the artwork and scales with it. Written as a ratio so a station at a
 * different size gets the right number rather than this one's — `MARK.breath`
 * stands at 230px and needs 4.1.
 */
const INK_LOW = 3 / 168;

/** Lift a station of this size so the crescent's ink lands on the given line. */
const inkCentred = (size: number): number => -size * INK_LOW;

const OPEN = { size: 168, dx: 0, dy: inkCentred(168) } as const; // dy = -3

export const MARK = {
  open: OPEN,
  caption: {
    size: CAPTION_MARK,
    dx: WINDOW_LEFT + CAPTION_MARK / 2 - STAGE.width / 2,
    dy: captionY,
  },
  column: {
    size: CAPTION_MARK,
    dx: COLUMN.left + CAPTION_MARK / 2 - STAGE.width / 2,
    dy: captionY,
  },
  /*
    The outro opens in the quietest two bars the track has, with nothing on the
    stage but a line of type — so the mark comes off the caption line, back to
    the middle and up, and stands over that line at 180px instead of 46. It is
    the only station where the mark is *above* something rather than beside it,
    and it is there because from here to the end of the film the logo is the
    subject again.

    `OUTRO_*` below hang the rest of the act off it, so moving this moves them.
  */
  connect: { size: 180, dx: 0, dy: 250 - STAGE.height / 2 },
  /*
    The two bars before the drop, where the track empties out and the stage is
    bare. The mark comes off the caption line back to the middle and grows by
    a third again on `MARK.open`, and `Crescendo` implodes a field of smoke and
    motes onto it before blowing them out on the hit.

    This is the one station whose position another component depends on:
    `Crescendo` converges on the stage's literal centre, so the mark's ink has
    to be there too — hence `inkCentred` rather than a round 0. If this moves,
    that moves.
  */
  breath: { size: 230, dx: 0, dy: inkCentred(230) },
  close: OPEN,
} as const;

/* ── The build-up's statement: mark and line as one pair ──────────────────── */

/**
 * The mark beside "Replace no one" / "Empower everyone!" — client's fourth
 * round: "the logo should move down to be on the left of either piece of
 * text." (`EDITORIAL_SCRIPT.md` §9.3.)
 *
 * Both lines are `ShimmerLine` at `fontSize: 104`, independently centred on the
 * stage by `Statement` in `BuildUp.tsx`, and measured with `bbox.py` (f989,
 * f1040 — body layer only, above the blurred ramp-glow underneath it):
 *
 *   "Replace no one"     813px ink width, centred ≈960
 *   "Empower everyone!"  1050px ink width, centred ≈958
 *
 * A single fixed mark position sized to clear the wider line leaves a 153px
 * gap on the narrower one — a real, disclosed asymmetry (§9.3's own note) —
 * rather than a fixed 32px gap either line could share. So this is not one
 * station: the mark and the line move *together*, one lockup, and what is
 * fixed is the **gap** and the **pair's centring**, not either object's own
 * position.
 *
 * The algebra (`pairCentre = 960`, `gap` constant, both edges of the pair
 * equidistant from centre): with the mark's box `S` wide, the gap `g`, and the
 * line `W` wide,
 *
 *   textCentre = 960 + (S + g) / 2        — independent of `W`
 *   markCentre = 960 − (g + W) / 2        — depends on the line beside it
 *
 * which is why the text only ever needs *one* shift (`STATEMENT_TEXT_SHIFT`,
 * applied in `BuildUp.tsx` to both lines identically) while the mark needs two
 * stations, one per line's measured width.
 */
/**
 * 96, and it is measured against the *ring* rather than the crescent.
 *
 * The first cut of this station used 32, derived from the mark's 124px box —
 * and a still at f1040 had the spectrum ring lying across the "E" of "Empower
 * everyone!". `MarkWaveform` stands its spokes a full mark-height off the
 * centre, so the lit object is 248px wide where the box is 124 (measured on
 * that still: ink x312–559 against a text ink starting at 510). A gap sized to
 * the box is half a gap.
 *
 * So: 62 to clear the ring, plus the 34 the intro already uses between its own
 * mark and the line beside it. Using the intro's number for the air rather than
 * a fresh one is the point — it is the same pairing of the same two objects,
 * and this station should not invent its own spacing.
 */
const STATEMENT_GAP = 96;
/** The line's own line height (104 × 1.2), so the mark stands exactly as tall as the text beside it. */
const STATEMENT_SIZE = 124;
/** Measured ink centre of both statement lines (`bbox.py`, f989/f1040) — consistent across the theme change. */
const STATEMENT_Y = 550;
/** Measured ink widths (`bbox.py`, f989/f1040) — see the derivation above. */
const REPLACE_NO_ONE_WIDTH = 813;
const EMPOWER_EVERYONE_WIDTH = 1050;

/** `markCentre − 960`, from the algebra above. */
const statementMarkDx = (lineWidth: number): number => -(STATEMENT_GAP + lineWidth) / 2;

/**
 * How far `BuildUp.tsx` shifts *either* statement line right of stage centre,
 * so the mark + line pair reads as centred rather than the line alone.
 * Constant regardless of which line is showing — see the algebra above.
 */
export const STATEMENT_TEXT_SHIFT = (STATEMENT_SIZE + STATEMENT_GAP) / 2; // 78

export const STATEMENT_MARK = {
  replaceNoOne: {
    size: STATEMENT_SIZE,
    dx: statementMarkDx(REPLACE_NO_ONE_WIDTH),
    dy: STATEMENT_Y - STAGE.height / 2,
  },
  empowerEveryone: {
    size: STATEMENT_SIZE,
    dx: statementMarkDx(EMPOWER_EVERYONE_WIDTH),
    dy: STATEMENT_Y - STAGE.height / 2,
  },
} as const;

/* ── The outro's own stack, measured down from the mark ───────────────────── */

/**
 * The mark at `connect` is 180px with a spectrum ring standing 1.13 × its own
 * height off its centre, so the ring reaches y ≈ 453. Everything below starts
 * clear of that.
 *
 * The stack as a whole sits a little above the middle rather than centred on
 * it: from the mark's own top edge at 160 to the call to action's foot at 866,
 * its centre is y ≈ 513. That used to be defended as the same optical-centre
 * argument `MARK.open` made (§9.1) — it no longer is: the client's fourth
 * round overruled that argument for `MARK.open`, and this stack is untouched
 * by that change (it is its own independent set of absolute numbers, not
 * derived from `MARK.open`) precisely because nobody measured *this* block
 * and asked for it to move. If it is ever revisited, measure it the way §9.1
 * measured the mark rather than inheriting a rationale that has already been
 * overruled once.
 */
export const OUTRO_EYEBROW_TOP = 482;
export const OUTRO_FORGE = { top: 536, height: 200 } as const;
export const OUTRO_CTA_TOP = 766;

/** Linear blend, for moving between two stations. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
