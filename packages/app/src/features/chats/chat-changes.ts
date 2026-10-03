import type { ChatChangeDecision, ChatChangeSet, ChatChangedFile } from '@midnite/studio-shared';

/**
 * Small pure helpers over a change set, shared by the inline card and the
 * review modal (the state machine itself — `reduceChangeSet`, `deriveFileStatus`
 * — lives in `shared`, because main runs it too).
 */

/** Whether any part of a file still needs a decision (an undecided hunk, or a conflict to retry). */
export function fileNeedsDecision(file: ChatChangedFile): boolean {
  if (file.status === 'conflict') return true;
  return file.hunks.length > 0 ? file.hunks.some((h) => h.status === 'pending') : file.fileStatus === 'pending';
}

/**
 * "Accept all" / "Reject all": one whole-file decision for every file that still
 * needs one. Files already fully decided are left alone, so a second click on
 * "Accept all" after a partial review accepts only what is left.
 */
export function decisionsFor(changeSet: ChatChangeSet, action: 'accept' | 'reject'): ChatChangeDecision[] {
  return changeSet.files.filter(fileNeedsDecision).map((file) => ({ path: file.path, action }));
}

/** The decision for one file (every undecided hunk) or, with `hunk`, for just that hunk. */
export function fileDecision(file: ChatChangedFile, action: 'accept' | 'reject', hunk?: number): ChatChangeDecision {
  return hunk === undefined ? { path: file.path, action } : { path: file.path, action, hunks: [hunk] };
}
