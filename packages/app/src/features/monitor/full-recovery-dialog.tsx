import { useEffect } from 'react';

import { endSessionsWithConfirm, previousBuildSessions } from '@midnite/studio-feature-terminal/renderer';

import { useDialogs } from '../../components/dialog-host';
import { Modal } from '../../components/modal';
import { requestHandoff } from '../../services/handoff';
import { useRepos } from '../../services/queries';
import { useTerminalStore } from '../terminal/terminal-store';
import { formatBytes } from './format-bytes';
import {
  groupByRepo,
  isAllAttached,
  revealRecovered,
  useFullRecoveryStore,
  type RecoveredSession,
} from './full-recovery';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const BUTTON = 'shrink-0 rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-hover';

/**
 * The Full recovery summary (Phase 148 Theme D): recovered sessions grouped by repo, the ones still on a
 * previous build, and any broker the inventory could not reach. Each section hides when empty; with all
 * three empty it says so. Mounted once under `DialogHost`, which also lends it its dialogs for the widget.
 */
export function FullRecoveryHost() {
  const dialogs = useDialogs();
  const summary = useFullRecoveryStore((s) => s.summary);
  const close = useFullRecoveryStore((s) => s.close);
  const setDialogs = useFullRecoveryStore((s) => s.setDialogs);
  const repos = useRepos().data;
  // Subscribed so ending a session from this dialog drops its row.
  useTerminalStore((s) => s.sessions);

  useEffect(() => {
    setDialogs(dialogs);
    return () => setDialogs(null);
  }, [dialogs, setDialogs]);

  if (!summary) return null;
  const repoName = (repoId: string): string => repos?.find((r) => r.id === repoId)?.name ?? repoId;
  const stale = previousBuildSessions();
  const unreachableBytes = summary.unreachable.reduce((sum, p) => sum + p.rssBytes, 0);

  const reveal = (session: RecoveredSession): void => {
    if (revealRecovered(session)) close();
    else dialogs.notify({ title: 'Session is gone', body: `${session.title} is no longer in the session list.` });
  };

  return (
    <Modal open onClose={close} title="Full recovery" size="md" scope="window" testId="full-recovery-dialog">
      <div className="flex flex-col gap-4 p-4 text-sm">
        <h2 className="text-base font-semibold">Full recovery</h2>
        {isAllAttached(summary) && <p>Everything is attached</p>}
        {summary.recovered.length > 0 && (
          <section aria-label="Recovered">
            <h3 className="mb-1 font-medium">Recovered ({summary.recovered.length})</h3>
            {groupByRepo(summary.recovered).map((group) => (
              <div key={group.repoId} className="mb-2" role="group" aria-label={repoName(group.repoId)}>
                <div className="text-xs uppercase text-muted-foreground">{repoName(group.repoId)}</div>
                <ul>
                  {group.sessions.map((session) => (
                    <li key={session.sessionId} className="flex items-center gap-2 py-0.5">
                      <span className="min-w-0 flex-1 truncate">
                        {session.title} <span className="text-muted-foreground">{session.cwd}</span>
                      </span>
                      <button type="button" className={BUTTON} onClick={() => reveal(session)}>
                        Reveal
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
        {stale.length > 0 && (
          <section aria-label="Still on a previous build">
            <h3 className="mb-1 font-medium">Still on a previous build ({stale.length})</h3>
            <div className="flex items-center gap-2">
              <span className="flex-1">These keep their old broker alive until they end.</span>
              <button type="button" className={BUTTON} onClick={() => endSessionsWithConfirm(dialogs, previousBuildSessions())}>
                End…
              </button>
            </div>
          </section>
        )}
        {summary.unreachable.length > 0 && (
          <section aria-label="Unreachable">
            <h3 className="mb-1 font-medium">
              Unreachable ({summary.unreachable.length} · {formatBytes(unreachableBytes)})
            </h3>
            <div className="flex items-center gap-2">
              <span className="flex-1">Brokers this build cannot attach to.</span>
              <button
                type="button"
                className={BUTTON}
                onClick={() => {
                  close();
                  void requestHandoff({ app: 'cleaner', view: 'optimizer' });
                }}
              >
                Manage resources
              </button>
            </div>
          </section>
        )}
        <footer className="text-xs text-muted-foreground">{plural(summary.live, 'session')} running</footer>
      </div>
    </Modal>
  );
}
