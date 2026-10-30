// Moved to the terminal feature — `packages/features/terminal/main` (Phase 123 Theme E.3). This re-export
// keeps desktop's import paths working.
export {
  createSessionHistoryStore,
  evictClosed,
  nullSessionHistoryStore,
  parseHistoryState,
  transcriptPath,
  type SessionHistoryStore,
} from '@midnite/studio-feature-terminal/main';
