import type { ReactNode } from 'react';

/**
 * A number (or a short figure like "1st") set in a subtle pill tinted with the
 * accent colour: low-alpha `--primary` fill, `--primary` text. Tinting by alpha
 * rather than a fixed colour is what keeps it legible in both themes.
 */
export function StatPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-primary/15 px-1 py-px font-medium tabular-nums leading-none text-primary">
      {children}
    </span>
  );
}
