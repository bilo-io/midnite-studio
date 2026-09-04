import { useState } from 'react';

import { Spinner } from '../../components/skeleton';
import { useCouncilRun, useStartCouncilRun } from '../councils/use-council-run';

/**
 * "Suggest a resolution" for one region (Phase 47 Theme E) — unchanged
 * `mstudio:council:run-start` underneath (Phase 34), no new IPC.
 *
 * Purely advisory: this never selects, pre-fills, or applies anything on the
 * caller's behalf. The Accept mine/theirs/both buttons Theme D built sit
 * right beside this panel, completely unaffected — the suggestion's only
 * effect is text the user reads before clicking one of them.
 *
 * `startRun` is fire-and-return (`council-runner.ts`'s `startRun` launches
 * every member with `void launchMember(...)` and answers immediately), so
 * progress is polled, not pushed — `useCouncilRun`'s own `refetchInterval`
 * already stops the instant `status` reaches `completed`/`failed`.
 */
export function SuggestResolutionPanel({ councilId, prompt }: { councilId: string; prompt: string }) {
  const [runId, setRunId] = useState<string | null>(null);
  const startRun = useStartCouncilRun();
  const { data: run } = useCouncilRun(runId);

  const suggest = () => {
    startRun.mutate(
      { councilId, prompt },
      { onSuccess: (result) => { if (result.ok) setRunId(result.value.id); } },
    );
  };

  if (runId === null) {
    return (
      <button
        type="button"
        disabled={startRun.isPending}
        onClick={suggest}
        className="rounded border border-border px-1.5 py-0.5 text-[10px] disabled:opacity-40"
      >
        {startRun.isPending ? 'Starting…' : 'Suggest a resolution'}
      </button>
    );
  }

  const busy = !run || run.status === 'running' || run.status === 'synthesizing';
  const failed = run?.status === 'failed';

  return (
    <div data-testid="suggestion-panel" className="my-1 rounded border border-border bg-muted/20 px-2 py-1">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {busy ? <Spinner size="xs" tone="inherit" /> : null}
        Suggestion
      </div>
      {run?.synthesisOutput ? (
        <p className="whitespace-pre-wrap text-xs">{run.synthesisOutput}</p>
      ) : failed ? (
        <p className="text-xs text-destructive">{run?.synthesisError ?? 'The council run failed.'}</p>
      ) : busy ? (
        <p className="text-xs text-muted-foreground">Thinking…</p>
      ) : null}
    </div>
  );
}
