import type { CSSProperties, ReactNode } from 'react';

/**
 * The two marks this app uses to say "not yet", and the wrapper that makes
 * either of them audible.
 *
 * **Which one, and when.** A skeleton stands in for content that is not on
 * screen yet and whose shape is already known — a PR list, a diff, a
 * conversation. A spinner belongs where content IS on screen and something is
 * happening to it: a refetch behind a list that still shows the last answer, a
 * write in flight. Using a spinner for the first case throws away everything
 * the layout already knows and makes an empty pane out of a predictable one;
 * using a skeleton for the second replaces good data with grey bars.
 *
 * **Neither one is a claim.** A skeleton says "measuring", not "there are four
 * of these" — the counts here are chosen to fill the pane, never read off a
 * payload that has not arrived. Anything the app can actually assert (an empty
 * list, a signed-out CLI, an error) is prose, and every caller checks for those
 * BEFORE reaching for a skeleton. That ordering is the whole reason a reader
 * can trust a grey bar to mean "still asking" rather than "nothing here".
 *
 * **Reduced motion needs no guard here.** The shell's appearance layer stops
 * every animation under `html[data-motion='reduced']` with
 * `animation-fill-mode: forwards`, and `animate-pulse` ends its cycle at full
 * opacity — so bars settle visible and still rather than disappearing. A local
 * `motion-reduce:` variant would only be a second, weaker copy of that rule.
 * `applyMotion` in `app.tsx` is what resolves the OS preference into the
 * attribute.
 */

/**
 * One shimmering bar.
 *
 * No intrinsic size: every caller sets height and width, because the point of a
 * skeleton is to be the shape of the thing it replaces. `bg-muted` rather than
 * a border keeps it a mass rather than an outline — an outlined box reads as a
 * real, empty container.
 */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div style={style} className={`animate-pulse rounded bg-muted ${className}`} />;
}

/**
 * A half ring, sweeping.
 *
 * Borders rather than an SVG or a glyph: at this size a stroked arc is a
 * couple of `border-*` colours on a circle, and rotating a bordered box is a
 * compositor-only transform where an animated icon component is a React tree
 * that re-renders.
 *
 * What the geometry has to earn, though, is legibility of the MOTION, and the
 * first cut — 12px, `border-[1.5px]`, one lit quadrant — did not, when this
 * was still the terminal's own duplicate of this mark. The lit part came out as a
 * lone ~8px dash one device pixel thick (Chromium floors a 1.5px border to
 * 1px below 2× scale), and one small dash going round once a second, in a
 * sidebar nobody is looking straight at, reads as a ring that is simply
 * sitting there. Measured before touching it, frame by frame off a paused
 * animation: the rotation was running the whole time and could not be seen.
 *
 * So 14px, a 2px rim, and two adjacent borders lit rather than one — a half
 * ring sweeping, which is unmistakably moving at a glance and is still the
 * same mark. Duration stays Tailwind's own 1s: `animate-spin` is the only
 * animation here that does not need a keyframe of its own, and inventing one
 * to shave 100ms off would make the mark depend on a `@keyframes spin` that
 * Tailwind only emits while some other file still uses the built-in utility.
 * The terminal's session list uses this one directly now rather than a
 * byte-identical duplicate of its own.
 *
 * `label` is for a spinner that stands alone. Beside text that already says
 * what is happening ("Posting…"), leave it off — the default is `aria-hidden`,
 * because a screen reader announcing "Loading" next to the word "Posting" is
 * the same news twice.
 *
 * `size` and `tone` are props rather than something a caller layers on through
 * `className`, because both would be overriding a utility this component
 * already emits — `size-3.5` against a passed `size-4`, `border-r-foreground`
 * against a passed `border-r-current` — and which of two conflicting Tailwind
 * utilities wins is decided by their order in the generated stylesheet, not by
 * their order in the class string. So an override that looks right in the JSX
 * lands as a coin flip. The rim stays 2px at every size for the reason above:
 * it is what makes the sweep visible at all.
 *
 * `tone: 'inherit'` lights the two sweeping borders with `currentColor`
 * instead of `--foreground`, which is what a spinner standing in for an icon
 * inside a button wants — the mark then takes the button's own tint (muted at
 * rest, `--primary` on a `brand` control) exactly as the icon it replaced did.
 * Only the lit borders move; the dim track stays `--muted-foreground/25`,
 * because Tailwind v3 cannot put an alpha on `currentColor` — there is no
 * `<alpha-value>` placeholder to substitute into — so `border-current/25`
 * would silently emit nothing.
 */
export function Spinner({
  className = '',
  label,
  size = 'sm',
  tone = 'default',
}: {
  className?: string;
  label?: string;
  size?: 'xs' | 'sm' | 'md';
  tone?: 'default' | 'inherit';
}) {
  const box = size === 'xs' ? 'size-3' : size === 'md' ? 'size-4' : 'size-3.5';
  const rim =
    tone === 'inherit'
      ? 'border-muted-foreground/25 border-r-current border-t-current'
      : 'border-muted-foreground/25 border-r-foreground border-t-foreground';
  return (
    <span
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined || undefined}
      className={`inline-block ${box} shrink-0 animate-spin rounded-full border-2 ${rim} ${className}`}
    />
  );
}

/**
 * A skeleton, with the sentence it replaced kept for anyone not looking at it.
 *
 * The bars are decoration — `aria-hidden`, because "div div div" is worse than
 * silence. The prose the placeholder used to show moves into an `sr-only`
 * status instead, so a screen reader still hears "Reading the diff…" and the
 * live region announces it when it appears. Every skeleton in the app goes
 * through here rather than each one remembering to do this.
 *
 * The hiding wrapper is `display: contents` so that it hides the subtree
 * without also standing in the middle of it: several of these skeletons are
 * flex columns that have to fill a pane, and an ordinary `<div>` between the
 * region and its bars is a layout box that swallows `flex-1` and leaves the
 * skeleton sitting at its content height.
 */
export function LoadingRegion({
  label,
  className = '',
  children,
}: {
  /** What is being waited for, as a sentence. Heard, not seen. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}
