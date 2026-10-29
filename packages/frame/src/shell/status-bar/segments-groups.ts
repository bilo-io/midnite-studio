/**
 * Group boundaries and the separators drawn at them (Phase 39 Theme B).
 *
 * Two pure functions, one for each half of a problem that cannot be solved in
 * one place:
 *
 * 1. `withSeparators` says where a separator *belongs* — between two adjacent
 *    segments whose `group` differs. That is knowable from the registry alone.
 * 2. `strandedSeparators` says which of those separators must not *render* —
 *    knowable only from the DOM, because a status-bar segment reports "nothing
 *    to say" by returning `null`, and whether it did so depends on its own
 *    hooks. The common first-run case is real and not hypothetical: the
 *    `health` group has exactly one member and `DiagnosticsSegment` returns
 *    `null` for a repository nobody has measured yet, so a fresh install would
 *    otherwise draw two separators around nothing.
 *
 * The alternative considered was having a group declare `collapsible: true` and
 * render its own leading separator. Rejected: it makes correctness a property
 * of every future segment author remembering to declare it, and the DOM already
 * knows the answer. A segment that renders `null` produces **no element at
 * all**, so a zone's live `children` list is already the exact record of what
 * rendered — no wrapper element is needed to find out, which matters because
 * `status-bar.tsx`'s header comment records that wrapping a segment costs a
 * `gap-3` slot whether or not it drew anything.
 */
import type { StatusSegment } from './segments';

export type RenderItem =
  | { kind: 'segment'; segment: StatusSegment }
  | { kind: 'separator'; id: string };

/**
 * Interleave separators at group boundaries.
 *
 * Assumes each group's segments are contiguous in the input — `segments.test.ts`
 * asserts that of the registry, because a group that resumes after another
 * group's segment would produce two separators for one logical break.
 */
export function withSeparators(segments: readonly StatusSegment[]): RenderItem[] {
  const out: RenderItem[] = [];
  segments.forEach((segment, i) => {
    const previous = segments[i - 1];
    if (previous && previous.group !== segment.group) {
      out.push({ kind: 'separator', id: `sep-${previous.group}-${segment.group}` });
    }
    out.push({ kind: 'segment', segment });
  });
  return out;
}

/** What a zone's live DOM children turned out to be, in order. */
export type RenderedKind = 'segment' | 'separator';

/**
 * Which separator indices must be hidden, given what actually rendered.
 *
 * A separator earns its pixel only when it has a rendered segment on *both*
 * sides. Three cases fall out of that one rule and all three are real:
 *
 * - **Leading** — every segment before it returned `null`.
 * - **Trailing** — every segment after it returned `null`.
 * - **Doubled** — an entire group in the middle returned `null`, leaving two
 *   separators adjacent. Only the first survives, so the two neighbouring
 *   groups still read as separated.
 */
export function strandedSeparators(kinds: readonly RenderedKind[]): Set<number> {
  const hidden = new Set<number>();
  /** A rendered segment has been seen since the last separator we kept. */
  let segmentPending = false;

  for (let i = 0; i < kinds.length; i += 1) {
    if (kinds[i] === 'segment') {
      segmentPending = true;
      continue;
    }
    // Nothing to separate from: leading, or the second of a doubled pair.
    if (!segmentPending) {
      hidden.add(i);
      continue;
    }
    // Nothing to separate *to*: trailing.
    if (!kinds.slice(i + 1).includes('segment')) {
      hidden.add(i);
      continue;
    }
    segmentPending = false;
  }

  return hidden;
}
