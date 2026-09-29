import { useRef, useState } from 'react';

import type { CommitCi } from '@midnite/studio-shared';
import { LuX } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { Modal } from '../../components/modal';
import { usePageVisible } from '../../lib/use-page-visible';
import { useWindowFocused } from '../../lib/use-window-focus';
import { RunDetailPanel } from '../actions/run-detail-panel';
import { getActionItemStyle } from '../actions/action-status-styles';
import { runStatus, StatusGlyph } from '../forge/forge-status';
import { CI_POLL_MS } from './commit-ci';

/**
 * A commit's CI, opened from the graph's CI column.
 *
 * The run itself is the Actions page's own `RunDetailPanel` — the same job/step
 * accordions, running-step shimmer, status glow and log pane, not a lookalike.
 * This file adds only what a modal needs around it: a title, a close button,
 * and — when the commit ran more than one workflow — a tab strip to pick
 * between them.
 *
 * Tabs are ordered by `aggregateCommitRuns`' own precedence (failed, running,
 * queued, …, then newest), and the modal opens on the first: the run the
 * column's mark was drawn from, which is the one the click was about.
 *
 * Escape and an outside click close it — both are `Modal`'s, through the
 * shared dismissal stack.
 */
export function CiRunModal({
  repoId,
  sha,
  subject,
  ci,
  onClose,
}: {
  repoId: string;
  sha: string;
  subject: string | null;
  ci: CommitCi;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string>(ci.representative.id);
  // A pick that polling has since superseded (a re-run replaced it) falls back
  // to the aggregate's own lead rather than an empty pane.
  const run = ci.runs.find((candidate) => candidate.id === picked) ?? ci.representative;

  // Poll the open run only while someone can see it — the same gate the column uses.
  const focused = useWindowFocused();
  const visible = usePageVisible();
  const pollMs = focused && visible ? CI_POLL_MS : false;

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusTab = (index: number) => {
    const count = ci.runs.length;
    const next = ((index % count) + count) % count;
    const target = ci.runs[next];
    if (!target) return;
    setPicked(target.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <Modal open onClose={onClose} title={`CI for ${sha.slice(0, 7)}`} size="lg" testId="ci-run-modal">
      <div className="flex h-[min(80vh,720px)] min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CI</h2>
          <span className="font-mono text-xs text-muted-foreground">{sha.slice(0, 7)}</span>
          {subject ? <span className="min-w-0 truncate text-xs text-foreground/80">{subject}</span> : null}
          <IconButton icon={LuX} label="Close" size="sm" className="ml-auto" onClick={onClose} />
        </div>

        {ci.runs.length > 1 ? (
          <div
            role="tablist"
            aria-label="Workflow runs for this commit"
            className="hide-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1"
          >
            {ci.runs.map((candidate, index) => {
              const status = runStatus(candidate);
              const style = getActionItemStyle(status);
              const selected = candidate.id === run.id;
              return (
                <button
                  key={candidate.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`${candidate.workflowName ?? candidate.name}: ${status.label}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setPicked(candidate.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      focusTab(index + 1);
                    } else if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      focusTab(index - 1);
                    }
                  }}
                  className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                    selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40'
                  } ${style.rowClass}`}
                >
                  <StatusGlyph status={status} />
                  <span className={`truncate ${selected ? style.textClass : ''}`}>
                    {candidate.workflowName ?? candidate.name}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div role={ci.runs.length > 1 ? 'tabpanel' : undefined} className="flex min-h-0 flex-1 flex-col">
          <RunDetailPanel key={run.id} repoId={repoId} run={run} pollMs={pollMs} />
        </div>
      </div>
    </Modal>
  );
}
