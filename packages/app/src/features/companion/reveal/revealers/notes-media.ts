import type { FamilyRevealers } from '../types';
import { unavailableRevealer } from './stub';

/** Notes + media — Phase 112 Theme E fills these. */
export type NotesMediaResourceKind = 'note' | 'media';

export const NOTES_MEDIA_REVEALERS: FamilyRevealers<NotesMediaResourceKind> = {
  note: unavailableRevealer('notes'),
  media: unavailableRevealer('media'),
};
