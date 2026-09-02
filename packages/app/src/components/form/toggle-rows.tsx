/**
 * `SwitchRow`/`RadioRow` (Phase 41 Theme G) — hoisted out of `loop-composer.tsx`,
 * the loop tabs' own settings form, so a second form (the Projects board card
 * composer's agent picker) can draw a mutually-exclusive choice or a standing
 * toggle the same way rather than inventing its own checkbox/select markup.
 * [Phase 43](../../../.midnite/tasks/phases/phase-43-workflows-mvp.md) Theme F
 * plans the same hoist for its own form — whichever lands first does it, the
 * other consumes it.
 *
 * Deliberately generic over `id`/`label`/`title` rather than over
 * `LoopModifier` — that type is a loop-registry concept these two controls
 * never actually needed; `loop-composer.tsx` adapts its modifiers to this
 * shape at the call site instead.
 */

/**
 * A standing policy: in force for the whole run, or not.
 *
 * A real `<input type="checkbox">` under the paint, with `role="switch"` on
 * it — that is the one shape that keeps the label association, the keyboard
 * behaviour and the form semantics while reading as a toggle. The visible
 * track is a sibling styled off `peer-checked`, so no state lives in the DOM
 * twice.
 *
 * Transparent and stretched over the row rather than `sr-only`: the hidden
 * input is still what a click and a Playwright hit-target check land on, and a
 * 1px clipped box in the corner is not something either can hit.
 */
export function SwitchRow({
  id,
  label,
  title,
  on,
  onToggle,
}: {
  id: string;
  label: string;
  title?: string;
  on: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <label
      title={title}
      className="relative flex cursor-pointer items-center justify-between gap-2 text-[11px] text-muted-foreground hover:text-foreground"
    >
      <span className="min-w-0 truncate">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(event) => onToggle(id, event.target.checked)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <SwitchTrack />
    </label>
  );
}

/**
 * The painted half of a switch — a sibling of the real input, driven entirely
 * by `peer-checked`.
 *
 * One component rather than the same 400-character class string written out
 * at each switch, which is what it was: the schedule's copy had already
 * drifted into being maintained separately from the modifier switches' copy,
 * and a track that reads as a different control from the one two rows above
 * it is exactly the drift this composer exists to remove.
 */
export function SwitchTrack() {
  return (
    <span
      aria-hidden
      className="relative h-3.5 w-6 shrink-0 rounded-full bg-muted transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-2.5 after:w-2.5 after:rounded-full after:bg-background after:transition-transform after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-[10px] peer-focus-visible:ring-1 peer-focus-visible:ring-ring"
    />
  );
}

/**
 * A radio group as a wrapping row of pills.
 *
 * The `<input type="radio">` is real and merely transparent — stretched over
 * its pill, so the pill *is* the input's hit target: arrow-key roving, the
 * label association and the accessible name all come free. Segmented rather
 * than stacked because these groups are two or three short words each, and a
 * 320px panel has width to spare where it has no height to.
 *
 * The selected pill is tinted with `loop-spectrum-pill`, the loop tabs' own
 * mid-spectrum accent class. A caller outside that surface (the board card
 * composer) inherits the same tint rather than a second one — one selected
 * look for one control, not a per-surface palette.
 */
export function RadioRow({
  name,
  label,
  hideLabel = false,
  options,
  value,
  onSelect,
}: {
  name: string;
  label: string;
  /**
   * Drop the visible legend, keeping it as the group's accessible name.
   *
   * For the one row whose section heading already says what it is — a "Model"
   * legend under a MODEL heading is the same word twice, and the second one
   * costs a pill's worth of the width it is competing for.
   */
  hideLabel?: boolean;
  options: { id: string; label: string; title?: string | undefined }[];
  value: string;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
    >
      {hideLabel ? null : <span className="text-[11px] text-muted-foreground">{label}</span>}
      <div className="flex flex-wrap items-center gap-1">
        {options.map((option) => {
          const on = option.id === value;
          return (
            <label
              key={option.id}
              title={option.title}
              className={`relative cursor-pointer rounded-full border px-1.5 py-[1px] text-[10px] transition-colors ${
                on
                  ? 'loop-spectrum-pill text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={on}
                onChange={() => onSelect(option.id)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

