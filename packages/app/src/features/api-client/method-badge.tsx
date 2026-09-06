/**
 * A fixed colour per HTTP verb — GET green, POST blue, PUT amber, PATCH
 * violet, DELETE red, everything else muted (Phase 66 Theme C).
 *
 * Local to `features/api-client/`, not lifted to `components/` (Decision 3):
 * nothing outside this view has any use for a verb-coloured chip.
 *
 * Colours are `@bilo-io/ui`'s tokens (`--success`/`--destructive`) plus three
 * plain Tailwind hues for the verbs the design system has no token for — the
 * same mix `features/forge/forge-status.tsx` already uses for its own
 * tone palette, so a `StudioPalette` change that reflows `--success` reflows
 * GET's green with it.
 */
const METHOD_CLASS: Record<string, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-sky-500/15 text-sky-500',
  PUT: 'bg-amber-500/15 text-amber-500',
  PATCH: 'bg-violet-500/15 text-violet-500',
  DELETE: 'bg-destructive/15 text-destructive',
};

const DEFAULT_CLASS = 'bg-muted text-muted-foreground';

export function MethodBadge({ method, className = '' }: { method: string; className?: string }) {
  const upper = method.toUpperCase();
  const tone = METHOD_CLASS[upper] ?? DEFAULT_CLASS;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1 py-px text-[10px] font-semibold tabular-nums leading-none ${tone} ${className}`}
    >
      {upper}
    </span>
  );
}
