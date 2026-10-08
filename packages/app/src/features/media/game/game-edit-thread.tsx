import { useEffect, useRef } from 'react';
import { LuGamepad2, LuGitCommitHorizontal, LuUndo2 } from 'react-icons/lu';

import { ThinkingIndicator } from '../../../components/ai-thread';
import { undoableCommit, type GameThreadEntry } from './game-agent-store';

/**
 * A game's edit thread (Phase 107 Theme M), in `VideoEditThread`'s message
 * presentation: the prompt, what the agent did, each pass's commit and the
 * run's outcome. **Undo turn** sits on the newest commit only — an older one
 * is a Timeline revert, since undoing it would reach under later work.
 */
export function GameEditThread({
  entries,
  running,
  onUndo,
  undoing,
}: {
  entries: readonly GameThreadEntry[];
  running: { pass: number; of: number } | null;
  onUndo: (sha: string) => void;
  undoing: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const undoable = running ? null : undoableCommit(entries);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries.length, running]);

  return (
    <div
      ref={list}
      className="hide-scrollbar min-h-40 flex-1 space-y-2 overflow-auto p-2"
      role="log"
      aria-label="Game edit thread"
      data-testid="game-edit-thread"
    >
      {entries.length === 0 && !running ? (
        <p className="flex flex-col items-center gap-2 px-1 py-4 text-center text-xs text-muted-foreground">
          <LuGamepad2 aria-hidden className="h-5 w-5" />
          Describe a change. Each pass that edits files becomes one commit you can undo.
        </p>
      ) : (
        entries.map((entry) => {
          switch (entry.kind) {
            case 'user':
              return (
                <div
                  key={entry.id}
                  className="ml-6 whitespace-pre-wrap rounded-md bg-accent px-2 py-1.5 text-xs text-foreground"
                >
                  {entry.text}
                </div>
              );
            case 'action':
              return (
                <div key={entry.id} className="text-[11px] text-muted-foreground">
                  {entry.text}
                </div>
              );
            case 'commit':
              return (
                <div
                  key={entry.id}
                  data-testid="game-thread-commit"
                  className={`flex items-start gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-xs ${entry.undone || entry.squashed ? 'opacity-60' : ''}`}
                >
                  <LuGitCommitHorizontal
                    aria-hidden
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono text-[11px] text-foreground">
                        {entry.commit.sha.slice(0, 7)}
                      </code>
                      <span className="text-muted-foreground">
                        pass {entry.pass}/{entry.of}
                        {entry.undone ? ' · undone' : entry.squashed ? ' · squashed' : ''}
                      </span>
                    </div>
                    <p
                      className="truncate font-mono text-[11px] text-muted-foreground"
                      title={entry.commit.files.join('\n')}
                    >
                      {entry.commit.files.length === 1
                        ? entry.commit.files[0]
                        : `${entry.commit.files.length} files: ${entry.commit.files.join(', ')}`}
                    </p>
                  </div>
                  {undoable?.id === entry.id ? (
                    <button
                      type="button"
                      onClick={() => onUndo(entry.commit.sha)}
                      disabled={undoing}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50"
                    >
                      <LuUndo2 aria-hidden className="h-3 w-3" />
                      Undo turn
                    </button>
                  ) : null}
                </div>
              );
            case 'result':
              return (
                <div key={entry.id} className="text-xs text-muted-foreground">
                  {entry.text}
                </div>
              );
            case 'error':
              return (
                <div
                  key={entry.id}
                  role="alert"
                  className="rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive"
                >
                  {entry.text}
                </div>
              );
          }
        })
      )}
      {running ? (
        <ThinkingIndicator
          label={running.pass > 0 ? `Pass ${running.pass} of ${running.of}` : 'Starting'}
        />
      ) : null}
    </div>
  );
}
