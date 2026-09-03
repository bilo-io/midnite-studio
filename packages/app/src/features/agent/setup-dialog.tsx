import { useEffect, useRef, useState } from 'react';

import { LuLoaderCircle } from 'react-icons/lu';

import type { ScaffoldApplyResult, ScaffoldEntry, ScaffoldPlan, ScaffoldStatus } from '@midnite/studio-shared';

import { useFocusTrap } from '../../components/use-focus-trap';
import { bridge } from '../../services/bridge';

/**
 * The onboarding kit's preview-then-apply modal (Phase 49 Theme D).
 *
 * A modal preview, not a dedicated view — the scope guardrail the phase doc
 * states directly: "the preview is a modal, and a dedicated ViewId with
 * per-file checkboxes is a later phase's idea if it is anyone's." There is no
 * per-file selection here either, for the same reason: Apply writes every
 * `create`/`stale` entry the plan found, and a `locally-edited` one is never
 * offered an override — it is shown, and excluded, and that is the whole
 * story for that row.
 *
 * Reuses the app's existing dialog shell (`ConfirmDialog`'s own overlay/focus
 * trap/button conventions) rather than a new one — the phase doc's "no new
 * modal system" — but not `ConfirmDialog` itself: its `body`/`warnings` props
 * cannot express a grouped, counted file list, and forcing this content
 * through them would be the second modal shape the doc rules out, wearing
 * the first one's name.
 */

type Phase = 'loading' | 'ready' | 'applying' | 'done' | 'error';

const STATUS_LABEL: Record<ScaffoldStatus, string> = {
  create: 'New',
  unchanged: 'Already up to date',
  stale: 'Will be updated',
  'locally-edited': 'Locally edited — will not be written',
};

const STATUS_ORDER: readonly ScaffoldStatus[] = ['create', 'stale', 'locally-edited', 'unchanged'];

function groupByStatus(entries: readonly ScaffoldEntry[]): { status: ScaffoldStatus; group: ScaffoldEntry[] }[] {
  return STATUS_ORDER.map((status) => ({
    status,
    group: entries.filter((e) => e.status === status),
  })).filter(({ group }) => group.length > 0);
}

export function SetupDialog({
  repoId,
  repoName,
  hasExistingKit,
  onClose,
}: {
  repoId: string;
  repoName: string;
  /** Drives the title/button wording — "Set up" vs. "Update onboarding kit". */
  hasExistingKit: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<ScaffoldPlan | null>(null);
  const [result, setResult] = useState<ScaffoldApplyResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('Something went wrong.');
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true);

  useEffect(() => {
    let cancelled = false;
    const api = bridge();
    if (!api) {
      setErrorMessage('No connection to the app.');
      setPhase('error');
      return;
    }
    void api.scaffold.plan({ repoId }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setPlan(res.value);
        setPhase('ready');
      } else {
        setErrorMessage(res.kind === 'error' ? res.message : 'Could not read the template.');
        setPhase('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  const apply = async () => {
    if (!plan) return;
    const api = bridge();
    if (!api) return;
    const paths = plan.entries
      .filter((e) => e.status === 'create' || e.status === 'stale')
      .map((e) => e.path);
    setPhase('applying');
    const res = await api.scaffold.apply({ repoId, paths });
    if (res.ok) {
      setResult(res.value);
      setPhase('done');
    } else {
      setErrorMessage(res.kind === 'error' ? res.message : 'Could not write the onboarding kit.');
      setPhase('error');
    }
  };

  const title = hasExistingKit ? 'Update onboarding kit' : 'Set up this repo';
  const refusedCount = plan?.entries.filter((e) => e.status === 'locally-edited').length ?? 0;

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
      >
        <div className="shrink-0 border-b border-border p-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{repoName}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {phase === 'loading' ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LuLoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
              Reading the template…
            </p>
          ) : null}

          {phase === 'error' ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          {(phase === 'ready' || phase === 'applying') && plan ? (
            <>
              <p className="text-xs text-muted-foreground">
                Template {plan.templateVersion}
                {refusedCount > 0
                  ? ` — ${refusedCount} file${refusedCount === 1 ? '' : 's'} locally edited, excluded from the write.`
                  : ''}
              </p>
              <div className="mt-3 space-y-3">
                {groupByStatus(plan.entries).map(({ status, group }) => (
                  <div key={status}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {STATUS_LABEL[status]} ({group.length})
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {group.map((entry) => (
                        <li key={entry.path} className="truncate font-mono text-xs text-muted-foreground">
                          {entry.path}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {phase === 'done' && result ? (
            <div className="space-y-1 text-sm">
              <p>{result.written.length} written.</p>
              {result.skipped.length > 0 ? (
                <>
                  <p className="text-destructive">{result.skipped.length} skipped:</p>
                  <ul className="space-y-0.5">
                    {result.skipped.map((s) => (
                      <li key={s.path} className="text-xs text-muted-foreground">
                        <span className="font-mono">{s.path}</span> — {s.reason}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {refusedCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {refusedCount} refused (locally edited).
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {phase === 'done' ? 'Close' : 'Cancel'}
          </button>
          {phase === 'ready' ? (
            <button
              type="button"
              onClick={() => void apply()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Apply
            </button>
          ) : null}
          {phase === 'applying' ? (
            <button
              type="button"
              disabled
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground opacity-40"
            >
              Applying…
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
