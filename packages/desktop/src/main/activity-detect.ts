// Moved to the runtime — `packages/runtime/src/broker/activity-detect.ts` (Phase 113 Theme O slice 4), so
// an app that starts agent sessions on the shared broker (Agents' workflow agent nodes) reads an agent's
// activity exactly as Studio does. This re-export keeps desktop's import paths and its test working.
export {
  compileMarkers,
  createActivityClock,
  createActivityDetector,
  createActivityState,
  detectActivity,
  needsNoBoundaryWarning,
  type ActivityDetector,
  type ActivityState,
  type CompiledMarkers,
} from '@midnite/studio-runtime';
