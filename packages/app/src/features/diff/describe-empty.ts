import type { FileDiff } from '@midnite/studio-shared';

/**
 * Why a diff has nothing to show.
 *
 * Lives in the renderer rather than git-engine because `app` may not import
 * git-engine (CLAUDE.md → package boundaries), and both diff surfaces need it:
 * a binary blob and a mode-only change both arrive as zero hunks, and "No
 * changes to show for this file" is wrong for each of them.
 *
 * Pure and total, so it is unit-testable without a DOM.
 */
export function describeEmptyDiff(diff: FileDiff): string {
  if (diff.binary) return 'Binary file — no textual diff.';
  if (diff.oldMode && diff.newMode && diff.oldMode !== diff.newMode) {
    return `Mode changed from ${diff.oldMode} to ${diff.newMode}.`;
  }
  if (diff.change === 'renamed') {
    return `Renamed from ${diff.oldPath ?? 'an earlier path'} with no content change.`;
  }
  if (diff.change === 'copied') {
    return `Copied from ${diff.oldPath ?? 'an earlier path'} with no content change.`;
  }
  return 'No changes to show for this file.';
}
