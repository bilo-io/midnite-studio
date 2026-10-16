// Moved to the runtime (Phase 113 Theme N) — the chats feature spawns agent CLIs
// through it too. Kept so the ~30 desktop importers (and the tests that
// `vi.mock` this path) do not move.
export {
  DEFAULT_TIMEOUT_MS,
  firstLine,
  OUTPUT_TAIL_CAP,
  realSpawn,
  runProcess,
  type ProcessOutcome,
  type ProcessRunReason,
  type ProcessSink,
  type RunProcessDeps,
  type SinkOutcome,
  type SpawnedProcess,
  type SpawnFn,
} from '@midnite/studio-runtime';
