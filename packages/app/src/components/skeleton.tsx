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
 * Same construction as the terminal's own thinking mark and for the reason
 * recorded there: two adjacent borders lit rather than one, so the rotation is
 * legible at 14px instead of being a rim that looks static.
 *
 * `label` is for a spinner that stands alone. Beside text that already says
 * what is happening ("Posting…"), leave it off — the default is `aria-hidden`,
 * because a screen reader announcing "Loading" next to the word "Posting" is
 * the same news twice.
 */
export function Spinner({ className = '', label }: { className?: string; label?: string }) {
  return (
    <span
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined || undefined}
      className={`inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/25 border-r-foreground border-t-foreground ${className}`}
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
