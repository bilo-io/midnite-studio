import { bridge, useFrameChrome } from '@midnite/studio-frame';
import { guardFixPrompt, REMEDIATION_ACTION_LABEL, REMEDIATION_PENDING, REMEDIATION_UNCONFIRMED, type RemediationAction, type SecurityFinding } from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';

import {
  categoriesOf,
  DEFAULT_GUARD_FILTER,
  filterGuardFindings,
  groupBySeverity,
  isNewSinceLastSweep,
  type GuardFindingFilter,
} from './guard-findings-model';

/**
 * The Guard tab's findings (Phase 122 Theme G): what the last sweep found, worst first, with the actions each
 * finding offers. Read from the shared ledger through the bridge (the same channel Vanguard's view reads, which
 * owns the full ledger); nothing here imports the Vanguard feature. An action runs behind the same preview and
 * confirm Vanguard uses, and one the app cannot run yet says why instead of failing.
 */


function useGuardFindings(): { findings: SecurityFinding[]; loaded: boolean } {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const refetch = (): void => {
      void bridge()
        ?.vanguard.findings.list({ source: 'guard' })
        .then((r) => {
          if (!live) return;
          setFindings(r.findings);
          setLoaded(true);
        })
        .catch(() => undefined);
    };
    refetch();
    const off = bridge()?.vanguard.findings.onChanged(refetch);
    return () => {
      live = false;
      off?.();
    };
  }, []);
  return { findings, loaded };
}

export function GuardFindings() {
  const { findings, loaded } = useGuardFindings();
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<GuardFindingFilter>(DEFAULT_GUARD_FILTER);
  const visible = useMemo(() => filterGuardFindings(findings, filter), [findings, filter]);
  const groups = useMemo(() => groupBySeverity(visible), [visible]);
  const categories = useMemo(() => categoriesOf(findings), [findings]);

  return (
    <div className="shrink-0 border-b border-border" data-testid="guard-findings">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <LuChevronDown aria-hidden className="h-3 w-3" /> : <LuChevronRight aria-hidden className="h-3 w-3" />}
        Findings ({visible.length})
      </button>
      {open ? (
        <div className="px-2 pb-2">
          <div className="mb-1 flex gap-1 text-[10px]">
            <select
              aria-label="Filter by category"
              value={filter.category}
              onChange={(e) => setFilter({ ...filter, category: e.target.value as GuardFindingFilter['category'] })}
              className="rounded border border-border bg-transparent px-1 py-0.5"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value as GuardFindingFilter['status'] })}
              className="rounded border border-border bg-transparent px-1 py-0.5"
            >
              <option value="open">Open</option>
              <option value="all">All</option>
            </select>
          </div>
          {!loaded ? null : groups.length === 0 ? (
            <p className="py-1 text-[11px] text-muted-foreground">No findings from the last sweep.</p>
          ) : (
            groups.map((g) => (
              <section key={g.severity} aria-label={`${g.severity} findings`}>
                <h4 className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {g.severity} ({g.findings.length})
                </h4>
                {g.findings.map((f) => (
                  <FindingRow key={f.id} finding={f} />
                ))}
              </section>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function FindingRow({ finding }: { finding: SecurityFinding }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dialogs = useFrameChrome().useDialogs();

  const act = useCallback(
    async (action: RemediationAction, confirmed?: string): Promise<void> => {
      const result = await bridge()?.vanguard.findings.act({ findingId: finding.id, action, ...(confirmed ? { confirmed } : {}) });
      if (!result) return;
      if (!result.ok) setMessage('message' in result && typeof result.message === 'string' ? result.message : 'That did not go through.');
      else setMessage(result.value.unavailable?.reason ?? result.value.detail ?? null);
    },
    [finding.id],
  );

  const run = useCallback(
    async (action: RemediationAction): Promise<void> => {
      setMessage(null);
      if (action.id === 'copy-fix-command') {
        await navigator.clipboard?.writeText(action.command).catch(() => undefined);
        setMessage('Copied. Run it in a terminal.');
        return;
      }
      const pending = REMEDIATION_PENDING[action.id];
      if (pending) {
        setMessage(pending.reason);
        return;
      }
      if (REMEDIATION_UNCONFIRMED.has(action.id)) return act(action);
      const preview = await bridge()?.vanguard.findings.preview({ findingId: finding.id, action });
      if (!preview) return;
      if (!preview.ok) {
        setMessage('message' in preview && typeof preview.message === 'string' ? preview.message : 'That did not go through.');
        return;
      }
      const radius = preview.value;
      if (radius.unavailable) {
        setMessage(radius.unavailable.reason);
        return;
      }
      dialogs.confirm({
        title: radius.title,
        body: radius.summary,
        confirmLabel: radius.confirmLabel,
        danger: true,
        blastRadius: null,
        warnings: [...radius.dies.map((l) => `Stops: ${l}`), ...radius.moves.map((l) => `Moves: ${l}`), ...radius.pauses.map((l) => `Pauses: ${l}`), ...radius.warnings],
        onConfirm: () => void act(action, radius.digest),
      });
    },
    [act, dialogs, finding.id],
  );

  return (
    <div className="border-t border-border/50 py-1 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="shrink-0 rounded bg-muted px-1 text-[9px]">{finding.category}</span>
        <span className="min-w-0 flex-1 truncate">{finding.title}</span>
        {isNewSinceLastSweep(finding) ? <span className="shrink-0 rounded bg-primary/15 px-1 text-[9px] text-primary">new</span> : null}
        {finding.count > 1 ? <span className="shrink-0 font-mono">x{finding.count}</span> : null}
      </button>
      {open ? (
        <div className="mt-1 space-y-1 rounded bg-muted/50 p-1.5 text-[10px] text-muted-foreground">
          <p className="break-words">{finding.detail}</p>
          {finding.evidence.length > 0 ? (
            <ul className="font-mono">
              {finding.evidence.map((e, i) => (
                <li key={i} className="break-all">
                  {e.kind === 'path' ? e.path : e.kind === 'host' ? `${e.host}${e.port ? `:${e.port}` : ''}` : e.kind === 'pid' ? `pid ${e.pid} ${e.command ?? ''}` : e.kind === 'command' ? [e.command, ...(e.args ?? [])].join(' ') : `${e.algorithm} ${e.value}`}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {finding.remediation.map((a, i) => (
              <button key={i} type="button" onClick={() => void run(a)} className="rounded border border-border px-1.5 py-0.5 hover:text-foreground">
                {REMEDIATION_ACTION_LABEL[a.id]}
              </button>
            ))}
            <button
              type="button"
              title={guardFixPrompt(finding).slice(0, 200)}
              onClick={() => void navigator.clipboard?.writeText(guardFixPrompt(finding)).then(() => setMessage('Prompt copied: paste it into a Guard run with Report only off.'))}
              className="rounded border border-border px-1.5 py-0.5 hover:text-foreground"
            >
              Copy agent prompt
            </button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
