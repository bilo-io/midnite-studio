import type { ReactNode } from 'react';

import { LuX } from 'react-icons/lu';

const BANNER_TONE = {
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  red: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
} as const;

export function Banner({ tone, children }: { tone: keyof typeof BANNER_TONE; children: ReactNode }) {
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={`mb-4 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${BANNER_TONE[tone]}`}>
      {children}
    </div>
  );
}

/**
 * A failed op, inline under the control that sent it. `locked-period` adds the lock date and a way to the
 * book's settings.
 */
export function ErrorLine({
  error,
  lockedThrough,
  onOpenSettings,
}: {
  error: { kind: string; message: string } | null;
  lockedThrough?: string | null;
  onOpenSettings?: () => void;
}) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
      {error.message}
      {error.kind === 'locked-period' ? (
        <>
          {' '}
          Books are locked through {lockedThrough ?? 'a later date'}.{' '}
          {onOpenSettings ? (
            <button type="button" className="underline" onClick={onOpenSettings}>
              Book settings
            </button>
          ) : null}
        </>
      ) : null}
    </p>
  );
}

/** A side sheet over the view. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div role="dialog" aria-modal="true" aria-label={title} className="flex h-full w-full max-w-lg flex-col gap-4 overflow-auto border-l border-border bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <LuX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const INPUT = 'w-full rounded-md border border-border bg-background px-2 py-1 text-sm aria-[invalid=true]:border-red-500';
export const BUTTON = 'rounded-md border border-border px-3 py-1 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
export const PRIMARY = 'rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
