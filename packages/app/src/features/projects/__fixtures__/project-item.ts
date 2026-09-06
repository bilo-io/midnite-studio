import { EMPTY_ISSUE_LINK_SET } from '@midnite/studio-shared';
import type { ForgeIssueLinkSet, ForgeProjectItem, ForgeProjectItemContent } from '@midnite/studio-shared';

/**
 * The repo's first shared `ForgeProjectItem` factory (Phase 75, listed under
 * Theme B's own checklist but left unbuilt there and by Theme C — both
 * reused their own local, ad hoc item literals instead). Theme D's own
 * suites (the graph canvas, its node, a 300-item render-count fixture) are
 * the fifth and sixth places that need one, which is where a shared factory
 * gets cheaper than a seventh copy-pasted literal.
 *
 * Existing suites (`task-card.test.tsx`, `board-derive.test.ts`, …) are
 * **not** migrated onto this — each already has a working, narrower literal
 * of its own, and rewriting a passing suite to use a new fixture is not this
 * theme's business.
 */

let counter = 0;

/** A fresh, never-yet-used number/id pair — so a loop building many items
 *  (a 300-node graph fixture, say) never collides on identity by accident. */
function nextSeq(): number {
  counter += 1;
  return counter;
}

/** An open issue with no dependencies, empty body/labels/assignees — the
 *  shape every existing suite's own literal already reaches for. */
export function issueItem(overrides: Partial<ForgeProjectItem> = {}): ForgeProjectItem {
  const n = nextSeq();
  const content: Extract<ForgeProjectItemContent, { type: 'issue' }> = {
    type: 'issue',
    id: `I_${n}`,
    number: n,
    title: `Issue #${n}`,
    url: `https://github.com/acme/widgets/issues/${n}`,
    state: 'open',
    assignees: [],
    body: '',
    labels: [],
    dependencies: EMPTY_ISSUE_LINK_SET,
    ...(overrides.content?.type === 'issue' ? overrides.content : {}),
  };
  return {
    id: `PVTI_${n}`,
    fieldValues: {},
    ...overrides,
    content,
  };
}

/** An open pull request — never carries `dependencies`; GitHub does not
 *  expose `blockedBy`/`parent`/`subIssues` on `PullRequest`. */
export function pullItem(overrides: Partial<ForgeProjectItem> = {}): ForgeProjectItem {
  const n = nextSeq();
  const content: Extract<ForgeProjectItemContent, { type: 'pull' }> = {
    type: 'pull',
    id: `PR_${n}`,
    number: n,
    title: `Pull #${n}`,
    url: `https://github.com/acme/widgets/pull/${n}`,
    state: 'open',
    assignees: [],
    body: '',
    labels: [],
    ...(overrides.content?.type === 'pull' ? overrides.content : {}),
  };
  return {
    id: `PVTI_${n}`,
    fieldValues: {},
    ...overrides,
    content,
  };
}

/** A draft item — no issue/PR behind it, so no `number`/`url`/`state` at all. */
export function draftItem(overrides: Partial<ForgeProjectItem> = {}): ForgeProjectItem {
  const n = nextSeq();
  const content: Extract<ForgeProjectItemContent, { type: 'draft' }> = {
    type: 'draft',
    id: `DI_${n}`,
    title: `Draft #${n}`,
    assignees: [],
    body: '',
    ...(overrides.content?.type === 'draft' ? overrides.content : {}),
  };
  return {
    id: `PVTI_${n}`,
    fieldValues: {},
    ...overrides,
    content,
  };
}

/** A convenience wrapper for the ladder's `api` layer — attaches `blockedBy`
 *  to an issue item's `dependencies`, leaving `parent`/`subIssues` at their
 *  empty defaults. */
export function withBlockedBy(item: ForgeProjectItem, blockedBy: ForgeIssueLinkSet['blockedBy']): ForgeProjectItem {
  if (item.content.type !== 'issue') throw new Error('withBlockedBy only applies to an issue item');
  return {
    ...item,
    content: { ...item.content, dependencies: { ...item.content.dependencies, blockedBy } },
  };
}

/** Resets the id/number counter — call from a suite's own `beforeEach` if it
 *  asserts on exact generated numbers rather than treating them as opaque. */
export function resetProjectItemSeq(): void {
  counter = 0;
}
