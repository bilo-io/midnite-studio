import { z } from 'zod';

/**
 * A best-effort classification of `%gs`, the reflog's own human sentence
 * (`"checkout: moving from main to feature"`, `"commit (amend): …"`,
 * `"reset: moving to HEAD~2"`). Only for an icon and a filter — the raw
 * `subject` stays the displayed text always, so a mis-parse degrades to a
 * plain row rather than a wrong verb (Phase 22 Theme G).
 */
export const ReflogActionSchema = z.enum([
  'commit',
  'amend',
  'checkout',
  'reset',
  'merge',
  'rebase',
  'cherryPick',
  'revert',
  'pull',
  'branch',
  'other',
]);
export type ReflogAction = z.infer<typeof ReflogActionSchema>;

/**
 * One line of `git reflog show`.
 *
 * `selector`/`fullSelector` both carry the timestamp git embedded in them —
 * `readReflog` reads with `--date=unix` rather than the default numeric
 * `HEAD@{N}` form, because `%gd`/`%gD` are the only placeholders that answer
 * "when was this reflog ENTRY written," as distinct from `%at`/`%ct` (the
 * *commit's own* author/committer date, which for e.g. a reset onto an old
 * commit is nothing like when the reset happened). `at` is that same
 * timestamp, parsed back out for sorting and display without a caller having
 * to know the embedding trick.
 *
 * `oldSha` is not a `%`-placeholder at all — git's pretty-format has none for
 * "the sha this entry moved FROM." `readReflog` derives it by pairing each
 * entry with the next OLDER one in the same read (reflog order is
 * newest-first), so the oldest entry in any given page has `oldSha: null`.
 */
export const ReflogEntrySchema = z.object({
  /** Short form, e.g. `main@{1788383371}`. */
  selector: z.string(),
  /** Fully qualified, e.g. `refs/heads/main@{1788383371}`. */
  fullSelector: z.string(),
  /** The commit this entry moved the ref TO. */
  sha: z.string(),
  /** The commit this entry moved the ref FROM, or null at the oldest known entry. */
  oldSha: z.string().nullable(),
  /** `%gs` verbatim — always the displayed text, regardless of how `action` parsed. */
  subject: z.string(),
  action: ReflogActionSchema,
  /** Unix seconds the entry was written — see the module doc for why this isn't `%at`/`%ct`. */
  at: z.number().int(),
  /** `%gn` — the identity that made the write, not necessarily the commit's author. */
  author: z.string(),
});
export type ReflogEntry = z.infer<typeof ReflogEntrySchema>;
