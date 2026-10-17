// Moved to the runtime (Phase 113 Theme S slice 3): Gamer's agent runs need the login shell's PATH too.
// Kept so Studio's importers do not move.
export {
  ensureLoginShellPathAsync,
  mergePath,
  parseShellPathOutput,
  resolveLoginShellPathAsync,
  RESOLVE_TIMEOUT_MS,
} from '@midnite/studio-runtime';
