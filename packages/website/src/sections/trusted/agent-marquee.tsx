import { useEffect, useState, type CSSProperties } from 'react';

import { useReducedMotion } from '../../components';

import { SITE_AGENTS, type SiteAgent } from './agents';
import { useMarqueeCycle } from './use-marquee-cycle';

/**
 * One logo's slot width, in px, and the number the hook's arithmetic rests on.
 *
 * It must be a *fixed* length: the whole reason nothing is measured is that
 * slot `k`'s centre is at a known multiple of this. A `%` or a `ch` here would
 * make the centred logo depend on the viewport, and the cycle would drift out
 * of step with the scroll on every resize.
 */
const SLOT_PX = 152;

/** How long each logo owns the centre. Also the length of its own animation. */
const CYCLE_MS = 1900;

/**
 * How many times the roster is repeated in the track: one to fill the left half
 * of the band, one to run through the centre, one to feed in from the right.
 *
 * Two copies are enough to make the *loop* seamless — the pass travels exactly
 * one copy's width, so copy 2 lands where copy 1 began. The third exists
 * because the track is positioned by its centre, not its left edge: without a
 * copy ahead of the centred one, the left half of the band is empty on the
 * first frame and again the instant the animation wraps.
 *
 * **This is why the band is capped at the container's width** (see
 * `BAND_MAX_PX`). One copy spans `count × SLOT_PX` = 1520px, and the band's
 * half-width is at most 576px, so of the three copies of a given logo the
 * nearest wrong one is always more than 1400px off centre — comfortably
 * clipped. That invariant is what lets every copy of the selected logo run the
 * cycle without working out which copy is the live one: only one of them can
 * possibly be on screen.
 */
const COPIES = 3;

/**
 * Which copy starts centred — the second, so the first can fill the left.
 * The lead handed to CSS is this many copies plus the half-slot that turns
 * "slot 0's left edge" into "slot 0's centre".
 */
const LEAD_COPIES = 1;

/**
 * The band's maximum width, matching `Container`'s `max-w-6xl`.
 *
 * Not cosmetic: it is the premise of the "only one copy can be visible"
 * argument above. A full-bleed band would break it on a wide display, and the
 * fix would be more copies rather than a wider box.
 */
const BAND_MAX_PX = 1152;

/*
  ── How tall the band has to be ────────────────────────────────────────────────

  The band clips (`overflow-hidden`), and it has to: three copies of the roster
  span 4560px inside a box at most 1152px wide, so the horizontal clip is what
  makes the marquee a marquee. Clipping *vertically* is nothing but a bug —
  the selected logo grows past 2x with a halo and a drop-shadow around it, and a
  band sized for the resting logo cuts the top and bottom off the glow.

  `overflow-x: hidden` with `overflow-y: visible` is not the fix: CSS resolves a
  `visible` on one axis to `auto` when the other is `hidden`, so that trades a
  clipped glow for a scrollbar. The fix is arithmetic — make the box taller than
  the tallest thing the cycle paints — and every term below is read off the CSS
  rather than guessed:

    mark               `h-14 w-14`                          56px
    halo               `-inset-3` on the mark, both sides   +2 x 12px  = 80px
    peak scale         `@keyframes ws-agent-bounce`'s peak        x 2.15
    ⇒ halo at peak                                           172px

  …and then one term that is in no box model at all. The mark turns on `rotateY`
  under `perspective(700px)`, so mid-turn its near half is *closer to the
  viewer* and its projection is taller than its layout box. Measured on a live
  page the mark's own rect peaks at 2.31x its resting 56px against a declared
  peak of 2.15 — a magnification of ~1.15, the same order as the arithmetic
  bound `700 / (700 - 172/2)` = 1.14 the height below uses. Either way, a height
  derived from the layout box alone is ~24px short in exactly the frames the
  logo is biggest, which is why the earlier `h-44` looked fine in a still and
  clipped in motion.

  The glyph's own `drop-shadow(0 0 16px)` reaches 56 x 2.15 + 2 x 16 = 152px
  before magnification, so the halo is the binding constraint either way.
  `SLACK_PX` is on top of all of it: the halo is a radial gradient that fades to
  transparent at 68% of its box, so its last few percent are faint rather than
  absent, and a band that ends exactly where the maths does still shows a
  straight edge where the falloff meets it.
*/
const MARK_PX = 56;
const HALO_INSET_PX = 12;
const SLACK_PX = 24;
/** `perspective()` in `@keyframes ws-agent-spin`, in px. */
const PERSPECTIVE_PX = 700;

/**
 * The size the selected logo holds at, and the overshoot it gets there through.
 *
 * **Both are handed to CSS as custom properties** rather than written into
 * `@keyframes ws-agent-bounce`, for the same reason the four geometry
 * properties are: the band's height is derived from the peak, and a keyframe
 * cannot be read from JS. Duplicating the number in the stylesheet would mean a
 * change in one file silently clipping the glow in the other — which is the
 * exact bug the height below exists to fix. So the keyframe interpolates
 * `var(--ws-agent-peak)` and `var(--ws-agent-scale)`, and these are the only
 * places either number is written down.
 */
export const HOLD_SCALE = 2;
export const PEAK_SCALE = 2.15;

/** The halo's own box at the bounce's peak, before the turn magnifies it. */
const HALO_PEAK_PX = (MARK_PX + HALO_INSET_PX * 2) * PEAK_SCALE;

/** The band's height: the glow at its widest, magnified, plus the falloff. */
export const BAND_PX =
  Math.ceil((HALO_PEAK_PX * PERSPECTIVE_PX) / (PERSPECTIVE_PX - HALO_PEAK_PX / 2)) +
  SLACK_PX * 2;

type AgentLogoProps = {
  agent: SiteAgent;
  /** `true` while this slot is the one running the centre cycle. */
  selected: boolean;
};

/**
 * One logo in the track.
 *
 * Three nested elements, and each one has a job the others cannot do:
 *
 * - the **slot** is fixed-width and never transforms, so the track's geometry
 *   (and therefore the hook's arithmetic) is unaffected by what the logo does;
 * - the **mark** is what spins and scales — it is the element the cycle
 *   keyframes drive, and the only one that ever asks for a compositor layer;
 * - the **glyph** carries the `drop-shadow` glow, so the filter applies to the
 *   SVG's own paths and traces the artwork rather than a bounding box.
 *
 * The halo is a fourth, empty element behind them: a static radial gradient at
 * an animated opacity, which is the cheap half of the glow and stays out of the
 * drop-shadow's rasterisation.
 */
const AgentLogo = ({ agent, selected }: AgentLogoProps) => {
  const { Icon, multicolour = false } = agent;
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{ width: `${SLOT_PX}px` }}
      aria-hidden="true"
    >
      <div
        className="ws-agent-mark relative flex h-14 w-14 items-center justify-center"
        data-selected={selected}
        data-agent={agent.id}
        style={{ '--ws-agent-color': agent.color } as CSSProperties}
      >
        <span
          className="ws-agent-halo pointer-events-none absolute -inset-3 rounded-full opacity-0"
          /*
            A radial gradient, not the `box-shadow` this started as. A shadow is
            painted strictly *outside* the border box, so on a round element it
            comes out as a ring with an unpainted hole in the middle — which is
            not what "a soft halo" looks like once the mark grows to 2x and the
            hole is bigger than the mark. Background paint fills the whole box
            and falls off smoothly, and it skips the shadow blur entirely.
          */
          style={{
            background: `radial-gradient(circle at center, ${agent.color} 0%, transparent 68%)`,
          }}
        />
        <span
          className="ws-agent-glyph relative flex h-full w-full items-center justify-center"
          /*
            Antigravity's mark carries its own colours, so tinting it does
            nothing and `currentColor` must not be handed the brand hue as if
            it would — see `multicolour` in `agents.ts`. Everything else is a
            one-colour silhouette that takes the brand colour directly, which is
            what makes each logo light up as itself rather than in the site's
            accent.
          */
          style={multicolour ? undefined : { color: agent.color }}
        >
          <Icon className="h-full w-full" />
        </span>
      </div>
    </div>
  );
};

export type AgentMarqueeProps = {
  /** Overridable for tests; defaults to the whole roster. */
  agents?: readonly SiteAgent[];
  className?: string;
};

/**
 * The banner: the roster scrolling past, one logo at a time taking the centre.
 *
 * **How the two animations stay in step.** They are not synchronised by
 * messaging — they are two readings of the same fixed geometry. The track moves
 * left by exactly `count` slots over `count × CYCLE_MS`, linearly and forever,
 * and the second copy's slot 0 starts dead centre; so slot `k` is centred at
 * `k × CYCLE_MS`, and
 * `useMarqueeCycle` returns that index from the clock alone. Nothing measures an
 * element, and there is no `requestAnimationFrame` loop at all — the cost is one
 * `setTimeout` per logo. See the hook's docblock for the drift argument and
 * `site.css` for the custom properties the arithmetic depends on.
 *
 * **Pausing.** Hover and `document.hidden` both feed one `paused` flag, which
 * stops the CSS animations (`animation-play-state`, via `data-paused`) and
 * freezes the hook's timeline together. Hidden matters more than hover: a
 * backgrounded tab that keeps animating is the difference between an idle page
 * and a page that drains a battery in a tab nobody is looking at.
 *
 * **Reduced motion** takes a different branch entirely rather than a slower
 * version of this one — a static grid, each logo glowing on hover or keyboard
 * focus only. A marquee has no still frame that says what a marquee says, so
 * there is nothing to degrade to; the grid says the same thing without moving.
 *
 * The logos are `aria-hidden` in both branches and the names are given once as
 * plain text below the band. A screen reader wants "Claude, Antigravity,
 * Codex…", not thirty unlabelled images, and it certainly does not want to be
 * told which one is currently large.
 */
export const AgentMarquee = ({ agents = SITE_AGENTS, className = '' }: AgentMarqueeProps) => {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    setHidden(document.hidden);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const paused = hovered || hidden;
  const count = agents.length;
  const selected = useMarqueeCycle({ count, periodMs: CYCLE_MS, paused: paused || reduced });

  const names = agents.map((agent) => agent.label).join(', ');

  if (reduced) {
    return (
      <div className={className}>
        <ul
          data-testid="agent-grid"
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6 sm:gap-x-12"
        >
          {agents.map((agent) => (
            <li key={agent.id}>
              {/*
                No `tabIndex`: the glow is decoration, and making ten
                non-interactive logos focusable would add ten tab stops that
                lead nowhere — worse for a keyboard user than no glow at all.
                The `:focus-visible` half of the rule in `site.css` stays, so it
                works the day one of these becomes a link.
              */}
              <span
                className="ws-agent-static flex flex-col items-center gap-2"
                style={{ '--ws-agent-color': agent.color } as CSSProperties}
              >
                <span
                  className="ws-agent-glyph flex h-10 w-10 items-center justify-center"
                  style={agent.multicolour ? undefined : { color: agent.color }}
                  aria-hidden="true"
                >
                  <agent.Icon className="h-full w-full" />
                </span>
                <span className="text-xs text-fg-subtle">{agent.label}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        data-testid="agent-marquee"
        className="ws-marquee-fade relative mx-auto overflow-hidden"
        style={{ maxWidth: `${BAND_MAX_PX}px`, height: `${BAND_PX}px` }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <div
          className="ws-marquee-track"
          data-paused={paused}
          style={
            {
              '--ws-agent-slot': `${SLOT_PX}px`,
              '--ws-agent-shift': `${SLOT_PX * count}px`,
              '--ws-agent-pass': `${CYCLE_MS * count}ms`,
              '--ws-agent-lead': `${SLOT_PX * count * LEAD_COPIES + SLOT_PX / 2}px`,
              '--ws-agent-cycle': `${CYCLE_MS}ms`,
              '--ws-agent-scale': HOLD_SCALE,
              '--ws-agent-peak': PEAK_SCALE,
            } as CSSProperties
          }
        >
          {Array.from({ length: COPIES }, (_, copy) =>
            agents.map((agent, index) => (
              <AgentLogo
                /*
                  Keyed by copy as well as id, because the roster appears
                  `COPIES` times and React needs each slot to be its own node.
                */
                key={`${copy}-${agent.id}`}
                agent={agent}
                /*
                  Every copy of a logo lights up together, and that is correct
                  rather than lazy: one copy spans 1520px against a band at most
                  1152px wide, so of the three copies of this logo at most one
                  can be on screen. Picking "the live copy" would mean tracking
                  the wrap, which is a special case the geometry already rules
                  out — see COPIES.
                */
                selected={index === selected}
              />
            )),
          )}
        </div>
      </div>

      <p className="sr-only">{names}</p>
    </div>
  );
};
