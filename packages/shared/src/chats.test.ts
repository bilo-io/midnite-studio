import { describe, expect, it } from 'vitest';

import {
  chatDateBucket,
  chatTitleFromText,
  chatWorktreeBranch,
  ChatSchema,
  ChatSummarySchema,
  ProviderSyncTierSchema,
  UnifiedSessionViewModeSchema,
  changeSetNeedsReview,
  deriveChangeSetStatus,
  deriveFileStatus,
  getProviderSyncTier,
  reduceChangeSet,
  type ChatChangedFile,
  type ChatChangeSet,
} from './chats';
import { CHANNELS, EVENT_CHANNELS } from './ipc/channels';
import * as schemas from './ipc/schemas';

const hunk = (status: 'pending' | 'accepted' | 'rejected' = 'pending') => ({
  header: '@@ -1 +1 @@',
  insertions: 1,
  deletions: 1,
  status,
});

const file = (path: string, hunks = [hunk()]): ChatChangedFile => {
  const base = {
    path,
    oldPath: null,
    change: 'modified' as const,
    binary: false,
    insertions: 1,
    deletions: 1,
    preview: [],
    hunks,
    fileStatus: 'pending' as const,
  };
  return { ...base, status: deriveFileStatus(base) };
};

const set = (...files: ChatChangedFile[]): ChatChangeSet => ({
  id: 'cs1',
  createdAt: 1,
  files,
  status: deriveChangeSetStatus(files),
});

describe('card state machine', () => {
  it('starts pending', () => {
    expect(set(file('a'), file('b')).status).toBe('pending');
  });

  it('accepting every file is accepted; rejecting every file is rejected', () => {
    const cs = set(file('a'), file('b'));
    const accepted = reduceChangeSet(
      cs,
      [
        { path: 'a', action: 'accept' },
        { path: 'b', action: 'accept' },
      ],
      [
        { path: 'a', ok: true },
        { path: 'b', ok: true },
      ],
    );
    expect(accepted.status).toBe('accepted');
    const rejected = reduceChangeSet(
      cs,
      [
        { path: 'a', action: 'reject' },
        { path: 'b', action: 'reject' },
      ],
      [
        { path: 'a', ok: true },
        { path: 'b', ok: true },
      ],
    );
    expect(rejected.status).toBe('rejected');
  });

  it('one file decided out of two is partial and still needs review', () => {
    const next = reduceChangeSet(set(file('a'), file('b')), [{ path: 'a', action: 'accept' }], [{ path: 'a', ok: true }]);
    expect(next.status).toBe('partial');
    expect(next.files[0]!.status).toBe('accepted');
    expect(next.files[1]!.status).toBe('pending');
    expect(changeSetNeedsReview(next)).toBe(true);
  });

  it('accept + reject across files is partial but needs nothing more', () => {
    const next = reduceChangeSet(
      set(file('a'), file('b')),
      [
        { path: 'a', action: 'accept' },
        { path: 'b', action: 'reject' },
      ],
      [
        { path: 'a', ok: true },
        { path: 'b', ok: true },
      ],
    );
    expect(next.status).toBe('partial');
    expect(changeSetNeedsReview(next)).toBe(false);
  });

  it('decides one hunk at a time; the file derives partial then accepted', () => {
    const cs = set(file('a', [hunk(), hunk()]));
    const one = reduceChangeSet(cs, [{ path: 'a', action: 'accept', hunks: [1] }], [{ path: 'a', ok: true }]);
    expect(one.files[0]!.hunks.map((h) => h.status)).toEqual(['pending', 'accepted']);
    expect(one.files[0]!.status).toBe('partial');
    const both = reduceChangeSet(one, [{ path: 'a', action: 'accept', hunks: [0] }], [{ path: 'a', ok: true }]);
    expect(both.files[0]!.status).toBe('accepted');
    expect(both.status).toBe('accepted');
  });

  it('a whole-file decision never flips a hunk that was already decided', () => {
    const cs = set(file('a', [hunk('accepted'), hunk()]));
    const next = reduceChangeSet(cs, [{ path: 'a', action: 'reject' }], [{ path: 'a', ok: true }]);
    expect(next.files[0]!.hunks.map((h) => h.status)).toEqual(['accepted', 'rejected']);
    expect(next.files[0]!.status).toBe('partial');
  });

  it('a failed apply marks the file conflict, keeps hunks undecided, and wins the set status', () => {
    const cs = set(file('a'), file('b'));
    const next = reduceChangeSet(
      cs,
      [
        { path: 'a', action: 'accept' },
        { path: 'b', action: 'accept' },
      ],
      [
        { path: 'a', ok: false, reason: 'Your working tree changed' },
        { path: 'b', ok: true },
      ],
    );
    expect(next.files[0]).toMatchObject({ status: 'conflict', conflict: 'Your working tree changed' });
    expect(next.files[0]!.hunks[0]!.status).toBe('pending');
    expect(next.files[1]!.status).toBe('accepted');
    expect(next.status).toBe('conflict');
    expect(changeSetNeedsReview(next)).toBe(true);
  });

  it('a conflict clears once the file is decided again', () => {
    const conflicted = reduceChangeSet(set(file('a')), [{ path: 'a', action: 'accept' }], [{ path: 'a', ok: false, reason: 'x' }]);
    const rejected = reduceChangeSet(conflicted, [{ path: 'a', action: 'reject' }], [{ path: 'a', ok: true }]);
    expect(rejected.files[0]!.conflict).toBeUndefined();
    expect(rejected.status).toBe('rejected');
  });

  it('a hunkless file (binary, mode-only) is decided through fileStatus', () => {
    const cs = set(file('img.png', []));
    expect(cs.files[0]!.status).toBe('pending');
    const next = reduceChangeSet(cs, [{ path: 'img.png', action: 'accept' }], [{ path: 'img.png', ok: true }]);
    expect(next.files[0]!.fileStatus).toBe('accepted');
    expect(next.status).toBe('accepted');
  });

  it('ignores a decision for a path that is not in the set', () => {
    const cs = set(file('a'));
    expect(reduceChangeSet(cs, [{ path: 'zzz', action: 'accept' }], [{ path: 'zzz', ok: true }])).toEqual(cs);
  });

  it('an empty set reads as accepted (nothing to review)', () => {
    expect(deriveChangeSetStatus([])).toBe('accepted');
  });

  it('a patch touching .githooks/ asks even with review off', () => {
    const ordinary = set(file('src/index.ts'));
    expect(changeSetNeedsReview(ordinary, { reviewEnabled: false })).toBe(false);

    const sensitiveFile: ChatChangedFile = {
      ...file('.githooks/pre-commit'),
      policyReason: 'A git hook runs on every commit.',
    };
    const sensitive = set(sensitiveFile);
    expect(changeSetNeedsReview(sensitive, { reviewEnabled: false })).toBe(true);
    expect(changeSetNeedsReview(sensitive, { reviewEnabled: true })).toBe(true);
  });
});

describe('chat helpers', () => {
  it('titles a chat from the first non-empty line, trimmed', () => {
    expect(chatTitleFromText('\n\n  Fix the login bug  \nmore')).toBe('Fix the login bug');
    expect(chatTitleFromText('   ')).toBe('New chat');
    expect(chatTitleFromText('x'.repeat(100))).toHaveLength(48);
    expect(chatTitleFromText('x'.repeat(100)).endsWith('…')).toBe(true);
  });

  it('names a chat worktree branch from its title and id', () => {
    expect(chatWorktreeBranch('Fix the login bug', 'a1b2c3d4-e5f6')).toBe('chat/fix-the-login-bug-a1b2c3');
    expect(chatWorktreeBranch('New chat', 'ffeedd00')).toBe('chat/ffeedd');
    expect(chatWorktreeBranch('Café: ünïcode / slashes!!', 'X-Y-Z-1-2-3')).toBe('chat/cafe-unicode-slashes-xyz123');
    expect(chatWorktreeBranch('x'.repeat(80), 'abcdef')).toBe(`chat/${'x'.repeat(32)}-abcdef`);
  });

  it('reads a chat stored before worktrees existed', () => {
    const parsed = ChatSchema.parse({
      id: 'c', title: 't', engine: 'claude', model: null, mode: 'edit', repoId: null, repoName: null,
      pinned: false, createdAt: 1, updatedAt: 1, repoPath: null, messages: [],
    });
    expect(parsed.worktree).toBeUndefined();
  });

  it('buckets by age', () => {
    const now = 100 * 86_400_000;
    expect(chatDateBucket(now - 1000, now)).toBe('today');
    expect(chatDateBucket(now - 3 * 86_400_000, now)).toBe('week');
    expect(chatDateBucket(now - 20 * 86_400_000, now)).toBe('month');
    expect(chatDateBucket(now - 90 * 86_400_000, now)).toBe('older');
  });
});

describe('chats wire contract', () => {
  it('has its channels, namespaced and unique', () => {
    const names = Object.entries(CHANNELS)
      .filter(([k]) => k.startsWith('chats'))
      .map(([, v]) => v);
    expect(names.length).toBe(11);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.startsWith('mstudio:chats:'))).toBe(true);
    expect(EVENT_CHANNELS.chatsEvent).toBe('mstudio:chats:event');
  });

  it('defaults the composer picker requests to no repo and no chat', () => {
    expect(schemas.ChatsSkillsRequest.parse({ engine: 'claude' })).toEqual({ engine: 'claude', repoId: null });
    expect(schemas.ChatsFilesRequest.parse({})).toEqual({ repoId: null, chatId: null });
    expect(() => schemas.ChatsSkillsRequest.parse({ engine: '' })).toThrow();
    expect(schemas.ChatsSkillsResponse.parse({ ok: true, value: { skills: [{ name: 'x', description: '', scope: 'plugin' }] } }).ok).toBe(true);
  });

  it('defaults a created chat to edit mode with no model or repo', () => {
    expect(schemas.ChatsCreateRequest.parse({ engine: 'claude' })).toEqual({
      engine: 'claude',
      model: null,
      mode: 'edit',
      repoId: null,
    });
  });

  it('rejects an empty decisions list and an unknown action', () => {
    expect(schemas.ChatsResolveChangesRequest.safeParse({ chatId: 'c', changeSetId: 's', decisions: [] }).success).toBe(false);
    expect(
      schemas.ChatsResolveChangesRequest.safeParse({ chatId: 'c', changeSetId: 's', decisions: [{ path: 'a', action: 'merge' }] })
        .success,
    ).toBe(false);
  });

  it('parses a minimal stored chat with defaults filled in', () => {
    const chat = ChatSchema.parse({
      id: 'c1',
      title: 't',
      engine: 'claude',
      model: null,
      mode: 'ask',
      repoId: null,
      repoName: null,
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      repoPath: null,
      messages: [{ id: 'm', role: 'user', text: 'hi', createdAt: 1 }],
    });
    expect(chat.session).toBeNull();
    expect(chat.messages[0]!.status).toBe('done');
  });
});

describe('unified session view (Phase 146 Theme A)', () => {
  it('validates UnifiedSessionViewModeSchema and ProviderSyncTierSchema', () => {
    expect(UnifiedSessionViewModeSchema.options).toEqual(['chat', 'terminal']);
    expect(UnifiedSessionViewModeSchema.safeParse('chat').success).toBe(true);
    expect(UnifiedSessionViewModeSchema.safeParse('terminal').success).toBe(true);
    expect(UnifiedSessionViewModeSchema.safeParse('split').success).toBe(false);

    expect(ProviderSyncTierSchema.options).toEqual(['bidirectional', 'handoff-only', 'chat-only']);
    expect(ProviderSyncTierSchema.safeParse('bidirectional').success).toBe(true);
    expect(ProviderSyncTierSchema.safeParse('handoff-only').success).toBe(true);
    expect(ProviderSyncTierSchema.safeParse('chat-only').success).toBe(true);
    expect(ProviderSyncTierSchema.safeParse('none').success).toBe(false);
  });

  it('classifies agent sync tiers via getProviderSyncTier', () => {
    expect(getProviderSyncTier('claude')).toBe('bidirectional');
    expect(getProviderSyncTier('codex')).toBe('bidirectional');
    expect(getProviderSyncTier('agy')).toBe('bidirectional');
    expect(getProviderSyncTier('ollama')).toBe('chat-only');
    expect(getProviderSyncTier('cursor')).toBe('handoff-only');
    expect(getProviderSyncTier('aider')).toBe('handoff-only');
    expect(getProviderSyncTier('unknown-agent')).toBe('handoff-only');
  });

  it('keeps linkedTerminalId and preferredView optional and backwards-compatible on ChatSchema and ChatSummarySchema', () => {
    const baseSummary = {
      id: 'c1',
      title: 't',
      engine: 'claude',
      model: null,
      mode: 'edit' as const,
      repoId: null,
      repoName: null,
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      messageCount: 0,
      preview: '',
      running: false,
      pendingChanges: false,
    };
    const oldSummary = ChatSummarySchema.parse(baseSummary);
    expect(oldSummary.linkedTerminalId).toBeUndefined();
    expect(oldSummary.preferredView).toBeUndefined();

    const linkedSummary = ChatSummarySchema.parse({
      ...baseSummary,
      linkedTerminalId: 'term-1',
      preferredView: 'terminal',
    });
    expect(linkedSummary.linkedTerminalId).toBe('term-1');
    expect(linkedSummary.preferredView).toBe('terminal');

    const linkedChat = ChatSchema.parse({
      id: 'c1',
      title: 't',
      engine: 'claude',
      model: null,
      mode: 'edit',
      repoId: null,
      repoName: null,
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      repoPath: null,
      messages: [],
      linkedTerminalId: 'term-1',
      preferredView: 'chat',
    });
    expect(linkedChat.linkedTerminalId).toBe('term-1');
    expect(linkedChat.preferredView).toBe('chat');
    expect(ChatSchema.safeParse({ ...linkedChat, linkedTerminalId: '' }).success).toBe(false);
    expect(ChatSchema.safeParse({ ...linkedChat, preferredView: 'other' }).success).toBe(false);
  });

  it('wires session:switch-view channel and request/response schemas', () => {
    expect(CHANNELS.sessionSwitchView).toBe('mstudio:session:switch-view');
    expect(schemas.SessionSwitchViewRequest.parse({ sessionId: 's1', targetView: 'terminal' })).toEqual({
      sessionId: 's1',
      targetView: 'terminal',
      handoffMode: 'auto',
    });
    expect(
      schemas.SessionSwitchViewRequest.parse({ sessionId: 's1', targetView: 'chat', handoffMode: 'resume' }),
    ).toEqual({
      sessionId: 's1',
      targetView: 'chat',
      handoffMode: 'resume',
    });
    expect(schemas.SessionSwitchViewRequest.safeParse({ sessionId: '', targetView: 'chat' }).success).toBe(false);
    expect(schemas.SessionSwitchViewRequest.safeParse({ sessionId: 's1', targetView: 'invalid' }).success).toBe(false);
    expect(
      schemas.SessionSwitchViewResponse.parse({
        ok: true,
        value: { targetView: 'terminal', chatId: 'c1', terminalId: 't1', syncTier: 'bidirectional' },
      }).ok,
    ).toBe(true);
  });
});
