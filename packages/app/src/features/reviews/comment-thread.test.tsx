import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FileDiff, ForgeReviewThread } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommentThread } from './comment-thread';

afterEach(cleanup);

const readFile = vi.fn();
const writeFile = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ fs: { readFile, writeFile } }),
  hasBridge: () => true,
}));

/**
 * A three-line function, lines 1-3 in both the diff and the local
 * checkout — the shared shape every test in this file starts from.
 */
const MATCHING_LOCAL = ['function greet() {', "  console.log('hi');", '}'].join('\n');

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: 'src/greet.ts',
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    insertions: 0,
    deletions: 0,
    contextLines: 3,
    combined: false,
    truncated: false,
    droppedLines: 0,
    hunks: [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        heading: '',
        lines: [
          { kind: 'ctx', oldNo: 1, newNo: 1, text: 'function greet() {', ranges: [], noNewline: false },
          {
            kind: 'add',
            oldNo: null,
            newNo: 2,
            text: "  console.log('hi');",
            ranges: [],
            noNewline: false,
          },
          { kind: 'ctx', oldNo: 3, newNo: 3, text: '}', ranges: [], noNewline: false },
        ],
      },
    ],
    ...overrides,
  };
}

function thread(overrides: Partial<ForgeReviewThread> = {}): ForgeReviewThread {
  return {
    id: 'thread-1',
    path: 'src/greet.ts',
    line: 2,
    originalLine: 2,
    startLine: null,
    side: 'RIGHT',
    resolved: false,
    outdated: false,
    fileLevel: false,
    comments: [
      {
        id: 'c1',
        databaseId: '1',
        author: 'reviewer',
        body: ["let's log a name too:", '', '```suggestion', "  console.log('hi, name');", '```'].join(
          '\n',
        ),
        createdAt: '2026-09-01T00:00:00Z',
        url: '',
      },
    ],
    ...overrides,
  };
}

function renderThread(t: ForgeReviewThread, f: FileDiff | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommentThread
        threads={[t]}
        line={2}
        onReply={vi.fn(async () => true)}
        onResolve={vi.fn()}
        file={f}
        repoId="repo-1"
        worktreePath="/repo/widgets"
      />
    </QueryClientProvider>,
  );
}

describe('CommentThread — suggestion Apply (Phase 48)', () => {
  beforeEach(() => {
    readFile.mockReset();
    writeFile.mockReset();
  });

  it('renders the suggestion as a removed/added preview, matching the diff and the fence exactly', () => {
    readFile.mockResolvedValue({
      kind: 'text',
      content: MATCHING_LOCAL,
      size: MATCHING_LOCAL.length,
      version: { mtimeMs: 1, size: MATCHING_LOCAL.length },
    });
    renderThread(thread(), file());

    expect(screen.getByText((_, el) => el?.children.length === 0 && el.textContent === "  console.log('hi');")).toBeDefined();
    expect(screen.getByText((_, el) => el?.children.length === 0 && el.textContent === "  console.log('hi, name');")).toBeDefined();
  });

  it('an exact local match enables Apply; clicking writes the spliced content and nothing else', async () => {
    readFile.mockResolvedValue({
      kind: 'text',
      content: MATCHING_LOCAL,
      size: MATCHING_LOCAL.length,
      version: { mtimeMs: 1, size: MATCHING_LOCAL.length },
    });
    writeFile.mockResolvedValue({ ok: true });

    renderThread(thread(), file());

    const button = await screen.findByRole('button', { name: 'Apply suggestion' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(button);

    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));
    expect(writeFile).toHaveBeenCalledWith({
      scope: 'repo',
      repoId: 'repo-1',
      worktreePath: '/repo/widgets',
      relPath: 'src/greet.ts',
      content: ['function greet() {', "  console.log('hi, name');", '}'].join('\n'),
      expectedVersion: { mtimeMs: 1, size: MATCHING_LOCAL.length },
    });
    // Applying never stages/commits/resolves — the write channel is the only
    // side effect, and this is the whole point of Theme D's scope guardrail.
    expect(writeFile).toHaveBeenCalledTimes(1);

    await screen.findByText('Applied');
  });

  it('a local edit at the target line disables Apply with the divergence reason', async () => {
    const diverged = ['function greet() {', "  console.log('bye');", '}'].join('\n');
    readFile.mockResolvedValue({
      kind: 'text',
      content: diverged,
      size: diverged.length,
      version: { mtimeMs: 1, size: diverged.length },
    });

    renderThread(thread(), file());

    const button = await screen.findByRole('button', { name: 'Apply suggestion' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(button.title).toBe('this file has changed since the suggestion was written');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('an outdated thread disables Apply, even with matching local content', async () => {
    readFile.mockResolvedValue({
      kind: 'text',
      content: MATCHING_LOCAL,
      size: MATCHING_LOCAL.length,
      version: { mtimeMs: 1, size: MATCHING_LOCAL.length },
    });

    renderThread(thread({ outdated: true }), file());

    const button = await screen.findByRole('button', { name: 'Apply suggestion' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(button.title).toBe('this thread is no longer part of the diff');
  });

  it('a file deleted locally disables Apply', async () => {
    readFile.mockResolvedValue({ kind: 'error', message: 'ENOENT' });

    renderThread(thread(), file());

    const button = await screen.findByRole('button', { name: 'Apply suggestion' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(button.title).toBe('the file no longer exists locally');
  });

  it('a LEFT-side thread never offers Apply at all, even with a suggestion fence', () => {
    readFile.mockResolvedValue({
      kind: 'text',
      content: MATCHING_LOCAL,
      size: MATCHING_LOCAL.length,
      version: { mtimeMs: 1, size: MATCHING_LOCAL.length },
    });

    renderThread(thread({ side: 'LEFT' }), file());

    expect(screen.queryByRole('button', { name: 'Apply suggestion' })).toBeNull();
    // The suggestion block still renders as a preview — LEFT-side just drops
    // the affordance, it does not hide the comment's own content.
    expect(screen.getByText((_, el) => el?.children.length === 0 && el.textContent === "  console.log('hi, name');")).toBeDefined();
  });

  it('the write always targets the thread\'s own path verbatim — no path built or joined in the renderer', async () => {
    readFile.mockResolvedValue({
      kind: 'text',
      content: MATCHING_LOCAL,
      size: MATCHING_LOCAL.length,
      version: { mtimeMs: 1, size: MATCHING_LOCAL.length },
    });
    writeFile.mockResolvedValue({ ok: true });

    renderThread(thread({ path: 'packages/app/src/weird path/../file.ts' }), {
      ...file(),
      path: 'packages/app/src/weird path/../file.ts',
    });

    const button = await screen.findByRole('button', { name: 'Apply suggestion' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);

    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));
    expect(writeFile.mock.calls[0]![0].relPath).toBe('packages/app/src/weird path/../file.ts');
  });
});
