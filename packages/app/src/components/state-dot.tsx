/**
 * What the dot can report.
 *
 * Declared here rather than imported from the terminal store: this is the one
 * component under `components/` that would otherwise reach into `features/`,
 * and a shared primitive that depends on a feature is not shared. The store's
 * `ConnectionState` is assignable to it, and the compiler says so at every call
 * site.
 */
export type DotState = 'idle' | 'starting' | 'open' | 'exited' | 'unavailable';

/**
 * Running, or a saved transcript with nothing behind it.
 *
 * A live dot (open or starting) pulses via a `box-shadow` ring in its own
 * colour — `--pulse-a`/`--pulse-b` set inline are the ring's near and far
 * alpha, since a single `box-shadow` cannot itself animate between two
 * rgba()s in a Tailwind keyframe (see `dot-pulse`, tailwind.config.ts).
 *
 * Shared rather than per-surface: the session list and the terminal header both
 * draw this dot for the same session, and two copies of a keyframe plus two
 * CSS variables is exactly the pair that drifts.
 */
export function StateDot({ state }: { state: DotState }) {
  if (state === 'open') return <PulsingDot rgb="16 185 129" className="bg-emerald-500" />;
  if (state === 'starting') return <PulsingDot rgb="245 158 11" className="bg-amber-500" />;
  return <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />;
}

function PulsingDot({ rgb, className }: { rgb: string; className: string }) {
  return (
    <span
      className={`size-1.5 shrink-0 animate-dot-pulse rounded-full ${className}`}
      style={
        {
          '--pulse-a': `rgb(${rgb} / 0.65)`,
          '--pulse-b': `rgb(${rgb} / 0)`,
        } as React.CSSProperties
      }
    />
  );
}
