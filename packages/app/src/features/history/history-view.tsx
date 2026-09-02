import { useState } from 'react';

import { useActiveWorktree } from '../../services/use-status';
import { JournalList } from './journal-list';
import { ReflogList } from './reflog-list';

/**
 * The History view (Phase 22, Themes G + H) — two tabs over the same
 * question, "what happened to this repository", answered from two different
 * vantage points: the reflog is every write the REPOSITORY saw, from any
 * writer; the journal is every write THIS APP made. Conflating them would
 * hide exactly that distinction, which is why they are two tabs rather than
 * one merged list.
 *
 * Journal opens first: Theme H is what this pass builds end to end (the
 * classifier, the recording, the two wired Undo actions), where the reflog
 * tab is presently a placeholder pending Theme G — see `reflog-list.tsx`.
 */
type HistoryTab = 'journal' | 'reflog';

const TABS: { id: HistoryTab; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'reflog', label: 'Reflog' },
];

export function HistoryView() {
  const { repoId } = useActiveWorktree();
  const [tab, setTab] = useState<HistoryTab>('journal');

  return (
    <section aria-label="History" className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="History"
        className="flex shrink-0 gap-1 border-b border-border px-2"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`history-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`history-panel-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs transition-colors ${
              tab === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`history-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`history-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === 'journal' ? <JournalList repoId={repoId} /> : <ReflogList />}
      </div>
    </section>
  );
}
