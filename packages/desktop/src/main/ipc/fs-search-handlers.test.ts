import { afterEach, describe, expect, it, vi } from 'vitest';

const { resolveWorkdir, readGrep } = vi.hoisted(() => ({
  resolveWorkdir: vi.fn(),
  readGrep: vi.fn(),
}));
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('../repo-registry', () => ({ resolveWorkdir }));
vi.mock('@midnite/git-engine', () => ({ readGrep }));

const base = { repoId: 'r1', query: 'foo', mode: 'fixed' as const, caseSensitive: false, wholeWord: false };

describe('fs search handler (Phase 24 Theme E)', () => {
  afterEach(() => {
    resolveWorkdir.mockReset();
    readGrep.mockReset();
  });

  it('refuses when the repo is no longer open', async () => {
    resolveWorkdir.mockResolvedValue(null);
    const searchForTest = await importSearchHandler();
    const result = await searchForTest(base);
    expect(result).toEqual({ ok: false, message: 'That repository is no longer open.' });
    expect(readGrep).not.toHaveBeenCalled();
  });

  it('passes the resolved cwd and every option through to readGrep', async () => {
    resolveWorkdir.mockResolvedValue('/repo/checkout');
    readGrep.mockResolvedValue({ ok: true, matches: [] });
    const searchForTest = await importSearchHandler();
    await searchForTest({ ...base, worktreePath: '/repo/wt', wholeWord: true });

    expect(resolveWorkdir).toHaveBeenCalledWith('r1', '/repo/wt');
    expect(readGrep).toHaveBeenCalledWith('/repo/checkout', {
      query: 'foo',
      mode: 'fixed',
      caseSensitive: false,
      wholeWord: true,
      maxPerFile: 50,
    });
  });

  it('passes a readGrep error straight through', async () => {
    resolveWorkdir.mockResolvedValue('/repo/checkout');
    readGrep.mockResolvedValue({ ok: false, message: 'invalid pattern' });
    const searchForTest = await importSearchHandler();
    const result = await searchForTest(base);
    expect(result).toEqual({ ok: false, message: 'invalid pattern' });
  });

  it('truncates past FS_SEARCH_MAX_MATCHES and flags it', async () => {
    resolveWorkdir.mockResolvedValue('/repo/checkout');
    const matches = Array.from({ length: 2001 }, (_, i) => ({ path: 'a.txt', line: i + 1, text: 'foo' }));
    readGrep.mockResolvedValue({ ok: true, matches });
    const searchForTest = await importSearchHandler();
    const result = await searchForTest(base);
    expect(result.ok).toBe(true);
    expect(result.ok && result.matches).toHaveLength(2000);
    expect(result.ok && result.truncated).toBe(true);
  });

  it('does not flag truncation when the count lands exactly at the cap', async () => {
    resolveWorkdir.mockResolvedValue('/repo/checkout');
    const matches = Array.from({ length: 2000 }, (_, i) => ({ path: 'a.txt', line: i + 1, text: 'foo' }));
    readGrep.mockResolvedValue({ ok: true, matches });
    const searchForTest = await importSearchHandler();
    const result = await searchForTest(base);
    expect(result.ok && result.truncated).toBe(false);
    expect(result.ok && result.matches).toHaveLength(2000);
  });
});

type SearchResult =
  | { ok: true; matches: { path: string; line: number; text: string }[]; truncated: boolean }
  | { ok: false; message: string };

async function importSearchHandler() {
  const { CHANNELS } = await import('@midnite/git-shared');
  const { registerFsSearchHandlers } = await import('./fs-search-handlers');
  const ipcMain = (await import('electron')).ipcMain as unknown as { handle: ReturnType<typeof vi.fn> };
  ipcMain.handle.mockClear();
  registerFsSearchHandlers();
  const calls = ipcMain.handle.mock.calls as [string, (event: unknown, raw: unknown) => unknown][];
  const call = calls.find(([channel]) => channel === CHANNELS.fsSearch);
  if (!call) throw new Error('no handler registered for fsSearch');
  return (payload: unknown) => call[1](undefined, payload) as Promise<SearchResult>;
}
