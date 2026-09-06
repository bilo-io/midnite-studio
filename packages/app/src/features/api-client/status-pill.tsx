/**
 * An HTTP response status, coloured by class — 2xx green, 3xx blue, 4xx
 * amber, 5xx red (Phase 66 Theme F).
 *
 * Local to `features/api-client/`, not `features/forge/forge-status.tsx`'s
 * `StatusPill` (Decision 3): that one speaks CI/PR vocabulary (`ForgeStatus`,
 * `conclusion`); this one speaks a bare numeric status code, and coercing an
 * HTTP response into a `ForgeStatus` would be a translation layer for no
 * shared behaviour.
 */
function toneFor(status: number): string {
  if (status >= 200 && status < 300) return 'bg-success/15 text-success';
  if (status >= 300 && status < 400) return 'bg-sky-500/15 text-sky-500';
  if (status >= 400 && status < 500) return 'bg-amber-500/15 text-amber-500';
  if (status >= 500) return 'bg-destructive/15 text-destructive';
  return 'bg-muted text-muted-foreground';
}

export function StatusPill({ status, className = '' }: { status: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[11px] font-semibold tabular-nums leading-none ${toneFor(status)} ${className}`}
    >
      {status}
    </span>
  );
}
