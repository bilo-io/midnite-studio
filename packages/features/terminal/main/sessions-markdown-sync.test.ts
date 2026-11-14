import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BUILTIN_AGENTS, type ClosedSession, type TerminalSession } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSessionsMarkdownSync,
  extractPreservedTail,
  renderSessionsMarkdown,
  type MarkdownSnapshot,
} from './sessions-markdown-sync';

function makeSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'sess-1',
    kind: 'agent',
    agentId: 'claude',
    title: 'Fix bug | urgent\nnow',
    cwd: '/Users/me/Dev/midnite-studio',
    repoId: 'repo-1',
    createdAt: Date.UTC(2026, 10, 14, 10, 0),
    ...overrides,
  };
}

function makeClosed(overrides: Partial<ClosedSession> = {}): ClosedSession {
  return {
    id: 'closed-1',
    kind: 'agent',
    agentId: 'codex',
    title: 'Closed task',
    cwd: '/Users/me/Dev/midnite-studio',
    repoId: 'repo-1',
    createdAt: Date.UTC(2026, 10, 14, 9, 0),
    closedAt: Date.UTC(2026, 10, 14, 9, 30),
    exitCode: 0,
    reason: 'exited',
    transcriptBytes: 120,
    ...overrides,
  };
}

describe('renderSessionsMarkdown and extractPreservedTail', () => {
  it('renders active, asleep, shell, detached, and closed sessions with exact resume commands', () => {
    const snapshot: MarkdownSnapshot = {
      now: Date.UTC(2026, 10, 14, 12, 0),
      agents: [...BUILTIN_AGENTS],
      active: [
        {
          session: makeSession({
            id: 'a1',
            agentId: 'claude',
            agentConversationId: 'b6f784d3-9702-4202-8d5e-ab7344aac211',
            title: 'Line1\nLine2 | pipe',
          }),
          live: { pid: 1234, legacy: false },
          exitCode: null,
        },
        {
          session: makeSession({
            id: 'a2',
            agentId: 'agy',
            agentConversationId: '50ed5e0a-230d-4806-aaf1-21fc70805e27',
            asleep: true,
          }),
          live: null,
          exitCode: null,
        },
        {
          session: makeSession({
            id: 'a3',
            kind: 'shell',
            agentId: undefined,
            title: 'zsh',
          }),
          live: { pid: 5678, legacy: false },
          exitCode: null,
        },
        {
          session: makeSession({
            id: 'a4',
            agentId: 'codex',
            agentConversationId: 'rollout-999',
            title: 'Legacy',
          }),
          live: { pid: 9999, legacy: true },
          exitCode: null,
        },
      ],
      closed: [
        makeClosed({
          id: 'c1',
          agentId: 'codex',
          agentConversationId: 'rollout-123',
        }),
      ],
    };

    const md = renderSessionsMarkdown(snapshot, '## Outside Midnite Studio Brokers\n\n- Custom');

    expect(md).toContain('# Midnite Studio Sessions');
    expect(md).toContain('🟢 running');
    expect(md).toContain('🟡 asleep');
    expect(md).toContain('⚪ shell');
    expect(md).toContain('Line1 Line2 \\| pipe');
    expect(md).toContain('`cd /Users/me/Dev/midnite-studio && claude --resume b6f784d3-9702-4202-8d5e-ab7344aac211`');
    expect(md).toContain('`cd /Users/me/Dev/midnite-studio && agy --conversation 50ed5e0a-230d-4806-aaf1-21fc70805e27`');
    expect(md).toContain('`cd /Users/me/Dev/midnite-studio`');
    expect(md).toContain('## Detached / Retired Broker Sessions');
    expect(md).toContain('`cd /Users/me/Dev/midnite-studio && codex resume rollout-999`');
    expect(md).toContain('`cd /Users/me/Dev/midnite-studio && codex resume rollout-123`');
    expect(md).toContain('<!-- midnite-studio:end -->');
    expect(md).toContain('## Outside Midnite Studio Brokers\n\n- Custom');
  });

  it('omits Detached / Retired Broker Sessions when empty and caps closed sessions at 15', () => {
    const closed: ClosedSession[] = Array.from({ length: 20 }, (_, i) =>
      makeClosed({
        id: `c-${i}`,
        title: `Task ${i}`,
        closedAt: Date.UTC(2026, 10, 14, 0, i),
      }),
    );

    const md = renderSessionsMarkdown({
      now: Date.UTC(2026, 10, 14, 12, 0),
      agents: [...BUILTIN_AGENTS],
      active: [],
      closed,
    });

    expect(md).not.toContain('## Detached / Retired Broker Sessions');
    expect(md).toContain('Task 19');
    expect(md).toContain('Task 5');
    expect(md).not.toContain('Task 4');
  });

  it('extracts preserved tail both with marker and from pre-existing heading without marker', () => {
    const withMarker = '# Title\n\n<!-- midnite-studio:end -->\n\n## Outside Midnite Studio Brokers\n\nhello\n';
    expect(extractPreservedTail(withMarker)).toBe('## Outside Midnite Studio Brokers\n\nhello');

    const withoutMarker = '# Title\n\n## Active Sessions\n...\n\n## Outside Midnite Studio Brokers\n\nlegacy note\n';
    expect(extractPreservedTail(withoutMarker)).toBe('## Outside Midnite Studio Brokers\n\nlegacy note');

    expect(extractPreservedTail('# Title\n\nNo outside section\n')).toBeNull();
  });
});

describe('createSessionsMarkdownSync', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sessions-md-sync-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  it('is a no-op when targetPath is null or empty', async () => {
    const readSnapshot = vi.fn<() => Promise<MarkdownSnapshot>>();
    const syncNull = createSessionsMarkdownSync({
      targetPath: null,
      readSnapshot,
      log: vi.fn(),
    });
    syncNull.schedule();
    await syncNull.flush();

    const syncEmpty = createSessionsMarkdownSync({
      targetPath: '   ',
      readSnapshot,
      log: vi.fn(),
    });
    syncEmpty.schedule();
    await syncEmpty.flush();

    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it('is a no-op when parent directory is missing and requireExistingParentDir is true', async () => {
    const missingTarget = join(root, 'does-not-exist', 'MIDNITE_SESSIONS.md');
    const readSnapshot = vi.fn<() => Promise<MarkdownSnapshot>>();
    const log = vi.fn();

    const sync = createSessionsMarkdownSync({
      targetPath: missingTarget,
      readSnapshot,
      log,
    });
    await sync.flush();

    expect(readSnapshot).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('writes atomically, preserves tail, and leaves no .tmp files behind', async () => {
    const targetPath = join(root, 'MIDNITE_SESSIONS.md');
    await writeFile(targetPath, '# Old\n\n## Outside Midnite Studio Brokers\n\nkeep me\n', 'utf8');

    const sync = createSessionsMarkdownSync({
      targetPath,
      readSnapshot: async () => ({
        now: Date.UTC(2026, 10, 14, 12, 0),
        agents: [...BUILTIN_AGENTS],
        active: [{ session: makeSession(), live: { pid: 42, legacy: false }, exitCode: null }],
        closed: [],
      }),
      log: vi.fn(),
    });

    await sync.flush();

    const content = await readFile(targetPath, 'utf8');
    expect(content).toContain('# Midnite Studio Sessions');
    expect(content).toContain('keep me');
    const files = await readdir(root);
    expect(files).toEqual(['MIDNITE_SESSIONS.md']);
  });

  it('coalesces rapid schedule() calls into one write after debounceMs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const targetPath = join(root, 'MIDNITE_SESSIONS.md');
    const readSnapshot = vi.fn<() => Promise<MarkdownSnapshot>>(async () => ({
      now: Date.UTC(2026, 10, 14, 12, 0),
      agents: [...BUILTIN_AGENTS],
      active: [],
      closed: [],
    }));

    const sync = createSessionsMarkdownSync({
      targetPath,
      debounceMs: 500,
      readSnapshot,
      log: vi.fn(),
    });

    sync.schedule();
    sync.schedule();
    sync.schedule();

    expect(readSnapshot).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(async () => {
      const content = await readFile(targetPath, 'utf8');
      expect(content).toContain('# Midnite Studio Sessions');
    });
    expect(readSnapshot).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels pending writes and prevents in-flight snapshots from writing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const targetPath = join(root, 'MIDNITE_SESSIONS.md');

    let resolveSnapshot!: (snapshot: MarkdownSnapshot) => void;
    let markEntered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const readSnapshot = vi.fn<() => Promise<MarkdownSnapshot>>(() => {
      markEntered();
      return new Promise((resolve) => {
        resolveSnapshot = resolve;
      });
    });

    const sync = createSessionsMarkdownSync({
      targetPath,
      debounceMs: 200,
      readSnapshot,
      log: vi.fn(),
    });

    sync.schedule();
    sync.stop();
    await vi.advanceTimersByTimeAsync(300);
    expect(readSnapshot).not.toHaveBeenCalled();

    // Also test in-flight snapshot aborted by stop()
    const sync2 = createSessionsMarkdownSync({
      targetPath,
      readSnapshot,
      log: vi.fn(),
    });
    const flushPromise = sync2.flush();
    await enteredPromise;
    sync2.stop();
    resolveSnapshot({
      now: Date.UTC(2026, 10, 14, 12, 0),
      agents: [...BUILTIN_AGENTS],
      active: [],
      closed: [],
    });
    await flushPromise;

    const files = await readdir(root);
    expect(files).toEqual([]);
  });

  it('serializes concurrent flush() calls cleanly', async () => {
    const targetPath = join(root, 'MIDNITE_SESSIONS.md');
    let count = 0;
    const sync = createSessionsMarkdownSync({
      targetPath,
      readSnapshot: async () => {
        count += 1;
        return {
          now: Date.UTC(2026, 10, 14, 12, count),
          agents: [...BUILTIN_AGENTS],
          active: [
            {
              session: makeSession({ title: `Run ${count}` }),
              live: { pid: count, legacy: false },
              exitCode: null,
            },
          ],
          closed: [],
        };
      },
      log: vi.fn(),
    });

    await Promise.all([sync.flush(), sync.flush(), sync.flush()]);

    const content = await readFile(targetPath, 'utf8');
    expect(content).toContain('Run 3');
    const files = await readdir(root);
    expect(files).toEqual(['MIDNITE_SESSIONS.md']);
  });
});
