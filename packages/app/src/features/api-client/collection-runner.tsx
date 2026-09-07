import { useEffect, useMemo, useState } from 'react';

import type { ApiRunItemResult, ApiRunTarget, PostmanItem } from '@midnite/studio-shared';
import {
  LuCircleCheck,
  LuCircleX,
  LuLoaderCircle,
  LuMinus,
  LuOctagonMinus,
  LuPlay,
  LuShieldAlert,
} from 'react-icons/lu';

import { bridge } from '../../services/bridge';
import { useApiClientStore, type ApiRunState } from '../../store/api-client-store';
import { AssertionRows } from './test-results-panel';
import { EnvironmentSwitcher } from './environment-switcher';
import { MethodBadge } from './method-badge';
import { StatusPill } from './status-pill';

const WHOLE_COLLECTION = '__collection__';

/** Every folder in `items`, root-first, as the `path` `ApiRunTarget`'s
 *  `folder` arm addresses it — the same folder-name path
 *  `collection-tree.tsx`'s own walk builds for a tab's `itemPath`. */
function collectFolderPaths(items: readonly PostmanItem[], prefix: string[] = []): string[][] {
  const out: string[][] = [];
  for (const item of items) {
    if (item.item) {
      const path = [...prefix, item.name];
      out.push(path);
      out.push(...collectFolderPaths(item.item, path));
    }
  }
  return out;
}

function targetFromKey(key: string): ApiRunTarget {
  return key === WHOLE_COLLECTION ? { kind: 'collection' } : { kind: 'folder', path: JSON.parse(key) as string[] };
}

function StatusGlyph({ status }: { status: ApiRunItemResult['status'] }) {
  if (status === 'passed') return <LuCircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />;
  if (status === 'skipped') return <LuMinus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
  return <LuCircleX className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />;
}

/** The header strip over the per-request list — live counts while running
 *  (derived from `items`, since a partial run has no `ApiRunSummary` yet),
 *  the settled `ApiRunSummary` once `done`. */
function RunSummaryStrip({ run }: { run: Extract<ApiRunState, { status: 'running' | 'done' }> }) {
  const total = run.status === 'done' ? run.summary.total : run.total;
  const items = run.items.filter((item): item is ApiRunItemResult => item !== undefined);
  const passed = run.status === 'done' ? run.summary.passed : items.filter((i) => i.status === 'passed').length;
  const failed =
    run.status === 'done' ? run.summary.failed : items.filter((i) => i.status === 'failed' || i.status === 'error').length;
  const skipped = run.status === 'done' ? run.summary.skipped : 0;
  const completed = run.status === 'done' ? run.summary.completed : items.length;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-2 py-1.5 text-[11px] tabular-nums text-muted-foreground">
      <span>
        {completed}/{total}
      </span>
      <span className="text-emerald-500">{passed} passed</span>
      <span className="text-destructive">{failed} failed</span>
      {skipped > 0 ? <span>{skipped} skipped</span> : null}
      {run.status === 'done' ? <span>{Math.round(run.summary.durationMs)}ms</span> : null}
      {run.status === 'done' && run.summary.aborted ? <span className="text-amber-500">Aborted</span> : null}
    </div>
  );
}

function RunConsentBar({
  repoId,
  collectionId,
  target,
}: {
  repoId: string;
  collectionId: string;
  target: ApiRunTarget;
}) {
  const startRun = useApiClientStore((s) => s.startRun);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-3 py-2 text-xs">
      <LuShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1">This collection contains scripts. Run them?</span>
      <button
        type="button"
        onClick={() => void startRun(repoId, collectionId, target, true)}
        className="rounded border border-border px-2 py-1 font-medium transition-colors hover:bg-accent"
      >
        Run once
      </button>
      <button
        type="button"
        onClick={() => {
          void bridge()
            ?.apiClient.setScriptTrust({ repoId, collectionId, trusted: true })
            .then((result) => {
              if (result.ok) void startRun(repoId, collectionId, target);
            });
        }}
        className="rounded bg-primary px-2 py-1 font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        Always for this collection
      </button>
      <button
        type="button"
        onClick={() => {
          void bridge()?.apiClient.setScriptTrust({ repoId, collectionId, trusted: false });
          useApiClientStore.setState((state) => ({
            runs: { ...state.runs, [collectionId]: { status: 'declined' } },
          }));
        }}
        className="rounded border border-border px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent"
      >
        Never
      </button>
    </div>
  );
}

function RunItemDetail({ item }: { item: ApiRunItemResult }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <MethodBadge method={item.method} />
        <span className="min-w-0 flex-1 truncate font-medium">{item.itemPath.join(' / ')}</span>
        {item.response ? <StatusPill status={item.response.status} /> : null}
        <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(item.durationMs)}ms</span>
      </div>

      {item.status === 'skipped' ? (
        <p className="p-3 text-xs text-muted-foreground">Never ran — the run was stopped before this request.</p>
      ) : (
        <>
          {item.response ? (
            <pre className="max-h-64 shrink-0 overflow-auto whitespace-pre-wrap break-words border-b border-border bg-accent/20 px-3 py-2 font-mono text-[11px]">
              {item.response.body || '(empty body)'}
            </pre>
          ) : null}
          <AssertionRows results={item.assertions} error={item.error} />
        </>
      )}
    </div>
  );
}

/**
 * The collection runner (Phase 70 Theme C) — a target picker (whole
 * collection, or one folder), Theme A's environment picker, a Run/Stop
 * button, and a results pane, laid out like `actions-view.tsx`'s
 * list-plus-detail split: a per-request list on the left, one request's
 * response and assertions (reusing `AssertionRows`, Theme B's own) on the
 * right.
 *
 * Owns the `apiRunProgress`/`apiRunDone` subscription for as long as it is
 * mounted — a run keeps going in main even if this view is closed mid-run
 * (nothing here cancels it on unmount), but this component stops rendering
 * updates for it, exactly as `db`'s query stream would for a closed tab.
 */
export function CollectionRunner({ repoId, collectionId }: { repoId: string; collectionId: string }) {
  const summary = useApiClientStore((s) => s.collections.find((c) => c.id === collectionId));
  const run = useApiClientStore((s) => s.runs[collectionId]) ?? { status: 'idle' as const };
  const startRun = useApiClientStore((s) => s.startRun);
  const stopRun = useApiClientStore((s) => s.stopRun);
  const applyRunProgress = useApiClientStore((s) => s.applyRunProgress);
  const applyRunDone = useApiClientStore((s) => s.applyRunDone);

  const [targetKey, setTargetKey] = useState<string>(WHOLE_COLLECTION);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const folderPaths = useMemo(
    () => (summary ? collectFolderPaths(summary.collection.item) : []),
    [summary],
  );

  useEffect(() => {
    const api = bridge();
    if (!api) return;
    const offProgress = api.apiClient.onRunProgress(applyRunProgress);
    const offDone = api.apiClient.onRunDone(applyRunDone);
    return () => {
      offProgress();
      offDone();
    };
  }, [applyRunProgress, applyRunDone]);

  if (!summary) return null;

  const target = targetFromKey(targetKey);
  const items = run.status === 'running' || run.status === 'done' ? run.items : [];
  const running = run.status === 'running';
  const selected = selectedIndex !== null ? items[selectedIndex] : undefined;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 w-72 shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 flex-col gap-2 border-b border-border p-2">
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Run {summary.collection.info.name}
          </h2>

          <select
            value={targetKey}
            onChange={(event) => setTargetKey(event.target.value)}
            disabled={running}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-60"
          >
            <option value={WHOLE_COLLECTION}>Whole collection</option>
            {folderPaths.map((path) => (
              <option key={path.join('/')} value={JSON.stringify(path)}>
                {path.join(' / ')}
              </option>
            ))}
          </select>

          <EnvironmentSwitcher repoId={repoId} />

          {running ? (
            <button
              type="button"
              onClick={() => stopRun(collectionId)}
              className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              <LuOctagonMinus className="h-3.5 w-3.5" aria-hidden />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRun(repoId, collectionId, target)}
              className="flex h-7 items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              <LuPlay className="h-3.5 w-3.5" aria-hidden />
              Run
            </button>
          )}
        </div>

        {run.status === 'running' || run.status === 'done' ? <RunSummaryStrip run={run} /> : null}
        {run.status === 'needs-consent' ? (
          <RunConsentBar repoId={repoId} collectionId={collectionId} target={target} />
        ) : null}
        {run.status === 'declined' ? (
          <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            Scripts won't run for this collection.
          </p>
        ) : null}
        {run.status === 'error' ? (
          <p className="border-b border-border px-3 py-2 text-xs text-destructive">{run.message}</p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {running && items.length === 0 ? (
            <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
              <LuLoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
              Starting…
            </p>
          ) : null}
          {items.map((item, index) =>
            item ? (
              <button
                key={`${item.itemPath.join('/')}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left text-xs transition-colors ${
                  selectedIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <StatusGlyph status={item.status} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground/70">
                  {Math.round(item.durationMs)}ms
                </span>
              </button>
            ) : null,
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {selected ? (
          <RunItemDetail item={selected} />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <p className="max-w-md text-center text-sm text-muted-foreground">
              Run the collection, then pick a request to see its response and assertions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
