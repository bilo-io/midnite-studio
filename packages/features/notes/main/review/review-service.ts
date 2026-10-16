import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ReviewCard, ReviewGrade } from '@midnite/studio-shared';
import { z } from 'zod';

import { safeRepoId, type NotesStore } from '../notes-store';
import { cardsFromNote } from './cards';
import { isDue, schedule, type CardState } from './scheduler';

/**
 * Review state, kept beside the notes and never inside them (Phase 113 Theme M).
 *
 * `<directory>/notes-review/<notebook>.json` — a sibling of `<directory>/notes/`, so the notes
 * store's directory scan never sees it and a note's file is never rewritten by a review. Cards are
 * derived from the notes on every read; this file only remembers how each was graded. A missing or
 * corrupt file is "nothing graded yet" and is replaced on the next grade — a note is never touched.
 */
const CardStateSchema = z.object({
  ease: z.number(),
  intervalDays: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  due: z.number().nonnegative(),
  lastReviewed: z.number().nonnegative(),
});
const ReviewFileSchema = z.object({ version: z.literal(1), cards: z.record(CardStateSchema) });
type ReviewFile = z.infer<typeof ReviewFileSchema>;

export type ReviewService = {
  due: (repoId: string) => Promise<{ cards: ReviewCard[]; total: number }>;
  grade: (
    repoId: string,
    cardId: string,
    grade: ReviewGrade,
  ) => Promise<{ ok: true; nextDue: number } | { ok: false; reason: string }>;
};

export function reviewFilePath(directory: string, repoId: string): string {
  return join(directory, 'notes-review', `${safeRepoId(repoId)}.json`);
}

async function readReview(file: string): Promise<ReviewFile> {
  try {
    const parsed = ReviewFileSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    if (parsed.success) return parsed.data;
  } catch {
    // missing or unreadable: nothing graded yet
  }
  return { version: 1, cards: {} };
}

async function writeReview(file: string, data: ReviewFile): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export function createReviewService(opts: {
  /** The directory the notes store is rooted at (it holds `notes/`). */
  directory: string;
  store: () => NotesStore;
  now?: () => number;
}): ReviewService {
  const now = opts.now ?? Date.now;
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, op: () => Promise<T>): Promise<T> => {
    const next = (chains.get(key) ?? Promise.resolve()).then(op, op);
    chains.set(key, next.catch(() => undefined));
    return next;
  };

  const cardsOf = async (repoId: string) => {
    const notes = await opts.store().list(repoId);
    return notes.flatMap((note) => cardsFromNote(note));
  };

  return {
    due: async (repoId) => {
      const file = reviewFilePath(opts.directory, repoId);
      const [cards, review] = await Promise.all([cardsOf(repoId), readReview(file)]);
      const at = now();
      const due = cards
        .filter((c) => isDue(review.cards[c.id], at))
        .map((c) => ({ c, state: review.cards[c.id] }))
        // Overdue cards first, longest overdue first; never-graded cards after them.
        .sort((a, b) => (a.state?.due ?? Infinity) - (b.state?.due ?? Infinity))
        .map(({ c, state }): ReviewCard => ({ ...c, isNew: state === undefined }));
      return { cards: due, total: cards.length };
    },

    grade: (repoId, cardId, grade) =>
      serial(safeRepoId(repoId), async () => {
        const cards = await cardsOf(repoId);
        if (!cards.some((c) => c.id === cardId)) return { ok: false as const, reason: 'No such card' };
        const file = reviewFilePath(opts.directory, repoId);
        const review = await readReview(file);
        const next: CardState = schedule(review.cards[cardId], grade, now());
        // Drop state for cards that no longer exist, so the file does not grow without bound.
        const live = new Set(cards.map((c) => c.id));
        const kept = Object.fromEntries(Object.entries(review.cards).filter(([id]) => live.has(id)));
        try {
          await writeReview(file, { version: 1, cards: { ...kept, [cardId]: next } });
        } catch {
          return { ok: false as const, reason: 'Could not save review progress' };
        }
        return { ok: true as const, nextDue: Math.round(next.due) };
      }),
  };
}
