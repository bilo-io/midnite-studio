import { useCallback, useEffect, useState } from 'react';

import { bridge } from '@midnite/studio-frame';
import type { ReviewCard, ReviewGrade } from '@midnite/studio-shared';

import { useNotesHost } from './host';

const GRADES: { grade: ReviewGrade; label: string; key: string }[] = [
  { grade: 'again', label: 'Again', key: '1' },
  { grade: 'hard', label: 'Hard', key: '2' },
  { grade: 'good', label: 'Good', key: '3' },
  { grade: 'easy', label: 'Easy', key: '4' },
];

type Loaded = { cards: ReviewCard[]; total: number } | 'error' | null;

/**
 * Review — spaced practice over the notes (Phase 113 Theme M). The cards come from main, cut from
 * each note's own text (`Q:`/`A:` lines, a `---` split, or heading -> body); this view only shows
 * one at a time, reveals the answer and sends a grade back. Notes are never edited from here.
 */
export function ReviewView() {
  const host = useNotesHost();
  const { selectedRepoId } = host.useRepoContext();
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(async () => {
    if (!selectedRepoId) return;
    try {
      const api = bridge();
      setLoaded(api ? await api.notes.reviewDue({ repoId: selectedRepoId }) : 'error');
    } catch {
      setLoaded('error');
    }
  }, [selectedRepoId]);

  useEffect(() => {
    setRevealed(false);
    setDone(0);
    setLoaded(null);
    void load();
  }, [load]);

  const current = loaded && loaded !== 'error' ? loaded.cards[0] : undefined;

  const grade = useCallback(
    async (value: ReviewGrade) => {
      if (!selectedRepoId || !current) return;
      const result = await bridge()?.notes.reviewGrade({ repoId: selectedRepoId, cardId: current.id, grade: value });
      setSaveFailed(!result?.ok);
      setRevealed(false);
      setDone((n) => n + 1);
      // An Again card is due again in minutes; it comes back on the next load, not this session's queue.
      setLoaded((prev) => (prev && prev !== 'error' ? { ...prev, cards: prev.cards.slice(1) } : prev));
    },
    [selectedRepoId, current],
  );

  if (!selectedRepoId) {
    return <Message text={host.noRepoHint ?? 'Open a notebook to review its notes.'} />;
  }
  if (loaded === null) return <Message text="Gathering your cards…" />;
  if (loaded === 'error') return <Message text="Review could not be loaded." />;

  if (!current) {
    return (
      <div data-testid="review-empty" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">{loaded.total === 0 ? 'No cards yet' : 'All caught up'}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {loaded.total === 0
            ? 'Write "Q: …" then "A: …" in a note, split a note in two with a line of ---, or put an answer under a heading, and it becomes a card here.'
            : `Reviewed ${done} this session. The rest of your ${loaded.total} cards are not due yet.`}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="review-view" className="flex h-full flex-col items-center gap-4 overflow-auto p-6">
      <p data-testid="review-due-count" className="text-xs text-muted-foreground">
        {loaded.cards.length} due{current.isNew ? ' · new card' : ''}
      </p>
      <section aria-label="Card" className="w-full max-w-xl rounded-lg border border-border p-5">
        <p className="whitespace-pre-wrap text-base font-medium" data-testid="review-front">
          {current.front}
        </p>
        {revealed ? (
          <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-sm" data-testid="review-back">
            {current.back}
          </p>
        ) : null}
      </section>
      {saveFailed ? (
        <p role="alert" className="text-xs text-destructive">
          The last grade could not be saved.
        </p>
      ) : null}
      {revealed ? (
        <div className="flex gap-2" role="group" aria-label="Grade this card">
          {GRADES.map(({ grade: value, label, key }) => (
            <button
              key={value}
              type="button"
              data-testid={`review-grade-${value}`}
              onClick={() => void grade(value)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              {label} <span className="text-[10px] text-muted-foreground">{key}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          data-testid="review-reveal"
          onClick={() => setRevealed(true)}
          className="rounded-md border border-border px-4 py-1.5 text-sm hover:bg-accent"
        >
          Show answer
        </button>
      )}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <p className="p-6 text-center text-xs text-muted-foreground">{text}</p>;
}
