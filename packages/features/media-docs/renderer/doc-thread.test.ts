import type { DocProposal } from '@midnite/studio-shared';
import { docThreadPath } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  appendMessage,
  applyProposal,
  EMPTY_THREAD,
  normalizeMarkdown,
  parseThread,
  serializeThread,
  setProposalStatus,
} from './doc-thread';
import { lineDiff } from './line-diff';

const proposal = (over: Partial<DocProposal> = {}): DocProposal => ({
  scope: 'selection',
  original: 'old line',
  replacement: 'new line',
  status: 'pending',
  ...over,
});

describe('thread store', () => {
  it('names the sidecar after the doc', () => {
    expect(docThreadPath('intro.md')).toBe('intro.thread.json');
    expect(docThreadPath('nested/Plan.MD')).toBe('nested/Plan.thread.json');
  });

  it('reads a missing or corrupt sidecar as an empty thread', () => {
    expect(parseThread(null)).toEqual(EMPTY_THREAD);
    expect(parseThread('not json')).toEqual(EMPTY_THREAD);
    expect(parseThread('{"version":2,"messages":[]}')).toEqual(EMPTY_THREAD);
  });

  it('round-trips appended turns and resolves a proposal', () => {
    let thread = appendMessage(EMPTY_THREAD, { id: 'u1', role: 'user', text: 'shorter', createdAt: 1 });
    thread = appendMessage(thread, { id: 'a1', role: 'assistant', text: 'ok', createdAt: 2, proposal: proposal() });
    thread = setProposalStatus(thread, 'a1', 'accepted');
    const back = parseThread(serializeThread(thread));
    expect(back.messages).toHaveLength(2);
    expect(back.messages[1]?.proposal?.status).toBe('accepted');
    expect(setProposalStatus(back, 'u1', 'rejected').messages[0]).toEqual(back.messages[0]);
  });
});

describe('applyProposal', () => {
  it('replaces the whole doc for a doc-scoped edit', () => {
    expect(applyProposal('# A\n', proposal({ scope: 'doc', original: '# A\n', replacement: '# B' }))).toBe('# B\n');
  });

  it('replaces the selected passage in place', () => {
    expect(applyProposal('# T\n\nold line\n\nrest\n', proposal())).toBe('# T\n\nnew line\n\nrest\n');
  });

  it('refuses when the selected passage is no longer in the doc', () => {
    expect(applyProposal('# T\n\nedited by hand\n', proposal())).toBeNull();
  });

  it('normalises to one trailing newline', () => {
    expect(normalizeMarkdown('a\n\n\n')).toBe('a\n');
    expect(normalizeMarkdown('a\n\n\n\n| t |\n\n\nb')).toBe('a\n\n| t |\n\nb\n');
    expect(normalizeMarkdown('```\nx\n\n\ny\n```')).toBe('```\nx\n\n\ny\n```\n');
  });
});

describe('lineDiff', () => {
  it('marks kept, removed and added lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
  });
});
