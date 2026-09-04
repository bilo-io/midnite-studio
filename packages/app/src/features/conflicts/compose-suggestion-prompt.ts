import type { ConflictStudioItem } from './flatten-conflict-hunks';

/** Lines of surrounding context pulled in on each side of a region — enough to orient an agent, not the whole file. */
const CONTEXT_LINES = 8;

/**
 * Builds the prompt a "Suggest a resolution" run sends to the council
 * (Phase 47 Theme E) — ours/base/theirs plus a bounded window of the
 * unchanged lines immediately before and after, since a bare region with no
 * surrounding code is often unanswerable on its own (e.g. two one-word
 * changes with nothing to tell them apart).
 *
 * Pure and independent of any IPC/council concept: this only shapes text,
 * so it is unit-testable without a bridge, a store, or a mocked run.
 */
export function composeSuggestionPrompt(
  items: ConflictStudioItem[],
  regionIndex: number,
  path: string,
): string {
  const pos = items.findIndex((item) => item.kind === 'conflict' && item.regionIndex === regionIndex);
  if (pos === -1) throw new Error(`composeSuggestionPrompt: no region ${regionIndex} in items`);
  const target = items[pos];
  if (target?.kind !== 'conflict') throw new Error(`composeSuggestionPrompt: item at ${pos} is not a conflict`);

  const before = items[pos - 1];
  const contextBefore = before?.kind === 'context' ? before.lines.slice(-CONTEXT_LINES) : [];
  const after = items[pos + 1];
  const contextAfter = after?.kind === 'context' ? after.lines.slice(0, CONTEXT_LINES) : [];

  const { region } = target;
  const sections = [
    `You are helping resolve a merge conflict in "${path}".`,
    contextBefore.length > 0 ? `Context before:\n${contextBefore.join('\n')}` : null,
    `Ours:\n${region.ours.join('\n') || '(empty)'}`,
    region.base !== null ? `Common ancestor:\n${region.base.join('\n') || '(empty)'}` : null,
    `Theirs:\n${region.theirs.join('\n') || '(empty)'}`,
    contextAfter.length > 0 ? `Context after:\n${contextAfter.join('\n')}` : null,
    'Which side should be kept — ours, theirs, or a combination of both — and why? A few sentences is enough.',
  ];

  return sections.filter((section): section is string => section !== null).join('\n\n');
}
