/**
 * A legend entry that is also a filter.
 *
 * The Storage tab used to carry two plain dot-and-label legends under its
 * bars. They named exactly the axes a user wants to narrow by, so they are
 * now the control rather than a caption of one — same swatch, same order,
 * same wording, now a pressable pill.
 *
 * Selection is `aria-pressed`, not a checkbox: these are toggles over a view,
 * and nothing here is submitted. With nothing pressed every pill sits at rest
 * (an empty selection means "everything", not "nothing"); once anything is
 * pressed the rest dim, so the answer to "what am I looking at" is legible
 * without reading the labels.
 */
export function FilterPill({
  color,
  label,
  detail,
  selected,
  dimmed,
  onToggle,
}: {
  /** The axis swatch — `categoryColor` / `ecosystemColor`. */
  color: string;
  label: string;
  /** Byte total, count, whatever the caller's axis makes sense to show. */
  detail?: string;
  selected: boolean;
  /** Something else is selected and this is not it. */
  dimmed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {/*
        Dimming the swatch, not the whole pill: `opacity` over
        `text-muted-foreground` drops the label under 3:1 on the light ground,
        and the state being shown is "not part of the current selection",
        which the colour dot carries perfectly well on its own.
      */}
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full transition-opacity"
        style={{ backgroundColor: color, opacity: dimmed ? 0.3 : 1 }}
      />
      {label}
      {detail ? <span className="tabular-nums text-[10px] opacity-70">{detail}</span> : null}
    </button>
  );
}
