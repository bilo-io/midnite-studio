import { useReducedMotion } from '../../components';

/** The four lane hues, as token references. Matches the hero's grid. */
const LANES = ['var(--ws-lane-1)', 'var(--ws-lane-2)', 'var(--ws-lane-3)', 'var(--ws-lane-4)'];

/**
 * One lane, as a cubic path across a 1200×160 viewBox.
 *
 * Each lane rises and falls a little differently and they cross twice, which is
 * what makes the set read as a *graph* rather than as four parallel rules — the
 * crossings are the merges.
 */
const LANE_PATHS = [
  'M0 118 C 200 118, 260 62, 440 62 S 700 108, 900 96 S 1080 58, 1200 58',
  'M0 74 C 220 74, 300 122, 500 122 S 760 66, 940 76 S 1100 118, 1200 118',
  'M0 96 C 180 96, 300 96, 420 40 S 720 40, 880 62 S 1060 84, 1200 84',
  'M0 46 C 260 46, 340 104, 560 104 S 820 132, 1000 120 S 1120 96, 1200 96',
];

/** Where a node dot sits on each lane, as a fraction of the path length. */
const NODES: readonly { lane: number; at: number }[] = [
  { lane: 0, at: 0.18 },
  { lane: 1, at: 0.34 },
  { lane: 2, at: 0.5 },
  { lane: 3, at: 0.66 },
  { lane: 0, at: 0.82 },
];

/**
 * The footer's horizon: the hero's lane graph, laid flat and drifting.
 *
 * The hero's backdrop is a canvas with a `requestAnimationFrame` loop, because
 * it tracks the pointer. This one does not react to anything, so it is an
 * **SVG with one CSS animation** — no rAF, no context, no per-frame arithmetic,
 * and nothing to stop when the tab is hidden (the browser suspends CSS
 * animations off-screen by itself). Four paths and five dots is the whole cost.
 *
 * **Static under reduced motion, not merely slower.** `useReducedMotion` drops
 * the animation class, so the lanes are drawn once and sit still — which is
 * also what `tokens.css`'s global animation clamp would produce, but doing it
 * here means the resting frame is the *drawn* one rather than whatever phase a
 * 0.01ms animation happens to land on.
 *
 * The drift is a `stroke-dashoffset` walk over a very long dash, so the lanes
 * appear to flow sideways without anything moving position — no layout, no
 * transform, one animated property that only touches paint.
 */
export const FooterHorizon = () => {
  const reduced = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 overflow-hidden opacity-70">
      {/*
        A scoped keyframe. The site has no shared home for one-off decoration
        keyframes and `styles/site.css` is a file three wave-2 agents share, so
        this rides with the component that owns it under a name nothing else
        uses.
      */}
      <style>{`
        @keyframes ws-horizon-drift {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -340; }
        }
        .ws-horizon-lane { animation: ws-horizon-drift 14s linear infinite; }
      `}</style>

      <svg
        data-testid="footer-horizon"
        data-animated={!reduced}
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <defs>
          {/*
            Fades the lanes out towards the left and right edges, so the horizon
            has no visible ends — it reads as continuing past the window rather
            than as four lines that stop.
          */}
          <linearGradient id="ws-horizon-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="18%" stopColor="white" stopOpacity="1" />
            <stop offset="82%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="ws-horizon-mask">
            <rect x="0" y="0" width="1200" height="160" fill="url(#ws-horizon-fade)" />
          </mask>
        </defs>

        <g mask="url(#ws-horizon-mask)">
          {LANE_PATHS.map((d, index) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={LANES[index % LANES.length]}
              strokeWidth={1.25}
              strokeOpacity={0.22}
              strokeDasharray="300 40"
              className={reduced ? undefined : 'ws-horizon-lane'}
              style={reduced ? undefined : { animationDelay: `${index * -3.5}s` }}
            />
          ))}

          {NODES.map(({ lane, at }) => {
            // Sampled from the path's own control points would need the DOM, so
            // the dots sit on the viewBox by hand — close enough on a decoration
            // whose lanes are 1.25px wide and a third opaque.
            const x = at * 1200;
            const y = 40 + ((lane * 29) % 90);
            return (
              <circle
                key={`${lane}-${at}`}
                cx={x}
                cy={y}
                r={2.4}
                fill={LANES[lane % LANES.length]}
                fillOpacity={0.4}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
