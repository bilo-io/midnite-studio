import type { FamilyRevealers } from '../types';
import { unavailableRevealer } from './stub';

/** Git + forge — Phase 112 Theme C fills these. */
export type GitResourceKind = 'commit' | 'ref' | 'stash' | 'file' | 'commitFile' | 'pull' | 'issue' | 'ciRun';

export const GIT_REVEALERS: FamilyRevealers<GitResourceKind> = {
  commit: unavailableRevealer('graph'),
  ref: unavailableRevealer('graph'),
  stash: unavailableRevealer('graph'),
  file: unavailableRevealer('files'),
  commitFile: unavailableRevealer('graph'),
  pull: unavailableRevealer('reviews'),
  issue: unavailableRevealer('tasks'),
  ciRun: unavailableRevealer('actions'),
};
