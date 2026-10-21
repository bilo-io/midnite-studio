// Moved to the runtime (Phase 113 Theme S) — `extractJson` is shared by Sprite's map generator and the
// music prompts; this re-export keeps the model's importers on their old path.
export {
  describeIssues,
  extractJson,
  normalizeSpec,
  parseSpec,
  type ParseOutcome,
} from '@midnite/studio-runtime';
