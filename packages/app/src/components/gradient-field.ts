/**
 * Shared Tailwind classes for the text half of a `.gradient-border`-wrapped
 * field — the treatment `repos-panel.tsx`'s repo filter box set (a conic-ring
 * wrapper that lights up on `:focus-within`, a borderless `bg-background`
 * fill inside it), and that `status-panel.tsx`'s commit message textarea and
 * `notes-modal.tsx`/`note-row.tsx`'s composer each separately re-typed.
 *
 * A constant rather than a component: every caller's own padding, text size
 * and resize behaviour differ enough (an `<input>` with icon gutters vs. an
 * autogrowing `<textarea>`) that wrapping them in one component would just
 * grow a prop for each difference. What actually has to match — and drifts
 * quietly when hand-copied — is the field's own visual contract: no border of
 * its own (the ring lives on the `.gradient-border` wrapper), the same
 * background and radius as that wrapper, and the placeholder colour. This is
 * that contract, appended to with each caller's specific padding/size/resize
 * classes.
 *
 * Usage: `<div className="gradient-border rounded-md"><input
 * className={`${GRADIENT_FIELD_CLASSES} h-7 pl-7 pr-7 text-xs`} /></div>` —
 * see `companion-input-bar.tsx` for a `<textarea>` consumer.
 */
export const GRADIENT_FIELD_CLASSES =
  'w-full rounded-md border-0 bg-background outline-none placeholder:text-muted-foreground';
