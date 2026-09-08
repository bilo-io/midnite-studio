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
 * The halo is a fourth, empty element behind them: a static `box-shadow` at an
 * animated opacity, which is the cheap half of the glow and stays out of the
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
          className="ws-agent-halo pointer-events-none absolute inset-2 rounded-full opacity-0"
          style={{ boxShadow: `0 0 28px 8px ${agent.color}` }}
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
 * and slot 0 starts dead centre; so slot `k` is centred at `k × CYCLE_MS`, and
 * `useMarqueeCycle` returns that index from the clock alone. Nothing measures an
 * element, and there is no `requestAnimationFrame` loop at all — the cost is one
 * `setTimeout` per logo. See the hook's docblock for the drift argument and
 * `site.css` for the four custom properties the arithmetic depends on.
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
              <span
                className="ws-agent-static group flex flex-col items-center gap-2"
                tabIndex={0}
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
        className="ws-marquee-fade relative mx-auto h-44 overflow-hidden"
        style={{ maxWidth: `${BAND_MAX_PX}px` }}
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
