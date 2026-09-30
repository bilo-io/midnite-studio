import { beforeEach, describe, expect, it } from 'vitest';

import { draftItem, issueItem, pullItem, resetProjectItemSeq, withBlockedBy } from './project-item';

beforeEach(resetProjectItemSeq);

describe('issueItem', () => {
  it('builds an open issue with no dependencies and a unique number', () => {
    const a = issueItem();
    const b = issueItem();
    expect(a.content.type).toBe('issue');
    if (a.content.type !== 'issue') throw new Error('unreachable');
    expect(a.content.number).not.toBe((b.content as { number: number }).number);
    expect(a.content.dependencies.blockedBy).toEqual([]);
  });

  it('accepts overrides without losing the required defaults', () => {
    const item = issueItem({ content: { type: 'issue', title: 'Custom title' } as never });
    expect(item.content.type).toBe('issue');
    if (item.content.type !== 'issue') throw new Error('unreachable');
    expect(item.content.title).toBe('Custom title');
    expect(item.content.body).toBe('');
  });
});

describe('pullItem', () => {
  it('builds a pull request item with no dependencies field at all', () => {
    const item = pullItem();
    expect(item.content.type).toBe('pull');
    expect('dependencies' in item.content).toBe(false);
  });
});

describe('draftItem', () => {
  it('builds a draft with no number, url or state', () => {
    const item = draftItem();
    expect(item.content.type).toBe('draft');
    expect('number' in item.content).toBe(false);
    expect('url' in item.content).toBe(false);
  });
});

describe('withBlockedBy', () => {
  it('attaches blockedBy to an issue item, leaving parent/subIssues empty', () => {
    const item = withBlockedBy(issueItem(), [{ number: 12, title: 'Blocker', state: 'open', repo: '' }]);
    if (item.content.type !== 'issue') throw new Error('unreachable');
    expect(item.content.dependencies.blockedBy).toHaveLength(1);
    expect(item.content.dependencies.parent).toBeNull();
  });

  it('throws for a non-issue item', () => {
    expect(() => withBlockedBy(draftItem(), [])).toThrow();
  });
});
