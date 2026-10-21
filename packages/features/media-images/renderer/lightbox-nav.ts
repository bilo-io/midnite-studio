/**
 * Lightbox stepping with wrap-around: → past the last image lands on the
 * first, ← before the first lands on the last. `null` when there is nothing.
 */
export function stepIndex(index: number, delta: number, length: number): number | null {
  if (length <= 0) return null;
  return (((index + delta) % length) + length) % length;
}

/** `3/40` — one-based, as a person counts. */
export function positionLabel(index: number, length: number): string {
  return `${index + 1}/${length}`;
}
