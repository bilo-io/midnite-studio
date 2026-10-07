import type { GameAssertResult, GamePlaytestEntry, GamePlaytestResult } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuCircleDashed, LuCircleX, LuFlaskConical, LuPlay } from 'react-icons/lu';

import { Popover } from '../../../components/popover';
import { useGamePlaytests, useRunPlaytests } from './use-games';

/**
 * The runner toolbar's **Playtests** menu (Phase 107 Theme O): the game's
 * `playtests/*.json`, each with its last result, a Run per play-test and
 * **Run all**. A run restarts the game in deterministic mode and plays the
 * replay through the kit, so the game view shows the end frame afterwards.
 * Failed assertions list their message and where the screenshot was written.
 */
export function PlaytestsMenu({ gameId }: { gameId: string | null }) {
  const [open, setOpen] = useState(false);
  const list = useGamePlaytests(gameId, open);
  const run = useRunPlaytests();
  const [running, setRunning] = useState<string | null>(null);

  const start = (names?: string[]) => {
    if (!gameId) return;
    setRunning(names?.[0] ?? '*');
    run.mutate({ gameId, ...(names ? { names } : {}) }, { onSettled: () => setRunning(null) });
  };

  const entries = list.data ?? [];
  const valid = entries.filter((entry) => entry.valid);

  return (
    <Popover
      label="Playtests"
      title="Playtests"
      side="bottom"
      align="end"
      disabled={!gameId}
      open={open}
      onOpenChange={setOpen}
      triggerClassName="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      trigger={
        <>
          <LuFlaskConical aria-hidden className="size-3.5" />
          Playtests
        </>
      }
      panelClassName="w-96"
    >
      <div className="flex flex-col gap-2 p-2 text-xs" aria-busy={running !== null}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">Playtests</span>
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50"
            disabled={valid.length === 0 || running !== null}
            onClick={() => start()}
          >
            <LuPlay aria-hidden className="size-3" />
            {running === '*' ? 'Running…' : 'Run all'}
          </button>
        </div>
        {list.isLoading ? (
          <p className="text-muted-foreground">Reading playtests/…</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">
            No play-tests yet. Add <code>playtests/&lt;name&gt;.json</code> — a replay plus assertions — or ask the agent to record one.
          </p>
        ) : (
          <ul aria-label="Play-tests" className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {entries.map((entry) => (
              <PlaytestRow
                key={entry.name}
                entry={entry}
                running={running === entry.name || running === '*'}
                disabled={running !== null}
                onRun={() => start([entry.name])}
              />
            ))}
          </ul>
        )}
        <p className="text-muted-foreground">Each run restarts the game in deterministic mode.</p>
      </div>
    </Popover>
  );
}

function PlaytestRow({
  entry,
  running,
  disabled,
  onRun,
}: {
  entry: GamePlaytestEntry;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  const last = entry.last;
  return (
    <li className="flex flex-col gap-1 rounded border border-border px-2 py-1.5">
      <div className="flex items-center gap-2">
        <ResultIcon entry={entry} />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{entry.name}</span>
        {last ? <span className="text-muted-foreground">{summary(last)}</span> : null}
        <button
          type="button"
          aria-label={`Run ${entry.name}`}
          className="rounded px-1.5 py-0.5 text-foreground hover:bg-accent disabled:opacity-50"
          disabled={!entry.valid || disabled}
          onClick={onRun}
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
      {entry.valid ? null : <p className="text-destructive">{entry.issue}</p>}
      {last?.error ? <p className="text-destructive">{last.error}</p> : null}
      {last && !last.passed ? (
        <ul aria-label={`${entry.name} failures`} className="flex flex-col gap-0.5 pl-6">
          {last.results.filter((r) => !r.ok).map((r) => (
            <FailureLine key={r.assertIndex} result={r} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function FailureLine({ result }: { result: GameAssertResult }) {
  return (
    <li className="text-muted-foreground">
      <span className="text-foreground">
        #{result.assertIndex + 1} · frame {result.frame}:
      </span>{' '}
      {result.message}
      {result.screenshot ? <span className="block truncate font-mono text-[11px]">{result.screenshot}</span> : null}
    </li>
  );
}

function summary(result: GamePlaytestResult): string {
  const passed = result.results.filter((r) => r.ok).length;
  return `${passed}/${result.results.length} · ${result.frames} frames`;
}

function ResultIcon({ entry }: { entry: GamePlaytestEntry }) {
  if (!entry.valid) return <LuCircleAlert aria-label="Invalid" className="size-3.5 shrink-0 text-amber-500" />;
  if (!entry.last) return <LuCircleDashed aria-label="Not run yet" className="size-3.5 shrink-0 text-muted-foreground" />;
  return entry.last.passed ? (
    <LuCircleCheck aria-label="Passed" className="size-3.5 shrink-0 text-emerald-500" />
  ) : (
    <LuCircleX aria-label="Failed" className="size-3.5 shrink-0 text-destructive" />
  );
}
