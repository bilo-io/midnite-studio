import { Tooltip } from '../../components/tooltip';
import type { BranchHealth, HealthLevel } from './branch-health';

/**
 * The dot beside a branch name: what state it is in, and whether it is live.
 *
 * A single marker doing two jobs, which is why it is one element and not two.
 * The dot has always meant "checked out here"; the colour now says how that
 * checkout is doing, and the breathing halo says it is the one the app is
 * pointed at. Splitting them into a dot plus a badge would put two competing
 * marks on a 20px row.
 *
 * The colour comes from `--health-*` custom properties (styles.css) rather than
 * Tailwind classes because both the core and its halo need the SAME hue at two
 * different alphas, and a token pair per level is a shorter road to that than
 * eight utility classes.
 */
const TONE: Record<HealthLevel, string> = {
  unknown: '--health-unknown',
  ok: '--health-ok',
  warn: '--health-warn',
  fail: '--health-fail',
};

export function BranchDot({
  health,
  what,
  pulse = false,
}: {
  health: BranchHealth;
  /**
   * What the dot is marking, in words — "Checked out here", a branch name. The
   * reason is appended, so the tooltip reads as one sentence rather than a
   * colour the user has to decode.
   */
  what: string;
  /** Breathes the halo. Reserved for the checkout the app is pointed at. */
  pulse?: boolean;
}) {
  const token = TONE[health.level];
  const core = `hsl(var(${token}))`;
  const halo = `hsl(var(${token}) / 0.75)`;
  const label = health.reason ? `${what} — ${health.reason}` : what;

  return (
    <Tooltip label={label}>
      <span role="img" aria-label={label} className="relative inline-flex h-2 w-2 shrink-0">
        {/*
          The halo is its own element, inset NEGATIVELY: it has to be able to
          grow past the dot without the row reflowing, and a box-shadow cannot
          hold a gradient. Sized in px rather than a Tailwind step because it is
          a glow around a 6px dot, not a layout box.
        */}
        <span
          aria-hidden
          className={`absolute -inset-1 rounded-full ${
            pulse ? 'animate-halo-breathe' : 'opacity-40'
          }`}
          style={{ background: `radial-gradient(circle, ${halo} 0%, transparent 70%)` }}
        />
        <span
          aria-hidden
          className="absolute inset-[1px] rounded-full"
          style={{ background: core, boxShadow: `0 0 3px 0.5px ${halo}` }}
        />
      </span>
    </Tooltip>
  );
}
